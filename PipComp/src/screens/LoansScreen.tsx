// src/screens/LoansScreen.tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { Amount, Card, Eyebrow, TopBar } from '../components/ui';
import { shortDate } from '../lib/dates';
import { DEFAULT_PRODUCTS } from '../lib/loans';
import type { Repayment, RepaymentStatus } from '../db/loansRepo';
import { useAppData } from '../state/store';
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
  const { kyc, loanProducts, loanApplications, repayments, repaymentSummary, recordRepayment, missRepayment, reportDefault } =
    useAppData();

  const products = loanProducts.length > 0 ? loanProducts : DEFAULT_PRODUCTS;

  const [repayBusy, setRepayBusy] = useState<string | null>(null);
  const [repayMsg, setRepayMsg] = useState('');
  const [repayError, setRepayError] = useState('');
  const [missBusy, setMissBusy] = useState<string | null>(null);
  const [missMsg, setMissMsg] = useState('');
  const [missError, setMissError] = useState('');
  const [defaultBusy, setDefaultBusy] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState('');

  const activeApplications = useMemo(
    () => loanApplications.filter((a) => a.status === 'active'),
    [loanApplications]
  );

  // Demo beat 1: simulate the next scheduled repayment being paid on time.
  const nextScheduled = useMemo(
    () => repayments.find((r) => r.status === 'scheduled'),
    [repayments]
  );

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

  // Demo beat 1b: simulate skipping the next installment  dents the track record (and score)
  // without paying down the loan liability.
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

  // Demo beat 2: simulate a default being reported (mock CTOS placeholder).
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

  const productLabel = (productId: string) => products.find((p) => p.id === productId)?.label ?? productId;

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
        {repayments.length === 0 && activeApplications.length === 0 && (
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

        {/* 3. Repayment schedule */}
        {repayments.length > 0 && (
          <>
            <View style={[styles.eyebrowRow, { marginTop: 22 }]}>
              <Eyebrow>Repayment schedule</Eyebrow>
              <InfoButton entry="repayment_schedule" />
            </View>
            <Card style={{ overflow: 'hidden' }}>
              {repayments.map((r, idx) => (
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
              Track record so far: {repaymentSummary.onTime} of {repaymentSummary.total} repayments on time.
            </Text>
          </>
        )}

        {/* 3.5 Post-disbursement check-in (Brief S) */}
        {activeApplications.length > 0 && (
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

        {/* 4. Demo beats  only meaningful once a real loan exists (booked via the Credit Passport). */}
        {activeApplications.length > 0 && (
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
                {nextScheduled
                  ? `Mark your next scheduled repayment (due ${shortDate(nextScheduled.dueDate)}, ${'RM' + Math.round(nextScheduled.amount).toLocaleString('en-MY')}) as paid on time. Your repayment-history factor, and your Pip Score. Should move. Re-open Credit to confirm.`
                  : 'All scheduled repayments are settled. Re-open Credit to see how your track record moved your Pip Score.'}
              </Text>
              {nextScheduled && (
                <Pressable
                  onPress={() => simulateOnTimeRepayment(nextScheduled)}
                  style={[styles.applyBtn, { backgroundColor: colors.accentInk }]}
                  disabled={repayBusy === nextScheduled.id}
                >
                  {repayBusy === nextScheduled.id ? (
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
                {nextScheduled
                  ? 'Skip your next installment. It dents your track record (and Pip Score) without paying down the loan — the opposite of an on-time payment. Re-open Credit to confirm.'
                  : 'No scheduled installments left to miss.'}
              </Text>
              {nextScheduled && (
                <Pressable
                  onPress={() => simulateMissed(nextScheduled)}
                  style={[styles.applyBtn, { backgroundColor: AMBER_BTN }]}
                  disabled={missBusy === nextScheduled.id}
                >
                  {missBusy === nextScheduled.id ? (
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
              <Text style={styles.demoBody}>
                Marks the loan defaulted (demo — no real bureau is notified).
              </Text>
              {activeApplications.map((app) => (
                <Pressable
                  key={app.id}
                  onPress={() => simulateDefault(app.id)}
                  style={[styles.applyBtn, { backgroundColor: RED, marginTop: 10 }]}
                  disabled={defaultBusy === app.id}
                >
                  {defaultBusy === app.id ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <>
                      <Icon name="alert" size={16} color={colors.onAccent} />
                      <Text style={styles.applyBtnText}>
                        Report default on {productLabel(app.productId)} (mock CTOS)
                      </Text>
                    </>
                  )}
                </Pressable>
              ))}
              {defaultError ? <Text style={[styles.muted, { marginTop: 10, color: RED }]}>{defaultError}</Text> : null}
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
});
