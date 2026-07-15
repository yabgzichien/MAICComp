// src/screens/LoansScreen.tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Amount, Card, Eyebrow, TopBar } from '../components/ui';
import { TourAnchor } from '../components/TourAnchor';
import { shortDate } from '../lib/dates';
import { decideLoan, DEFAULT_PRODUCTS, type Decision, type LoanDecision, type LoanProduct } from '../lib/loans';
import { BORROWER_TOUR_STEPS, clampTourStep } from '../lib/tourSteps';
import type { Repayment, RepaymentStatus } from '../db/loansRepo';
import { useAppData } from '../state/store';
import { useCreditProfile } from '../state/useCreditProfile';
import { colors, uiFont } from '../theme';

const GREEN = '#1f8a5b';
const RED = '#c5402f';
const AMBER = '#a3791f';

function decisionColor(d: Decision): string {
  if (d === 'approve') return GREEN;
  if (d === 'refer') return AMBER;
  return RED;
}

function decisionLabel(d: Decision): string {
  if (d === 'approve') return 'Likely approved';
  if (d === 'refer') return 'Refer for review';
  return 'Likely declined';
}

function repaymentStatusColor(s: RepaymentStatus): string {
  if (s === 'paid') return GREEN;
  if (s === 'late') return AMBER;
  if (s === 'defaulted') return RED;
  return colors.ink3;
}

function repaymentStatusLabel(s: RepaymentStatus): string {
  if (s === 'paid') return 'Paid on time';
  if (s === 'late') return 'Paid late';
  if (s === 'defaulted') return 'Defaulted';
  return 'Scheduled';
}

