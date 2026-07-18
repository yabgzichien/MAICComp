// src/screens/PassportScreen.tsx
// Two-phase flow (Brief I): the consent ceremony first  nothing mints on mount 
// then the signed passport card. Regenerate routes back through the ceremony.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { PipEmblem } from '../components/CoinMascot';
import { FadeIn } from '../components/Motion';
import { Icon } from '../components/Icon';
import { Amount, Card, TopBar } from '../components/ui';
import { getOrCreateKeypair } from '../crypto/keys';
import { issuerSign } from '../crypto/issuer';
import { buildPassport, type CreditPassport } from '../lib/passport';
import { buildConsentReceipts, buildPassportDraft, monitoringScopeRow, tier0ScopeRows, tier1ScopeRows, tier2ScopeRows } from '../lib/consentScopes';
import { useCreditProfile } from '../state/useCreditProfile';
import { useAppData } from '../state/store';
import { decideLoan, DEFAULT_PRODUCTS, type Decision } from '../lib/loans';
import { computeBorrowingLimit, outstandingExposure } from '../lib/borrowingLimit';
import { submitApplication, type DirectApplyResult } from '../lib/directApply';
import { fetchLenderDirectory, LENDER_API_BASE, type LenderProfile } from '../lib/lenderDirectory';
import { PURPOSE_CATEGORIES, PURPOSE_LABELS, type PurposeCategory } from '../lib/loanPurpose';
import { TourAnchor } from '../components/TourAnchor';
import { emitTourSignal } from '../lib/tourSignals';
import { BORROWER_TOUR_STEPS, clampTourStep } from '../lib/tourSteps';
import { PassportCeremonyScreen } from './PassportCeremonyScreen';
import { colors, numFont, platformShadow, uiFont } from '../theme';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

const DEC_GREEN = '#1f8a5b';
const DEC_RED = '#c5402f';
const DEC_AMBER = '#a3791f';

// Mirrors LoansScreen's decision copy exactly  the send card can never read as
// "auto-approved": the lender's engine decides, this only relays its verdict.
function decisionColor(d: Decision): string {
  if (d === 'approve') return DEC_GREEN;
  if (d === 'refer') return DEC_AMBER;
  return DEC_RED;
}

function decisionLabel(d: Decision): string {
  if (d === 'approve') return 'Likely approved';
  if (d === 'refer') return 'Refer for review';
  return 'Likely declined';
}

