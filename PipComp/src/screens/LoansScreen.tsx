// src/screens/LoansScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { Amount, Card, Eyebrow, ProgressTrack, TopBar } from '../components/ui';
import { shortDate } from '../lib/dates';
import { DEFAULT_PRODUCTS } from '../lib/loans';
import { buildLoanPackages, financingTotals, type LoanPackage } from '../lib/loanSummary';
import { overdueRowsFor } from '../lib/repaymentStanding';
import type { Repayment, RepaymentStatus } from '../db/loansRepo';
import { useAppData } from '../state/store';
import { useLenderSyncPoll } from '../state/useLenderSyncPoll';
import { useCreditProfile } from '../state/useCreditProfile';
import { colors, uiFont } from '../theme';

const GREEN = '#1f8a5b';
const RED = '#c5402f';
const AMBER = '#a3791f';
// Darker amber for filled buttons so white label text clears WCAG AA (AMBER itself is tuned
// for text-on-light, not as a button background under white text).
const AMBER_BTN = '#7c5a15';

function repaymentStatusColor(s: RepaymentStatus): string {
  if (s === 'paid') return GREEN;
  if (s === 'late') return AMBER;
  if (s === 'missed' || s === 'defaulted') return RED;
  return colors.ink3;
}

function repaymentStatusLabel(s: RepaymentStatus): string {
  if (s === 'paid') return 'Paid on time';
  if (s === 'late') return 'Paid late';
  if (s === 'missed') return 'Missed';
  if (s === 'defaulted') return 'Defaulted';
  return 'Scheduled';
}

/** One "package" card per loan (My Financing polish, 2026-07-19): lender + purpose + progress,
 *  never the raw per-installment list  tapping it is how you reach that loan's own schedule. */