export function LoansScreen({
  onBack,
  onOpenKyc = () => {},
  onOpenPassport = () => {},
}: {
  onBack: () => void;
  onOpenKyc?: () => void;
  onOpenPassport?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile, score, dataConfidence, coverage } = useCreditProfile();
  const { kyc, loanProducts, loanApplications, repayments, repaymentSummary, applyForLoan, recordRepayment, reportDefault, tourActive, tourStepIndex } =
    useAppData();
  const activeTourAnchor = tourActive ? BORROWER_TOUR_STEPS[clampTourStep(tourStepIndex, BORROWER_TOUR_STEPS.length)].anchorId ?? null : null;

  const products = loanProducts.length > 0 ? loanProducts : DEFAULT_PRODUCTS;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [requestedAmount, setRequestedAmount] = useState<number | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [lastResult, setLastResult] = useState<{ productId: string; decision: ReturnType<typeof decideLoan> } | null>(null);

  const [repayBusy, setRepayBusy] = useState<string | null>(null);
  const [repayMsg, setRepayMsg] = useState('');
  const [repayError, setRepayError] = useState('');
  const [defaultBusy, setDefaultBusy] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState('');

  // Preview decision per product, evaluated against the live score & affordability snapshot
  // including the same coverage-tier gate the real apply flow uses (store.applyForLoan), so a
  // tier card never shows a friendlier outcome than what applying would actually decide.
  // requestedAmount previewed at the product's max  shows the best-case offer for that tier.
  const previews = useMemo(
    () =>
      products.map((product) => ({
        product,
        decision: decideLoan({
          score: score.score,
          band: score.band,
          confidence: score.confidence,
          avgMonthlySurplus: profile.avgSurplus,
          monthlyDebtService: profile.monthlyDebtService,
          avgIncome: profile.avgIncome,
          requestedAmount: product.maxAmount,
          products: [product],
          coverageRatio: coverage.ratio,
          coverageDaysCovered: coverage.daysCovered,
          integrityFloorBreached: dataConfidence.integrityFloorBreached,
        }),
      })),
    [products, score, profile, coverage, dataConfidence]
  );

  const activeApplications = useMemo(
    () => loanApplications.filter((a) => a.status === 'active'),
    [loanApplications]
  );

  const selectedProduct: LoanProduct | undefined = selectedProductId
    ? products.find((p) => p.id === selectedProductId)
    : undefined;

  const stepAmount = (delta: number) => {
    if (!selectedProduct) return;
    setRequestedAmount((cur) => {
      const base = cur ?? selectedProduct.maxAmount;
      const next = Math.round(base + delta);
      return Math.max(selectedProduct.minAmount, Math.min(selectedProduct.maxAmount, next));
    });
  };

  // Pre-fills the requested amount at what the gated decision actually supports for this tier
  // (falling back to the tier max only when there's no supportable amount to anchor on, e.g. a
  // refer/decline preview), never the tier's raw ceiling  matches what apply would approve.
  const pickProduct = (product: LoanProduct, previewDecision: LoanDecision) => {
    setSelectedProductId(product.id);
    setRequestedAmount(previewDecision.maxAmount > 0 ? previewDecision.maxAmount : product.maxAmount);
    setLastResult(null);
    setApplyError('');
  };

  const submitApplication = async () => {
    if (!selectedProduct) return;
    const amount = requestedAmount ?? selectedProduct.maxAmount;
    setApplyBusy(true);
    setApplyError('');
    try {
      const { decision } = await applyForLoan(selectedProduct.id, amount, {
        score: score.score,
        band: score.band,
        confidence: score.confidence,
        avgMonthlySurplus: profile.avgSurplus,
        monthlyDebtService: profile.monthlyDebtService,
        avgIncome: profile.avgIncome,
        integrityFloorBreached: dataConfidence.integrityFloorBreached,
      });
      setLastResult({ productId: selectedProduct.id, decision });
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Could not submit the application.');
    } finally {
      setApplyBusy(false);
    }
  };

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
          <TopBar title="Loans" onBack={onBack} />
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
        <TopBar title="Loans" onBack={onBack} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Offers list */}
        <Eyebrow style={{ marginBottom: 10 }}>Offers for you</Eyebrow>
        <Text style={styles.intro}>
          Based on your Pip Score ({score.score} · {score.band}), here's what each tier would likely decide 
          tap one to apply.
        </Text>
        <TourAnchor id="loans-tier-stack" activeId={activeTourAnchor}>
        {previews.map(({ product, decision }) => {
          const selected = selectedProductId === product.id;
          const isExpanded = expanded.has(product.id);
          return (
            <Pressable key={product.id} onPress={() => pickProduct(product, decision)}>
              <Card style={selected ? [styles.offerCard, styles.offerCardSelected] : styles.offerCard}>
                <View style={styles.offerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.offerTitle}>{product.label}</Text>
                    <Text style={styles.offerSub}>
                      RM{product.minAmount.toLocaleString('en-MY')}–{product.maxAmount.toLocaleString('en-MY')} ·{' '}
                      {product.tenorMonths} mo · {Math.round(product.apr * 100)}% APR
                    </Text>
                  </View>
                  <View style={[styles.decisionPill, { backgroundColor: decisionColor(decision.decision) + '1a' }]}>
                    <Text style={[styles.decisionPillText, { color: decisionColor(decision.decision) }]}>
                      {decisionLabel(decision.decision)}
                    </Text>
                  </View>
                </View>
                {decision.maxAmount > 0 && (
                  <View style={styles.offerAmounts}>
                    <View>
                      <Text style={styles.amountLabel}>You'd likely qualify for</Text>
                      <Amount value={decision.maxAmount} size={18} />
                    </View>
                    <View>
                      <Text style={styles.amountLabel}>Est. installment</Text>
                      <Amount value={decision.installment} size={18} />
                      <Text style={styles.amountSuffix}>/mo</Text>
                    </View>
                  </View>
                )}
                {decision.reasons.length > 0 && (
                  <>
                    <Pressable onPress={() => toggleExpanded(product.id)} hitSlop={8} style={styles.readMoreRow}>
                      <Text style={styles.readMoreText}>{isExpanded ? 'Show less' : 'Read more'}</Text>
                      <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={14} color={colors.accent} />
                    </Pressable>
                    {isExpanded && (
                      <View style={styles.reasonsBlock}>
                        {decision.reasons.map((reason, idx) => (
                          <View key={idx} style={styles.reasonRow}>
                            <Icon name="dots" size={6} color={colors.ink3} />
                            <Text style={styles.reasonText}>{reason}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </Card>
            </Pressable>
          );
        })}
        </TourAnchor>

        {/* 2. Apply flow */}
        {selectedProduct && (
          <>
            <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>Apply for {selectedProduct.label}</Eyebrow>
            <Card style={{ padding: 16 }}>
              <Text style={styles.fieldLabel}>Requested amount</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={() => stepAmount(-500)}
                  style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
                >
                  <Icon name="chevronLeft" size={18} color={colors.accent} />
                </Pressable>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Amount value={requestedAmount ?? selectedProduct.maxAmount} size={22} />
                  <Text style={styles.stepperHint}>
                    RM{selectedProduct.minAmount.toLocaleString('en-MY')}–{selectedProduct.maxAmount.toLocaleString('en-MY')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => stepAmount(500)}
                  style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
                >
                  <Icon name="chevronRight" size={18} color={colors.accent} />
                </Pressable>
              </View>

              {applyError ? <Text style={[styles.muted, { color: RED }]}>{applyError}</Text> : null}

              <Pressable onPress={submitApplication} style={styles.applyBtn} disabled={applyBusy}>
                {applyBusy ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <>
                    <Icon name="check" size={16} color={colors.onAccent} />
                    <Text style={styles.applyBtnText}>Submit application</Text>
                  </>
                )}
              </Pressable>

              {lastResult && lastResult.productId === selectedProduct.id && (
                <View style={styles.resultBox}>
                  <View style={styles.offerHeader}>
                    <Text style={styles.offerTitle}>Decision</Text>
                    <View
                      style={[
                        styles.decisionPill,
                        { backgroundColor: decisionColor(lastResult.decision.decision) + '1a' },
                      ]}
                    >
                      <Text style={[styles.decisionPillText, { color: decisionColor(lastResult.decision.decision) }]}>
                        {decisionLabel(lastResult.decision.decision)}
                      </Text>
                    </View>
                  </View>
                  {lastResult.decision.maxAmount > 0 && (
                    <View style={styles.offerAmounts}>
                      <View>
                        <Text style={styles.amountLabel}>Approved amount</Text>
                        <Amount value={lastResult.decision.maxAmount} size={18} />
                      </View>
                      <View>
                        <Text style={styles.amountLabel}>Installment</Text>
                        <Amount value={lastResult.decision.installment} size={18} />
                        <Text style={styles.amountSuffix}>/mo</Text>
                      </View>
                    </View>
                  )}
                  <View style={{ marginTop: 10, gap: 5 }}>
                    {lastResult.decision.reasons.map((reason, idx) => (
                      <View key={idx} style={styles.reasonRow}>
                        <Icon name="dots" size={6} color={colors.ink3} />
                        <Text style={styles.reasonText}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Card>
          </>
        )}

        {/* 3. Repayment schedule */}
        {repayments.length > 0 && (
          <>
            <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>Repayment schedule</Eyebrow>
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

        {/* 4. Demo beats */}
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
              : 'Apply for a loan above to schedule repayments, then come back to simulate one being paid on time.'}
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
            <View style={[styles.demoBadge, { backgroundColor: '#fce8e6' }]}>
              <Icon name="alert" size={12} color={RED} />
              <Text style={[styles.demoBadgeText, { color: RED }]}>Demo</Text>
            </View>
            <Text style={styles.demoTitle}>Simulate default → reported to CTOS (mock)</Text>
          </View>
          <Text style={styles.demoBody}>
            Marks the loan defaulted (demo — no real bureau is notified).
          </Text>
          {activeApplications.length > 0 ? (
            activeApplications.map((app) => (
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
            ))
          ) : (
            <Text style={styles.muted}>Apply for a loan above to unlock this demo beat.</Text>
          )}
          {defaultError ? <Text style={[styles.muted, { marginTop: 10, color: RED }]}>{defaultError}</Text> : null}
        </Card>
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
  intro: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, lineHeight: 18, marginBottom: 12 },
  offerCard: { padding: 16, marginBottom: 12 },
  offerCardSelected: { borderColor: colors.accent, borderWidth: 1.5 },
  offerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  offerTitle: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.ink },
  offerSub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 2 },
  decisionPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  decisionPillText: { fontFamily: uiFont(700), fontSize: 11.5 },
  offerAmounts: { flexDirection: 'row', gap: 28, marginTop: 12 },
  amountLabel: { fontFamily: uiFont(600), fontSize: 11, color: colors.ink2, marginBottom: 2 },
  amountSuffix: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2 },
  readMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 12, alignSelf: 'flex-start' },
  readMoreText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.accent },
  reasonsBlock: { marginTop: 8, gap: 5, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line2 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 2 },
  reasonText: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, flex: 1, lineHeight: 17 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2, marginBottom: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  stepperHint: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2, marginTop: 2 },
  pressed: { transform: [{ scale: 0.92 }] },
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
  resultBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.line2 },
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