export function PassportScreen({ onBack, onOpenKyc = () => {}, onOpenLoans = () => {} }: { onBack: () => void; onOpenKyc?: () => void; onOpenLoans?: () => void }) {
  const insets = useSafeAreaInsets();
  const { profile, score, dataConfidence, coverage, momentum, coachInput, incomeQuality, spendingProfile, obligations } = useCreditProfile();
  const { kyc, occupation, loanApplications, loanProducts, repaymentSummary, accountValues, tourActive, tourStepIndex, acceptLenderOffer } = useAppData();
  const activeTourAnchor = tourActive ? BORROWER_TOUR_STEPS[clampTourStep(tourStepIndex, BORROWER_TOUR_STEPS.length)].anchorId ?? null : null;

  const [phase, setPhase] = useState<'consent' | 'minted'>('consent');
  const [includeIdentity, setIncludeIdentity] = useState(true);
  const [includeSpending, setIncludeSpending] = useState(true);
  const [includeMonitoring, setIncludeMonitoring] = useState(true);

  // Tier 3 monitoring (Brief S): offered whenever the borrower has an active loan, with the
  // grant's expiry drawn from that loan's own tenor. No active loan → no monitoring section,
  // the honest absence (mirrors momentum's own minimum-history floor pattern).
  const activeLoanTenorMonths = useMemo(() => {
    const active = loanApplications.find((a) => a.status === 'active');
    if (!active) return null;
    const products = loanProducts.length > 0 ? loanProducts : DEFAULT_PRODUCTS;
    const product = products.find((p) => p.id === active.productId);
    return product?.tenorMonths ?? null;
  }, [loanApplications, loanProducts]);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passport, setPassport] = useState<CreditPassport | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [issuerSignature, setIssuerSignature] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  // Direct-apply send (spec 2026-07-11; multi-lender 2026-07-16): the passport goes straight
  // to the chosen lender console's POST /api/apply. The borrower picks one of the published
  // lenders; the amount range + supportable pre-fill + eligibility all recompute against THAT
  // lender's package & policy, so raising the amount above what a given lender supports triggers
  // its counter-offer path. Amount pre-fills at the supportable amount so one tap still works.
  const [amount, setAmount] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<PurposeCategory>('working-capital');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendResult, setSendResult] = useState<DirectApplyResult | null>(null);
  const [booked, setBooked] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);

  // Published lender directory (GET /api/lenders). Fetched once on mount; a transport failure
  // leaves it empty and the send flow falls back to the built-in ladder (routes to TEKUN).
  const [lenders, setLenders] = useState<LenderProfile[]>([]);
  const [selectedLenderId, setSelectedLenderId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchLenderDirectory().then((dir) => {
      if (!alive) return;
      setLenders(dir.lenders);
      setSelectedLenderId((cur) => cur ?? dir.lenders[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);
  const selectedLender = useMemo(
    () => lenders.find((l) => l.id === selectedLenderId) ?? null,
    [lenders, selectedLenderId]
  );

  // The chosen lender's real published ladder + thresholds drive the amount bounds and the
  // supportable pre-fill  not a hardcoded ladder  so what the borrower sees matches what that
  // lender's console will decide. Falls back to the engine default before the directory loads.
  const sendProducts = selectedLender?.products ?? DEFAULT_PRODUCTS;
  const sendPolicy = selectedLender?.policy;
  const ladderMin = useMemo(() => Math.min(...sendProducts.map((p) => p.minAmount)), [sendProducts]);
  const ladderMax = useMemo(() => Math.max(...sendProducts.map((p) => p.maxAmount)), [sendProducts]);
  const supportable = useMemo(
    () =>
      decideLoan({
        score: score.score,
        band: score.band,
        confidence: score.confidence,
        avgMonthlySurplus: profile.avgSurplus,
        monthlyDebtService: profile.monthlyDebtService,
        avgIncome: profile.avgIncome,
        requestedAmount: ladderMax,
        products: sendProducts,
        coverageRatio: coverage.ratio,
        coverageDaysCovered: coverage.daysCovered,
        integrityFloorBreached: dataConfidence.integrityFloorBreached,
        ...(sendPolicy ? { policy: sendPolicy } : {}),
      }).maxAmount,
    [score, profile, sendProducts, sendPolicy, coverage, dataConfidence, ladderMax]
  );
  // Graduated borrowing limit: the affordability max (supportable) composed with a repayment-driven
  // progression cap, minus what's already outstanding on active loans. The amount the borrower can
  // request is capped at `available`, so a thin repayment record or existing exposure genuinely
  // limits how much they can ask for  not just what the engine would counter.
  const outstandingPrincipal = useMemo(
    () => outstandingExposure(loanApplications, accountValues),
    [loanApplications, accountValues]
  );
  const borrowing = useMemo(
    () =>
      computeBorrowingLimit({
        engineMax: supportable,
        ladderMax,
        repaymentOnTime: repaymentSummary.onTime,
        repaymentMissed: repaymentSummary.missed,
        outstandingPrincipal,
      }),
    [supportable, ladderMax, repaymentSummary, outstandingPrincipal]
  );
  const requestCeiling = Math.max(0, Math.min(ladderMax, borrowing.available));
  const requestFloor = Math.min(ladderMin, requestCeiling);
  const defaultAmount = Math.min(supportable > 0 ? supportable : ladderMin, requestCeiling);
  const effectiveAmount = amount ?? defaultAmount;

  // Switching lenders re-defaults the amount to the new lender's supportable figure and clears
  // any stale verdict  the borrower is now asking a different lender.
  const selectLender = (id: string) => {
    setSelectedLenderId(id);
    setAmount(null);
    setSendResult(null);
    setBooked(false);
  };

  const sharedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current);
    };
  }, []);

  // The exact draft a confirm will sign  the ceremony's rows derive from it.
  const draftArgs = useMemo(
    () => ({
      profile,
      score,
      dataConfidence,
      coverage,
      momentum,
      amounts: coachInput.confidenceTxns.map((t) => t.amount),
      identity: kyc ? { fullName: kyc.fullName, nricMasked: kyc.nricMasked, provider: kyc.provider } : null,
      incomeQuality,
      obligations,
      spendingProfile,
      occupation: occupation
        ? { occupation: occupation.occupation, sector: occupation.sector, employmentType: occupation.employmentType, tenureMonths: occupation.tenureMonths }
        : null,
    }),
    [profile, score, dataConfidence, coverage, momentum, coachInput, kyc, incomeQuality, obligations, spendingProfile, occupation]
  );
  // Preview shows every attachable row (both grants on); the mint step honours the actual toggles.
  const previewDraft = useMemo(() => buildPassportDraft({ ...draftArgs, includeIdentity: true, includeSpending: true }), [draftArgs]);
  const tier0 = useMemo(() => tier0ScopeRows(previewDraft), [previewDraft]);
  const tier1 = useMemo(() => tier1ScopeRows(previewDraft), [previewDraft]);
  const tier2 = useMemo(() => tier2ScopeRows(previewDraft), [previewDraft]);
  const tier3 = useMemo(
    () => (activeLoanTenorMonths != null ? monitoringScopeRow(activeLoanTenorMonths) : null),
    [activeLoanTenorMonths]
  );

  // Mint  only reachable through the ceremony's explicit confirm.
  const mint = useCallback(async () => {
    setMinting(true);
    setError(null);
    setShared(false);
    try {
      const keypair = await getOrCreateKeypair();
      const draft = buildPassportDraft({ ...draftArgs, includeIdentity, includeSpending });
      // Signed consent receipts (Brief I stretch + Brief P + Brief S): Tier 0 always, Tier 1 when
      // identity or occupation is shared, Tier 2 when the spending profile is shared, Tier 3 when
      // minting against an active loan with the monitoring toggle left on.
      const consent = buildConsentReceipts(
        draft,
        new Date(),
        includeMonitoring && activeLoanTenorMonths != null ? { tenorMonths: activeLoanTenorMonths } : undefined,
      );
      const result = await buildPassport(
        { ...draft, subject: keypair.publicKeyHex, consent },
        keypair.sign.bind(keypair),
        issuerSign,
      );
      setPassport(result.passport);
      setSignature(result.signature);
      setIssuerSignature(result.issuerSignature ?? null);
      setPhase('minted');
      emitTourSignal('passport-minted');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('secure store') || msg.toLowerCase().includes('platform')) {
        setError('Passport not available on this platform');
      } else {
        setError(msg);
      }
    } finally {
      setMinting(false);
    }
  }, [draftArgs, includeIdentity, includeSpending, includeMonitoring, activeLoanTenorMonths]);

  // Regenerate discards the minted result and routes back through the ceremony.
  const regenerate = useCallback(() => {
    setPassport(null);
    setSignature(null);
    setIssuerSignature(null);
    setPhase('consent');
  }, []);

  const pasteCode = useMemo(
    () =>
      passport && signature
        ? JSON.stringify({ passport, signature, ...(issuerSignature ? { issuerSignature } : {}) })
        : '',
    [passport, signature, issuerSignature]
  );
  const shortCode = pasteCode ? `${pasteCode.slice(0, 16)}…${pasteCode.slice(-4)}` : '';

  const handleShare = async () => {
    if (!pasteCode) return;
    try {
      await Share.share({ message: pasteCode });
      setShared(true);
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current);
      sharedTimerRef.current = setTimeout(() => setShared(false), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg && msg.toLowerCase().includes('error')) console.error('Share error:', msg);
    }
  };

  const stepAmount = (delta: number) => {
    setSendResult(null);
    setBooked(false);
    setAmount((cur) => {
      const base = cur ?? defaultAmount;
      const next = Math.round(base + delta);
      return Math.max(requestFloor, Math.min(requestCeiling, next));
    });
  };

  // Send the signed passport code to the console. submitApplication never throws  every
  // failure resolves to a typed result (offline / rejected / duplicate), so the card always
  // lands in a well-defined state and can nudge the borrower to the offline fallback below.
  const sendToLender = async () => {
    if (!pasteCode) return;
    setSendBusy(true);
    setSendResult(null);
    setBooked(false);
    try {
      const result = await submitApplication(LENDER_API_BASE, {
        passportCode: pasteCode,
        requestedAmount: effectiveAmount,
        purpose: { category: purpose },
        // Route to the chosen lender; a generic/offline placeholder carries no real id, so we
        // omit it and let the console default (TEKUN) rather than send an unknown lender.
        ...(selectedLender && selectedLender.id !== 'offline' ? { lenderId: selectedLender.id } : {}),
      });
      setSendResult(result);
      setBooked(false);
    } catch {
      setSendResult({ status: 'offline' });
      setBooked(false);
    } finally {
      setSendBusy(false);
    }
  };

  // Accept the lender's approved offer  books it locally into "My Financing" via the store's
  // acceptLenderOffer action (Task 3). Only reachable when the last decision was an approve
  // with a positive amount; see the FILED result block below.
  const acceptOffer = async () => {
    if (!sendResult || sendResult.status !== 'filed') return;
    setBookingBusy(true);
    try {
      const app = await acceptLenderOffer(
        sendResult.decision,
        { products: sendProducts, name: selectedLender?.name ?? 'Lender' },
        score.score
      );
      if (app) setBooked(true);
    } finally {
      setBookingBusy(false);
    }
  };

  // eKYC gate.
  if (!kyc) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title="Credit Passport" onBack={onBack} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}>
          <Card style={styles.centerCard}>
            <Icon name="alert" size={30} color="#a05c00" />
            <Text style={styles.gateTitle}>Verify your identity first</Text>
            <Text style={styles.gateBody}>
              Your Credit Passport is what lenders verify to offer you financing, so it must be bound to your verified
              identity. This is a one-time check.
            </Text>
            <Pressable style={styles.gateBtn} onPress={onOpenKyc}>
              <Text style={styles.gateBtnText}>Verify identity</Text>
            </Pressable>
          </Card>
        </ScrollView>
      </View>
    );
  }

  // Consent ceremony  the only path to minting.
  if (phase !== 'minted' || !passport || !signature) {
    return (
      <PassportCeremonyScreen
        tier0={tier0}
        tier1={tier1}
        tier2={tier2}
        tier3={tier3}
        includeIdentity={includeIdentity}
        onToggleIdentity={setIncludeIdentity}
        includeSpending={includeSpending}
        onToggleSpending={setIncludeSpending}
        includeMonitoring={includeMonitoring}
        onToggleMonitoring={setIncludeMonitoring}
        onConfirm={mint}
        onBack={onBack}
        minting={minting}
        error={error}
      />
    );
  }

  const holder = passport.holder;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Credit Passport" onBack={onBack} />
      </View>
      <Text style={styles.subtitle}>Share your verified score with any lender</Text>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <TourAnchor id="passport-card" activeId={activeTourAnchor}>
        <FadeIn key={passport.issuedAt} style={styles.passportCard}>
          {/* Dark header strip */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.brandRow}>
                <PipEmblem size={34} />
                <View>
                  <Text style={styles.brand}>Pip Credit</Text>
                  <Text style={styles.brandSub}>Malaysia · Official</Text>
                </View>
              </View>
              <View style={styles.activeChip}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            </View>

            <View style={styles.holderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Holder</Text>
                <Text style={styles.holderName} numberOfLines={1}>{holder ? holder.name : 'Anonymous'}</Text>
                <Text style={styles.holderSub} numberOfLines={1}>
                  {holder ? `Verified · ${holder.provider}` : 'Identity not shared · aggregates only'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.fieldLabel}>Score</Text>
                <Text style={styles.scoreNum}>{Math.round(passport.score)}</Text>
                <View style={styles.scorePill}>
                  <Text style={styles.scorePillText}>{passport.band}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Perforated divider */}
          <View style={styles.perfRow}>
            <View style={[styles.perfNotch, { left: -13, borderTopRightRadius: 13, borderBottomRightRadius: 13 }]} />
            <View style={styles.perfLine} />
            <View style={[styles.perfNotch, { right: -13, borderTopLeftRadius: 13, borderBottomLeftRadius: 13 }]} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.datesRow}>
              <View>
                <Text style={styles.dateLabel}>Issued</Text>
                <Text style={styles.dateValue}>{formatDate(passport.issuedAt)}</Text>
              </View>
              <View style={styles.dateDivider} />
              <View>
                <Text style={styles.dateLabel}>Valid until</Text>
                <Text style={styles.dateValue}>{formatDate(passport.validUntil)}</Text>
              </View>
              <View style={styles.dateDivider} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.dateLabel}>Confidence</Text>
                <Text style={[styles.dateValue, { color: colors.accent }]}>{Math.round(dataConfidence.confidence * 100)}%</Text>
              </View>
            </View>

            <View style={styles.signedBadge}>
              <Svg width={13} height={15} viewBox="0 0 14 16" fill="none">
                <Path d="M7 1L1.5 4v5.2C1.5 12.8 3.9 15.2 7 16c3.1-.8 5.5-3.2 5.5-6.8V4L7 1z" fill={colors.accentSoft} stroke={colors.accent} strokeWidth={1.2} strokeLinejoin="round" />
                <Path d="M4.5 8.5l2 2 3-3.5" stroke={colors.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.signedText}>Cryptographically signed</Text>
              <View style={styles.algoChip}><Text style={styles.algoText}>Ed25519</Text></View>
            </View>

            {Platform.OS === 'web' && (
              <Text style={styles.webKeyNote}>Demo key stored in this browser · use the app on a phone for a device-secured key.</Text>
            )}

            <Pressable onPress={regenerate} style={styles.regenBtn}>
              <Icon name="return" size={13} color={colors.ink3} />
              <Text style={styles.regenText}>Regenerate passport</Text>
            </Pressable>
          </View>
        </FadeIn>
        </TourAnchor>

        {/* Request financing  direct-apply straight to the chosen lender console */}
        <Card style={styles.reqCard}>
          <Text style={styles.reqTitle}>Request financing</Text>
          <Text style={styles.reqSub}>Pick a lender and send this signed passport straight to them to apply. Only your signed aggregates travel — never your raw transactions.</Text>

          {lenders.length > 0 && (
            <>
              <Text style={styles.reqLabel}>Lender</Text>
              <View style={styles.lenderList}>
                {lenders.map((l) => {
                  const on = selectedLender?.id === l.id;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => selectLender(l.id)}
                      style={[styles.lenderRow, on && styles.lenderRowOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <View style={[styles.lenderDot, { backgroundColor: l.brandColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lenderName} numberOfLines={1}>{l.name}</Text>
                        <Text style={styles.lenderBlurb} numberOfLines={2}>{l.blurb}</Text>
                      </View>
                      {on && <Icon name="check" size={16} color={colors.accentInk} stroke={2.6} />}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Borrowing power  the graduated limit (repayment record + affordability, minus exposure). */}
          <View style={[styles.powerBox, lenders.length > 0 && { marginTop: 16 }]}>
            <View style={styles.powerHeader}>
              <Text style={styles.powerLabel}>Borrowing power</Text>
              <Text style={styles.powerAmount}>
                RM{borrowing.available.toLocaleString('en-MY')}
                <Text style={styles.powerOf}> of RM{borrowing.limit.toLocaleString('en-MY')}</Text>
              </Text>
            </View>
            <Text style={styles.powerReason}>{borrowing.reason}</Text>
          </View>

          <Text style={[styles.reqLabel, { marginTop: 16 }]}>Amount</Text>
          <View style={styles.stepperRow}>
            <Pressable onPress={() => stepAmount(-500)} style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperPressed]}>
              <Icon name="chevronLeft" size={18} color={colors.accent} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Amount value={effectiveAmount} size={22} />
              <Text style={styles.stepperHint}>RM{requestFloor.toLocaleString('en-MY')}–{requestCeiling.toLocaleString('en-MY')}</Text>
            </View>
            <Pressable onPress={() => stepAmount(500)} style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperPressed]}>
              <Icon name="chevronRight" size={18} color={colors.accent} />
            </Pressable>
          </View>

          <Text style={[styles.reqLabel, { marginTop: 16 }]}>Purpose</Text>
          <View style={styles.purposeWrap}>
            {PURPOSE_CATEGORIES.map((c) => {
              const on = purpose === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => { setPurpose(c); setSendResult(null); setBooked(false); }}
                  style={[styles.purposeChip, on && styles.purposeChipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.purposeChipText, on && styles.purposeChipTextOn]}>{PURPOSE_LABELS[c]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={sendToLender}
            disabled={sendBusy}
            style={({ pressed }) => [styles.sendBtn, (sendBusy || pressed) && { opacity: 0.92 }]}
            accessibilityRole="button"
          >
            {sendBusy ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                <Text style={styles.sendBtnText}>
                  {selectedLender && selectedLender.id !== 'offline' ? `Send to ${selectedLender.name.split(' ')[0]}` : 'Send request to lender'}
                </Text>
                <Icon name="arrowRight" size={16} color={colors.onAccent} />
              </>
            )}
          </Pressable>

          {sendResult && sendResult.status === 'filed' && (
            <View style={styles.resultBox}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {selectedLender && selectedLender.id !== 'offline' ? `Sent to ${selectedLender.name}` : 'Sent to lender'}
                </Text>
                <View style={[styles.decisionPill, { backgroundColor: decisionColor(sendResult.decision.decision) + '1a' }]}>
                  <Text style={[styles.decisionPillText, { color: decisionColor(sendResult.decision.decision) }]}>
                    {decisionLabel(sendResult.decision.decision)}
                  </Text>
                </View>
              </View>
              {sendResult.decision.maxAmount > 0 && (
                <View style={styles.offerAmounts}>
                  <View>
                    <Text style={styles.amountLabel}>Offered</Text>
                    <Amount value={sendResult.decision.maxAmount} size={18} />
                  </View>
                  <View>
                    <Text style={styles.amountLabel}>Installment / mo</Text>
                    <Amount value={sendResult.decision.installment} size={18} />
                  </View>
                </View>
              )}
              {sendResult.decision.reasons.length > 0 && (
                <View style={styles.reasonsBlock}>
                  {sendResult.decision.reasons.map((reason, idx) => (
                    <View key={idx} style={styles.reasonRow}>
                      <Icon name="dots" size={6} color={colors.ink3} />
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.resultFoot}>Filed in the lender's queue for review.</Text>

              {sendResult.decision.decision === 'approve' && sendResult.decision.maxAmount > 0 && (
                booked ? (
                  <View style={styles.bookedRow}>
                    <Icon name="check" size={14} color={DEC_GREEN} stroke={2.6} />
                    <Text style={styles.bookedText}>Booked — track it in My Financing.</Text>
                    <Pressable onPress={onOpenLoans} style={styles.bookedBtn} accessibilityRole="button">
                      <Text style={styles.bookedBtnText}>Go to My Financing</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={acceptOffer}
                    disabled={bookingBusy}
                    style={({ pressed }) => [styles.acceptBtn, (bookingBusy || pressed) && { opacity: 0.92 }]}
                    accessibilityRole="button"
                  >
                    {bookingBusy ? (
                      <ActivityIndicator size="small" color={colors.onAccent} />
                    ) : (
                      <Text style={styles.acceptBtnText}>Accept this offer</Text>
                    )}
                  </Pressable>
                )
              )}
            </View>
          )}

          {sendResult && sendResult.status === 'duplicate' && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>You've already sent this passport to this lender — it's in their queue.</Text>
            </View>
          )}

          {sendResult && sendResult.status === 'rejected' && (
            <View style={[styles.noticeBox, styles.noticeError]}>
              {sendResult.reasons.map((reason, idx) => (
                <Text key={idx} style={[styles.noticeText, { color: DEC_RED }]}>{reason}</Text>
              ))}
            </View>
          )}

          {sendResult && sendResult.status === 'offline' && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>Couldn't reach the lender console. Present your signed code offline instead — see below.</Text>
            </View>
          )}
        </Card>

        {/* Offline fallback  the manual hand-over that keeps working with no connection */}
        <Card style={styles.fallbackCard}>
          <Text style={styles.fallbackTitle}>Present offline instead</Text>
          <Text style={styles.fallbackSub}>No connection to a lender? Share your signed code — any lender can verify it offline, no server needed.</Text>
          <View style={styles.codeRow}>
            <View style={styles.codeField}>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Rect x={5} y={11} width={14} height={11} rx={2} stroke={colors.accent} strokeWidth={2} />
                <Path d="M8 11V7a4 4 0 018 0v4" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
              </Svg>
              <Text style={styles.codeText} numberOfLines={1}>{shortCode}</Text>
            </View>
            <Pressable onPress={handleShare} style={[styles.copyBtn, shared && styles.copyBtnDone]}>
              <Text style={[styles.copyText, shared && styles.copyTextDone]}>{shared ? '✓ Shared' : 'Share'}</Text>
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  subtitle: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, textAlign: 'center', marginTop: 2, marginBottom: 4 },

  centerCard: { padding: 32, alignItems: 'center', gap: 14, marginTop: 20 },

  gateTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink, marginTop: 12, textAlign: 'center' },
  gateBody: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  gateBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 999, backgroundColor: colors.accentInk, marginTop: 18, alignSelf: 'stretch' },
  gateBtnText: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.onAccent },

  /* passport card */
  passportCard: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    ...platformShadow('#0a1810', 0.28, 30, { width: 0, height: 18 }, 8),
  },
  header: { backgroundColor: colors.passportDark, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { fontFamily: uiFont(800), fontSize: 11.5, color: 'rgba(255,255,255,0.92)', letterSpacing: 0.6, textTransform: 'uppercase' },
  brandSub: { fontFamily: uiFont(500), fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.7, textTransform: 'uppercase' },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.deltaUp },
  activeText: { fontFamily: uiFont(600), fontSize: 11, color: 'rgba(255,255,255,0.62)' },
  holderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 11, color: 'rgba(255,255,255,0.36)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  holderName: { fontFamily: uiFont(800), fontSize: 22, color: '#fff' },
  holderSub: { fontFamily: uiFont(500), fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4 },
  scoreNum: { fontFamily: numFont(700), fontSize: 28, color: '#FAC438', lineHeight: 30 },
  scorePill: { marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  scorePillText: { fontFamily: uiFont(700), fontSize: 11, color: 'rgba(255,255,255,0.82)' },

  codeRow: { flexDirection: 'row', gap: 8, marginTop: 14, alignSelf: 'stretch' },
  codeField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.line },
  codeText: { flex: 1, fontFamily: numFont(500), fontSize: 12, color: colors.ink2 },
  copyBtn: { borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: colors.accentInk },
  copyBtnDone: { backgroundColor: colors.accentSoft },
  copyText: { fontFamily: uiFont(700), fontSize: 12.5, color: '#fff' },
  copyTextDone: { color: colors.accentInk },

  perfRow: { height: 26, justifyContent: 'center' },
  perfNotch: { position: 'absolute', width: 26, height: 26, backgroundColor: colors.bg },
  perfLine: { marginHorizontal: 14, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(20,40,30,0.13)' },

  footer: { padding: 20, backgroundColor: colors.surface, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  datesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  dateLabel: { fontFamily: uiFont(600), fontSize: 11, color: colors.ink2, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  dateValue: { fontFamily: numFont(600), fontSize: 12.5, color: colors.ink },
  dateDivider: { width: 1, backgroundColor: colors.line },
  signedBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.accentTint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.accentSoft, marginBottom: 12 },
  signedText: { flex: 1, fontFamily: uiFont(600), fontSize: 11.5, color: colors.accentInk },
  algoChip: { backgroundColor: colors.surface2, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: colors.line },
  algoText: { fontFamily: numFont(700), fontSize: 11, color: colors.ink2, letterSpacing: 0.3 },
  webKeyNote: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2, textAlign: 'center', marginBottom: 10, lineHeight: 14 },
  regenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  regenText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },

  /* request financing */
  reqCard: { padding: 18, marginTop: 16 },
  reqTitle: { fontFamily: uiFont(700), fontSize: 16, color: colors.ink },
  reqSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 18, marginTop: 4, marginBottom: 14 },
  reqLabel: { fontFamily: uiFont(700), fontSize: 11, color: colors.ink2, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  lenderList: { gap: 8 },
  lenderRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.line },
  lenderRowOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  lenderDot: { width: 12, height: 12, borderRadius: 999 },
  lenderName: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.ink },
  lenderBlurb: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, lineHeight: 15, marginTop: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentSoft },
  stepperPressed: { transform: [{ scale: 0.92 }] },
  stepperHint: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink3, marginTop: 3 },
  powerBox: { backgroundColor: colors.accentTint, borderRadius: 12, borderWidth: 1, borderColor: colors.accentSoft, padding: 12 },
  powerHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  powerLabel: { fontFamily: uiFont(700), fontSize: 11, color: colors.ink2, letterSpacing: 0.8, textTransform: 'uppercase' },
  powerAmount: { fontFamily: uiFont(800), fontSize: 15, color: colors.accentInk },
  powerOf: { fontFamily: uiFont(600), fontSize: 12, color: colors.ink2 },
  powerReason: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, lineHeight: 16, marginTop: 6 },
  purposeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  purposeChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.line },
  purposeChipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  purposeChipText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2 },
  purposeChipTextOn: { color: colors.accentInk },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 999, backgroundColor: colors.accentInk, marginTop: 18 },
  sendBtnText: { fontFamily: uiFont(700), fontSize: 15, color: colors.onAccent },

  resultBox: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultTitle: { flex: 1, marginRight: 8, fontFamily: uiFont(700), fontSize: 13.5, color: colors.ink },
  decisionPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  decisionPillText: { fontFamily: uiFont(700), fontSize: 12 },
  offerAmounts: { flexDirection: 'row', gap: 28, marginTop: 12 },
  amountLabel: { fontFamily: uiFont(600), fontSize: 11, color: colors.ink2, marginBottom: 3 },
  reasonsBlock: { marginTop: 12, gap: 5 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  reasonText: { flex: 1, fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  resultFoot: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 12 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: DEC_GREEN, marginTop: 14 },
  acceptBtnText: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.onAccent },
  bookedRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  bookedText: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink },
  bookedBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: DEC_GREEN },
  bookedBtnText: { fontFamily: uiFont(700), fontSize: 12.5, color: colors.onAccent },
  noticeBox: { marginTop: 14, backgroundColor: colors.surface2, borderRadius: 12, padding: 12, gap: 4 },
  noticeError: { backgroundColor: '#c5402f14' },
  noticeText: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 18 },

  /* offline fallback */
  fallbackCard: { padding: 18, marginTop: 14 },
  fallbackTitle: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.ink },
  fallbackSub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, lineHeight: 17, marginTop: 4 },
});