function LoanPackageCard({ pkg, onPress }: { pkg: LoanPackage; onPress: () => void }) {
  const pct = pkg.tenorMonths > 0 ? (pkg.paidCount / pkg.tenorMonths) * 100 : 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pkgCard, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={`${pkg.lenderLabel}, ${pkg.purposeLabel}, open full schedule`}
    >
      <View style={styles.pkgRow}>
        <View style={styles.lenderBadge}>
          <Icon name="wallet" size={18} color={colors.accentInk} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pkgLender} numberOfLines={1}>{pkg.lenderLabel}</Text>
          <Text style={styles.pkgPurpose} numberOfLines={1}>{pkg.purposeLabel}</Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.ink3} />
      </View>

      {pkg.status === 'defaulted' ? (
        <View style={styles.pkgFooterRow}>
          <Amount value={pkg.outstandingPrincipal} size={16} />
          <View style={[styles.statusPill, { backgroundColor: '#fce8e6' }]}>
            <Text style={[styles.statusPillText, { color: RED }]}>Defaulted</Text>
          </View>
        </View>
      ) : pkg.status === 'settled' ? (
        <View style={styles.pkgFooterRow}>
          <Amount value={pkg.principal} size={16} />
          <View style={[styles.statusPill, { backgroundColor: colors.accentTint }]}>
            <Text style={[styles.statusPillText, { color: colors.accentInk }]}>Paid off</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.pkgFooterRow}>
            <Amount value={pkg.outstandingPrincipal} size={16} />
            <Text style={styles.pkgMuted}>outstanding</Text>
          </View>
          <View style={{ marginTop: 8 }}>
            <ProgressTrack pct={pct} height={5} />
            <Text style={styles.pkgMuted}>
              {pkg.paidCount} of {pkg.tenorMonths} paid · RM{Math.round(pkg.monthlyInstallment).toLocaleString('en-MY')}/mo
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

export function LoansScreen({
  onBack,
  onOpenKyc = () => {},
  onOpenPassport = () => {},
  onOpenCoach = () => {},
}: {
  onBack: () => void;
  onOpenKyc?: () => void;
  onOpenPassport?: () => void;
  onOpenCoach?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { kyc, loanProducts, loanApplications, repayments, recordRepayment, missRepayment, reportDefault, clearArrears, pullServicing, adoptApprovedOffers, syncLenderResets, markFinancingSeen } =
    useAppData();
  const { score } = useCreditProfile();

  const products = loanProducts.length > 0 ? loanProducts : DEFAULT_PRODUCTS;

  // Master/detail within this one screen (no new route): null shows the loan-package list,
  // an id drills into that loan's own full schedule + demo beats.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [repayBusy, setRepayBusy] = useState<string | null>(null);
  const [repayMsg, setRepayMsg] = useState('');
  const [repayError, setRepayError] = useState('');
  const [missBusy, setMissBusy] = useState<string | null>(null);
  const [missMsg, setMissMsg] = useState('');
  const [missError, setMissError] = useState('');
  const [defaultBusy, setDefaultBusy] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState('');
  const [clearBusy, setClearBusy] = useState(false);
  const [clearMsg, setClearMsg] = useState('');
  const [clearedForId, setClearedForId] = useState<string | null>(null);

  // Poll-on-focus (Bidirectional Servicing Sync, 2026-07-18 + approval-notify, 2026-07-19 +
  // reset-sync, 2026-07-20): this screen only ever mounts while the borrower is actually on it
  // (App.tsx swaps screens by conditional render, not a persistent navigator), so a mount
  // effect IS the focus signal. Order matters: clear any loan a lender reset has orphaned
  // FIRST (so a stale balance never flashes), then adopt any newly-approved financing, then
  // pull servicing events for what remains, then clear the unseen badge  the borrower is now
  // looking at My Financing, so nothing here is "unseen" anymore. `adoptApprovedOffers`
  // coalesces with the live poll below rather than no-op'ing, so the badge is never cleared
  // ahead of financing that is still being booked.
  useEffect(() => {
    (async () => {
      await syncLenderResets();
      await adoptApprovedOffers(score.score);
      await pullServicing();
      await markFinancingSeen();
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ...and keep checking while the borrower waits here: an officer approving or resetting
  // mid-demo should land in this list without needing to navigate away and back.
  useLenderSyncPoll(score.score);

  // One package per loan (My Financing polish, 2026-07-19): groups the flat, cross-lender
  // repayments list back into "TEKUN · Emergency", "Naga · Working capital", etc.
  const packages = useMemo(() => buildLoanPackages(loanApplications, repayments, products), [loanApplications, repayments, products]);
  const totals = useMemo(() => financingTotals(packages), [packages]);
  const ongoingPackages = useMemo(() => packages.filter((p) => p.status === 'ongoing'), [packages]);
  const settledPackages = useMemo(() => packages.filter((p) => p.status === 'settled'), [packages]);
  const defaultedPackages = useMemo(() => packages.filter((p) => p.status === 'defaulted'), [packages]);
  const selectedPackage = useMemo(() => (selectedId ? packages.find((p) => p.application.id === selectedId) ?? null : null), [packages, selectedId]);

  const simulateOnTimeRepayment = async (repayment: Repayment) => {
    setRepayBusy(repayment.id);
    setRepayMsg('');
    setRepayError('');
    try {
      await recordRepayment(repayment.id, true);
      setRepayMsg(
        `Marked the ${shortDate(repayment.dueDate)} repayment as paid on time. Open Credit to see how your track record affected your score.`
      );
    } catch (e) {
      setRepayError(e instanceof Error ? e.message : 'Could not record the repayment.');
    } finally {
      setRepayBusy(null);
    }
  };

  const simulateMissed = async (repayment: Repayment) => {
    setMissBusy(repayment.id);
    setMissMsg('');
    setMissError('');
    try {
      await missRepayment(repayment.id);
      setMissMsg(
        `Marked the ${shortDate(repayment.dueDate)} repayment as missed. Open Credit to see your track record take the hit.`
      );
    } catch (e) {
      setMissError(e instanceof Error ? e.message : 'Could not record the missed payment.');
    } finally {
      setMissBusy(null);
    }
  };

  const simulateDefault = async (applicationId: string) => {
    setDefaultBusy(applicationId);
    setDefaultError('');
    try {
      await reportDefault(applicationId);
    } catch (e) {
      setDefaultError(e instanceof Error ? e.message : 'Could not report the default.');
    } finally {
      setDefaultBusy(null);
    }
  };

  const handleClearArrears = async (applicationId: string) => {
    setClearBusy(true);
    setClearMsg('');
    try {
      await clearArrears(applicationId);
      setClearMsg('Arrears cleared — your access and rate discount are restored.');
      setClearedForId(applicationId);
    } finally {
      setClearBusy(false);
    }
  };

  // eKYC gate: applying for financing requires a verified identity.
  if (!kyc) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title="My Financing" onBack={onBack} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}>
          <Card style={styles.gateCard}>
            <Icon name="alert" size={30} color="#a05c00" />
            <Text style={styles.gateTitle}>Verify your identity to borrow</Text>
            <Text style={styles.gateBody}>
              Financing is offered against a verified identity. Complete a one-time identity
              check to see your offers and apply.
            </Text>
            <Pressable style={styles.gateBtn} onPress={onOpenKyc}>
              <Text style={styles.gateBtnText}>Verify identity</Text>
            </Pressable>
          </Card>
        </ScrollView>
      </View>
    );
  }

  // Detail: one loan's own full schedule + demo beats, scoped to it alone.
  if (selectedPackage) {
    const pkg = selectedPackage;
    const onTime = pkg.repayments.filter((r) => r.status === 'paid').length;
    const totalResolved = pkg.paidCount + pkg.missedCount;
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={pkg.lenderLabel} onBack={() => setSelectedId(null)} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          <Card style={{ padding: 16 }}>
            <View style={styles.pkgRow}>
              <View style={styles.lenderBadge}>
                <Icon name="wallet" size={20} color={colors.accentInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle}>{pkg.productLabel}</Text>
                <Text style={styles.pkgPurpose}>{pkg.purposeLabel} · {pkg.lenderLabel}</Text>
              </View>
            </View>
            <View style={{ marginTop: 16 }}>
              <Amount value={pkg.principal} size={22} />
              <Text style={styles.muted}>Principal disbursed</Text>
            </View>
            {pkg.tenorMonths > 0 && (
              <View style={{ marginTop: 14 }}>
                <ProgressTrack pct={(pkg.paidCount / pkg.tenorMonths) * 100} />
                <Text style={[styles.muted, { marginTop: 6 }]}>
                  {pkg.paidCount} of {pkg.tenorMonths} instalments paid · RM{Math.round(pkg.monthlyInstallment).toLocaleString('en-MY')}/mo
                </Text>
              </View>
            )}
          </Card>

          {/* Defaulted terminal state (Bidirectional Servicing Sync, 2026-07-18 design):
              `defaultedSource` tells apart a lender-reported default (synced in from the
              console) from this app's own simulate-default demo beat. */}
          {pkg.status === 'defaulted' && (
            <Card style={[styles.demoCard, { borderColor: RED, backgroundColor: '#fce8e6', marginTop: 14 }]}>
              <Text style={[styles.demoTitle, { color: RED }]}>Defaulted</Text>
              <Text style={[styles.demoBody, { color: RED }]}>
                {pkg.application.defaultedSource === 'lender'
                  ? `Reported as defaulted by ${pkg.lenderLabel}.`
                  : 'You reported this loan as defaulted (demo).'}{' '}
                This loan is written off and counts against your track record — it never rewrites a passport you've
                already signed, but the next one you mint will carry the lower score.
              </Text>
            </Card>
          )}

          {(() => {
            const pkgOverdue = overdueRowsFor(pkg.repayments, new Date());
            // Only the cure's own refresh (not a fresh miss) should read as "just cleared" --
            // otherwise falling behind again on this same loan would keep showing the stale
            // green confirmation instead of the new red banner + button.
            const justCleared = clearedForId === pkg.application.id && !!clearMsg && pkgOverdue.length === 0;
            if (pkgOverdue.length === 0 && !justCleared) return null;
            const amountOverdue = pkgOverdue.reduce((s, r) => s + r.amount, 0);
            return (
              <Card style={[styles.standingBanner, { borderColor: justCleared ? GREEN : RED }]}>
                {justCleared ? (
                  <Text style={[styles.standingTitle, { color: GREEN }]}>{clearMsg}</Text>
                ) : (
                  <>
                    <Text style={[styles.standingTitle, { color: RED }]}>
                      {pkgOverdue.length} month{pkgOverdue.length > 1 ? 's' : ''} behind — RM{Math.round(amountOverdue).toLocaleString('en-MY')} overdue
                    </Text>
                    <Text style={styles.standingBody}>
                      Paying this off restores your loan access and rate discount today. This event stays on
                      your record for 12 months even after it's cleared.
                    </Text>
                    <Pressable
                      onPress={() => handleClearArrears(pkg.application.id)}
                      disabled={clearBusy}
                      style={[styles.clearBtn, { backgroundColor: RED }]}
                    >
                      {clearBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.clearBtnText}>Pay off arrears</Text>}
                    </Pressable>
                  </>
                )}
              </Card>
            );
          })()}

          {pkg.repayments.length > 0 && (
            <>
              <View style={[styles.eyebrowRow, { marginTop: 22 }]}>
                <Eyebrow>Repayment schedule</Eyebrow>
                <InfoButton entry="repayment_schedule" />
              </View>
              <Card style={{ overflow: 'hidden' }}>
                {pkg.repayments.map((r, idx) => (
                  <View key={r.id} style={[styles.repayRow, idx > 0 && styles.repayDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.repayDate}>Due {shortDate(r.dueDate)}</Text>
                      <Text style={[styles.repayStatus, { color: repaymentStatusColor(r.status) }]}>
                        {repaymentStatusLabel(r.status)}
                        {r.paidOn ? ` · ${shortDate(r.paidOn)}` : ''}
                      </Text>
                    </View>
                    <Amount value={r.amount} size={15} />
                  </View>
                ))}
              </Card>
              <Text style={styles.muted}>
                Track record on this loan: {onTime} of {totalResolved} repayments on time.
              </Text>
            </>
          )}

          {/* Demo beats  only meaningful on a loan still being repaid. */}
          {pkg.status === 'ongoing' && (
            <>
              <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>Demo beats</Eyebrow>
              <Card style={[styles.demoCard, { borderColor: colors.accentSoft, backgroundColor: colors.accentTint }]}>
                <View style={styles.demoBadgeRow}>
                  <View style={styles.demoBadge}>
                    <Icon name="sparkles" size={12} color={colors.accentInk} />
                    <Text style={styles.demoBadgeText}>Demo</Text>
                  </View>
                  <Text style={styles.demoTitle}>Simulate on-time repayment → score rises</Text>
                </View>
                <Text style={styles.demoBody}>
                  {pkg.nextDue
                    ? `Mark your next scheduled repayment (due ${shortDate(pkg.nextDue.dueDate)}, ${'RM' + Math.round(pkg.nextDue.amount).toLocaleString('en-MY')}) as paid on time. Your repayment-history factor, and your Pip Score. Should move. Re-open Credit to confirm.`
                    : 'All scheduled repayments are settled. Re-open Credit to see how your track record moved your Pip Score.'}
                </Text>
                {pkg.nextDue && (
                  <Pressable
                    onPress={() => simulateOnTimeRepayment(pkg.nextDue!)}
                    style={[styles.applyBtn, { backgroundColor: colors.accentInk }]}
                    disabled={repayBusy === pkg.nextDue.id}
                  >
                    {repayBusy === pkg.nextDue.id ? (
                      <ActivityIndicator size="small" color={colors.onAccent} />
                    ) : (
                      <>
                        <Icon name="trending" size={16} color={colors.onAccent} />
                        <Text style={styles.applyBtnText}>Simulate on-time repayment</Text>
                      </>
                    )}
                  </Pressable>
                )}
                {repayMsg ? <Text style={[styles.muted, { marginTop: 10 }]}>{repayMsg}</Text> : null}
                {repayError ? <Text style={[styles.muted, { marginTop: 10, color: RED }]}>{repayError}</Text> : null}
              </Card>

              <Card style={[styles.demoCard, { marginTop: 12 }]}>
                <View style={styles.demoBadgeRow}>
                  <View style={[styles.demoBadge, { backgroundColor: '#fdecdc' }]}>
                    <Icon name="alert" size={12} color={AMBER} />
                    <Text style={[styles.demoBadgeText, { color: AMBER }]}>Demo</Text>
                  </View>
                  <Text style={styles.demoTitle}>Simulate a missed payment → score drops</Text>
                </View>
                <Text style={styles.demoBody}>
                  {pkg.nextDue
                    ? 'Skip your next installment. It dents your track record (and Pip Score) without paying down the loan — the opposite of an on-time payment. Re-open Credit to confirm.'
                    : 'No scheduled installments left to miss.'}
                </Text>
                {pkg.nextDue && (
                  <Pressable
                    onPress={() => simulateMissed(pkg.nextDue!)}
                    style={[styles.applyBtn, { backgroundColor: AMBER_BTN }]}
                    disabled={missBusy === pkg.nextDue.id}
                  >
                    {missBusy === pkg.nextDue.id ? (
                      <ActivityIndicator size="small" color={colors.onAccent} />
                    ) : (
                      <>
                        <Icon name="alert" size={16} color={colors.onAccent} />
                        <Text style={styles.applyBtnText}>Simulate missed payment</Text>
                      </>
                    )}
                  </Pressable>
                )}
                {missMsg ? <Text style={[styles.muted, { marginTop: 10 }]}>{missMsg}</Text> : null}
                {missError ? <Text style={[styles.muted, { marginTop: 10, color: RED }]}>{missError}</Text> : null}
              </Card>

              <Card style={[styles.demoCard, { marginTop: 12 }]}>
                <View style={styles.demoBadgeRow}>
                  <View style={[styles.demoBadge, { backgroundColor: '#fce8e6' }]}>
                    <Icon name="alert" size={12} color={RED} />
                    <Text style={[styles.demoBadgeText, { color: RED }]}>Demo</Text>
                  </View>
                  <Text style={styles.demoTitle}>Simulate default → reported to CTOS (mock)</Text>
                </View>
                <Text style={styles.demoBody}>Marks this loan defaulted (demo — no real bureau is notified).</Text>
                <Pressable
                  onPress={() => simulateDefault(pkg.application.id)}
                  style={[styles.applyBtn, { backgroundColor: RED, marginTop: 10 }]}
                  disabled={defaultBusy === pkg.application.id}
                >
                  {defaultBusy === pkg.application.id ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <>
                      <Icon name="alert" size={16} color={colors.onAccent} />
                      <Text style={styles.applyBtnText}>Report default on {pkg.productLabel} (mock CTOS)</Text>
                    </>
                  )}
                </Pressable>
                {defaultError ? <Text style={[styles.muted, { marginTop: 10, color: RED }]}>{defaultError}</Text> : null}
              </Card>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // List: stats on top, then one package card per loan.
  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="My Financing" onBack={onBack} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty state: nothing disbursed yet  applying happens on the Credit Passport. */}
        {packages.length === 0 && (
          <Card style={styles.gateCard}>
            <Icon name="trending" size={30} color={colors.accentInk} />
            <Text style={styles.gateTitle}>No financing yet</Text>
            <Text style={styles.gateBody}>
              When a lender approves you, the loan shows up here with its repayment schedule and
              track record. You apply straight from your Credit Passport.
            </Text>
            <Pressable style={styles.gateBtn} onPress={onOpenPassport}>
              <Text style={styles.gateBtnText}>Apply with your passport</Text>
            </Pressable>
            <Pressable style={styles.gateBtnSecondary} onPress={onOpenCoach}>
              <Text style={styles.gateBtnSecondaryText}>See what unlocks a loan</Text>
            </Pressable>
          </Card>
        )}

        {/* Summary stats (My Financing polish, 2026-07-19): the two numbers a borrower with
            several loans actually wants up top  what they owe per month in total, and how
            much principal is still outstanding. Scoped to ongoing loans only; a settled or
            defaulted loan isn't a live monthly obligation anymore (see financingTotals). */}
        {packages.length > 0 && (
          <View style={styles.statsRow}>
            <Card style={styles.statTile}>
              <Text style={styles.statLabel}>Monthly repayment</Text>
              <Amount value={totals.totalMonthlyRepayment} size={19} />
            </Card>
            <Card style={styles.statTile}>
              <Text style={styles.statLabel}>Total unpaid</Text>
              <Amount value={totals.totalUnpaidPrincipal} size={19} />
            </Card>
          </View>
        )}

        {ongoingPackages.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 4, marginBottom: 10 }}>Your loans</Eyebrow>
            {ongoingPackages.map((pkg) => (
              <LoanPackageCard key={pkg.application.id} pkg={pkg} onPress={() => setSelectedId(pkg.application.id)} />
            ))}
          </>
        )}

        {settledPackages.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>Paid off</Eyebrow>
            {settledPackages.map((pkg) => (
              <LoanPackageCard key={pkg.application.id} pkg={pkg} onPress={() => setSelectedId(pkg.application.id)} />
            ))}
          </>
        )}

        {defaultedPackages.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>Defaulted</Eyebrow>
            {defaultedPackages.map((pkg) => (
              <LoanPackageCard key={pkg.application.id} pkg={pkg} onPress={() => setSelectedId(pkg.application.id)} />
            ))}
          </>
        )}

        {/* Post-disbursement check-in (Brief S)  a fresh passport share, not tied to any one
            lender, so it lives at the list level rather than inside a specific loan's detail. */}
        {ongoingPackages.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>Keep your lender in the loop</Eyebrow>
            <Card style={{ padding: 16 }}>
              <Text style={styles.fieldLabel}>Share a check-in</Text>
              <Text style={styles.muted}>
                If you granted ongoing monitoring when you minted your passport, re-sharing a fresh one lets your
                lender see your updated numbers before a repayment is ever missed. The same signed passport, just
                current.
              </Text>
              <Pressable onPress={onOpenPassport} style={[styles.applyBtn, { backgroundColor: colors.accentInk }]}>
                <Icon name="trending" size={16} color={colors.onAccent} />
                <Text style={styles.applyBtnText}>Share a check-in</Text>
              </Pressable>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  gateCard: { padding: 24, alignItems: 'center', gap: 4 },
  gateTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink, marginTop: 12, textAlign: 'center' },
  gateBody: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  gateBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.accentInk, marginTop: 18, alignSelf: 'stretch' },
  gateBtnText: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.onAccent },
  gateBtnSecondary: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentSoft, marginTop: 10, alignSelf: 'stretch' },
  gateBtnSecondaryText: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.accentInk },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2, marginBottom: 8 },
  muted: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 8 },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: colors.accentInk,
  },
  applyBtnText: { fontFamily: uiFont(700), fontSize: 14, color: colors.onAccent },
  repayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  repayDivider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  repayDate: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink },
  repayStatus: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2 },
  demoCard: { padding: 16 },
  demoBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  demoBadgeText: { fontFamily: uiFont(700), fontSize: 11, color: colors.accentInk },
  demoTitle: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.ink, flex: 1 },
  demoBody: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 17, marginTop: 10 },
  detailTitle: { fontFamily: uiFont(700), fontSize: 16, color: colors.ink },

  // ── Stats row (My Financing polish, 2026-07-19) ──
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 4 },
  statTile: { flex: 1, padding: 14 },
  statLabel: { fontFamily: uiFont(600), fontSize: 11.5, color: colors.ink2, marginBottom: 6 },

  // ── Loan package card ──
  pkgCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line2,
    padding: 14,
    marginBottom: 10,
  },
  pkgRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lenderBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pkgLender: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.ink },
  pkgPurpose: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 1 },
  pkgFooterRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 12 },
  pkgMuted: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 6 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontFamily: uiFont(700), fontSize: 11.5 },

  // ── Standing banner / pay-off-arrears (repayment standing, 2026-07-21) ──
  standingBanner: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 14, backgroundColor: '#fdecea' },
  standingTitle: { fontFamily: uiFont(700), fontSize: 14, marginBottom: 4 },
  standingBody: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 18, marginBottom: 8 },
  clearBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  clearBtnText: { fontFamily: uiFont(700), fontSize: 13.5, color: '#fff' },
});
