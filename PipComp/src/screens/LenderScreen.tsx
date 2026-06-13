// src/screens/LenderScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Card, Eyebrow, ProgressTrack, TopBar } from '../components/ui';
import { type CreditPassport, verifyPassport } from '../lib/passport';
import { ISSUER_PUBLIC_KEY_HEX } from '../crypto/issuer';
import {
  findRecentPresentments,
  formatAgo,
  presentmentKey,
  type Presentment,
} from '../lib/presentment';
import { DEFAULT_PRODUCTS, type LoanDecision, decideLoan } from '../lib/loans';
import { structurePool, type Rating, type Tranche } from '../lib/securitization';
import { SAMPLE_POOL } from '../data/samplePool';
import { colors, numFont, radius, uiFont } from '../theme';
import { SAMPLE_PASSPORT_CODE } from '../data/samplePassport';

type LenderView = 'verify' | 'capital';

type VerifyResult = {
  passport: CreditPassport;
  valid: boolean;
  tampered: boolean;
  reasons: string[];
};

export function LenderScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();

  const [pasteCode, setPasteCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanDecision, setLoanDecision] = useState<LoanDecision | null>(null);
  const [view, setView] = useState<LenderView>('verify');
  // Anti-stacking: log of passports verified this session + the warning for the current one.
  const [presentmentLog, setPresentmentLog] = useState<Presentment[]>([]);
  const [stacking, setStacking] = useState<Presentment[] | null>(null);

  function handleVerify() {
    setVerifyResult(null);
    setVerifyError('');
    setVerifying(true);
    setLoanDecision(null);
    setLoanAmount('');
    setStacking(null);

    let passport: CreditPassport;
    let signature: string;
    let issuerSignature: string | undefined;

    try {
      const parsed = JSON.parse(pasteCode);
      passport = parsed.passport;
      signature = parsed.signature;
      issuerSignature = parsed.issuerSignature;
    } catch {
      setVerifyError('Invalid code format — paste the full passport code from the borrower app');
      setVerifying(false);
      return;
    }

    const publicKeyHex = passport.subject;
    // Require the Pip issuer attestation — a self-minted passport (holder signs their own
    // score) carries no valid issuer signature and is rejected here.
    const result = verifyPassport(passport, signature, publicKeyHex, {
      publicKeyHex: ISSUER_PUBLIC_KEY_HEX,
      signature: issuerSignature ?? '',
    });

    setVerifyResult({ passport, ...result });
    setVerifying(false);

    if (result.valid) {
      // Anti-stacking: warn if this passport was already presented recently, then record it.
      const key = presentmentKey(passport);
      const now = new Date();
      const prior = findRecentPresentments(presentmentLog, key, now);
      if (prior.length > 0) setStacking(prior);
      setPresentmentLog((log) => [...log, { id: key, at: now.toISOString() }]);

      // Pre-fill loan amount: max product amount for the passport's band
      const score = passport.score;
      const eligible = DEFAULT_PRODUCTS.filter((p) => p.minScore <= score);
      if (eligible.length > 0) {
        const bestTier = eligible.reduce((b, p) => (p.minScore > b.minScore ? p : b));
        setLoanAmount(String(bestTier.maxAmount));
      }
    }
  }

  function handleAssess() {
    if (!verifyResult?.valid) return;
    const { passport } = verifyResult;
    const requested = parseInt(loanAmount, 10);
    if (isNaN(requested) || requested <= 0) return;

    const score = passport.score;
    const band = passport.band as import('../lib/creditScore').CreditBand;
    // Use the borrower's real aggregates from the (signed, issuer-attested) passport.
    // Fallbacks only apply to legacy passports without an assessment block.
    const a = passport.assessment;
    const confidence = a?.confidence ?? 0.5;
    const avgIncome = a?.avgIncome ?? (score / 100) * 200;
    const avgMonthlySurplus = a?.avgMonthlySurplus ?? (score / 100) * 50;
    const monthlyDebtService = a?.monthlyDebtService ?? 0;

    const result = decideLoan({
      score,
      band,
      confidence,
      avgMonthlySurplus,
      monthlyDebtService,
      avgIncome,
      requestedAmount: requested,
      products: DEFAULT_PRODUCTS,
      adverseRecord: 'none',
      coverageRatio: a?.coverageRatio,
      coverageDaysCovered: a?.coverageDays,
    });
    setLoanDecision(result);
  }

  const canVerify = pasteCode.trim().length > 0 && !verifying;
  const canAssess =
    verifyResult?.valid === true &&
    loanAmount.trim().length > 0 &&
    !isNaN(parseInt(loanAmount, 10)) &&
    parseInt(loanAmount, 10) > 0;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Lender Console" onBack={onBack} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* View switcher */}
        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentBtn, view === 'verify' && styles.segmentBtnActive]}
            onPress={() => setView('verify')}
          >
            <Text style={[styles.segmentText, view === 'verify' && styles.segmentTextActive]}>
              Verify Passport
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, view === 'capital' && styles.segmentBtnActive]}
            onPress={() => setView('capital')}
          >
            <Text style={[styles.segmentText, view === 'capital' && styles.segmentTextActive]}>
              Capital Markets
            </Text>
          </Pressable>
        </View>

        {view === 'capital' && <CapitalMarketsSection />}

        {view === 'verify' && (
          <>
        <Eyebrow style={{ marginBottom: 10 }}>Credit Passport Verification</Eyebrow>

        <Card style={styles.introCard}>
          <Text style={styles.introText}>
            Paste the applicant's passport code below to verify and assess their credit profile.
          </Text>
        </Card>

        <Pressable
          style={styles.sampleBtn}
          onPress={() => {
            setPasteCode(SAMPLE_PASSPORT_CODE);
            setVerifyResult(null);
            setVerifyError('');
            setLoanDecision(null);
          }}
        >
          <Text style={styles.sampleBtnText}>Load sample applicant</Text>
        </Pressable>

        <Card style={styles.inputCard}>
          <Text style={styles.inputLabel}>Passport code</Text>
          <TextInput
            style={styles.codeInput}
            multiline
            numberOfLines={4}
            placeholder="Paste passport code here…"
            placeholderTextColor={colors.ink3}
            editable={!verifying}
            textAlignVertical="top"
            value={pasteCode}
            onChangeText={(t) => {
              setPasteCode(t);
              if (verifyResult) setVerifyResult(null);
              if (verifyError) setVerifyError('');
            }}
          />
        </Card>

        <Pressable
          style={[styles.verifyBtn, !canVerify && styles.verifyBtnDisabled]}
          disabled={!canVerify}
          onPress={handleVerify}
        >
          {verifying ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.verifyBtnText}>Verify</Text>
          )}
        </Pressable>

        {/* Parse error */}
        {verifyError !== '' && (
          <Card style={styles.errorCard}>
            <View style={styles.resultRow}>
              <Icon name="alert" size={18} color="#c0392b" stroke={1.9} />
              <Text style={styles.errorHeadline}>Invalid passport code</Text>
            </View>
            <Text style={styles.errorBody}>{verifyError}</Text>
          </Card>
        )}

        {/* Verification result */}
        {verifyResult && (
          verifyResult.valid
            ? <SuccessCard result={verifyResult} />
            : <FailureCard result={verifyResult} />
        )}

        {/* Anti-stacking warning — same passport presented again recently */}
        {verifyResult?.valid && stacking && stacking.length > 0 && (
          <Card style={styles.stackingCard}>
            <View style={styles.resultRow}>
              <Icon name="alert" size={18} color="#a05c00" stroke={1.9} />
              <Text style={styles.stackingHeadline}>Possible loan stacking</Text>
            </View>
            <Text style={styles.stackingBody}>
              This passport was already presented {stacking.length} time
              {stacking.length > 1 ? 's' : ''} recently (most recent {formatAgo(stacking[0].at)}).
              The borrower may be applying to multiple lenders at once — review before disbursing.
            </Text>
          </Card>
        )}

        {/* Loan assessment input — shown only after a successful verification */}
        {verifyResult?.valid && (
          <Card style={styles.loanInputCard}>
            <Text style={styles.inputLabel}>Loan amount requested (RM)</Text>
            <TextInput
              style={styles.loanAmountInput}
              keyboardType="numeric"
              placeholder="e.g. 10000"
              placeholderTextColor={colors.ink3}
              value={loanAmount}
              onChangeText={(t) => {
                setLoanAmount(t);
                setLoanDecision(null);
              }}
            />
            <Pressable
              style={[styles.assessBtn, !canAssess && styles.assessBtnDisabled]}
              disabled={!canAssess}
              onPress={handleAssess}
            >
              <Text style={styles.assessBtnText}>Assess loan</Text>
            </Pressable>
          </Card>
        )}

        {/* Loan decision card */}
        {loanDecision && (
          <LoanDecisionCard
            decision={loanDecision}
            confidence={verifyResult?.passport.assessment?.confidence}
          />
        )}

        <Text style={styles.noteText}>
          The lender console evaluates credit without accessing the applicant's raw transactions.
        </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Capital Markets section ──────────────────────────────────────────────────────

const RATING_COLOR: Record<Rating, string> = {
  AAA: '#1a7a4a',
  AA: '#1a7a4a',
  A: '#2f8f6a',
  BBB: '#3a6ea5',
  BB: '#a05c00',
  Equity: '#c0392b',
};

const TRANCHE_COLOR: Record<Tranche['name'], string> = {
  Senior: '#2f8f6a',
  Mezzanine: '#d9a441',
  Subordinated: '#c0392b',
};

function rm(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}

function pct(n: number, dp = 1): string {
  return `${(n * 100).toFixed(dp)}%`;
}

function CapitalMarketsSection() {
  const { summary, tranches } = useMemo(() => structurePool(SAMPLE_POOL), []);

  return (
    <>
      <Eyebrow style={{ marginBottom: 10 }}>AI-Structured Micro-Sukuk</Eyebrow>

      <Card style={styles.introCard}>
        <Text style={styles.introText}>
          Explainable tranche ratings from a pool of fraud-checked, individually-scored micro-loans —
          turning inclusive lending into an instrument institutions can fund.
        </Text>
      </Card>

      {/* Pool summary */}
      <Card style={styles.poolCard}>
        <Text style={styles.sectionLabel}>Pool Summary</Text>
        <View style={styles.poolGrid}>
          <View style={styles.poolCell}>
            <Text style={styles.poolValue}>{rm(summary.totalPrincipal)}</Text>
            <Text style={styles.poolKey}>Total principal</Text>
          </View>
          <View style={styles.poolCell}>
            <Text style={styles.poolValue}>{summary.loanCount.toLocaleString('en-MY')}</Text>
            <Text style={styles.poolKey}>Loans pooled</Text>
          </View>
          <View style={styles.poolCell}>
            <Text style={styles.poolValue}>{Math.round(summary.weightedAvgScore)}</Text>
            <Text style={styles.poolKey}>Wtd-avg score</Text>
          </View>
          <View style={styles.poolCell}>
            <Text style={styles.poolValue}>{pct(summary.weightedAvgPD)}</Text>
            <Text style={styles.poolKey}>Wtd-avg PD</Text>
          </View>
          <View style={styles.poolCell}>
            <Text style={styles.poolValue}>{pct(summary.expectedLossRate, 2)}</Text>
            <Text style={styles.poolKey}>Expected loss</Text>
          </View>
        </View>
      </Card>

      {/* Loss-waterfall bar */}
      <Card style={styles.waterfallCard}>
        <Text style={styles.sectionLabel}>Tranche Structure</Text>
        <View style={styles.waterfallBar}>
          {tranches.map((t) => (
            <View
              key={t.name}
              style={{
                width: `${t.thicknessPct * 100}%`,
                backgroundColor: TRANCHE_COLOR[t.name],
                height: '100%',
              }}
            />
          ))}
        </View>
        <View style={styles.legendRow}>
          {tranches.map((t) => (
            <View key={t.name} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: TRANCHE_COLOR[t.name] }]} />
              <Text style={styles.legendText}>
                {t.name} {pct(t.thicknessPct, 0)}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Tranche table */}
      {tranches.map((t) => (
        <Card key={t.name} style={styles.trancheCard}>
          <View style={styles.trancheHead}>
            <Text style={styles.trancheName}>{t.name}</Text>
            <View style={[styles.ratingBadge, { backgroundColor: RATING_COLOR[t.rating] }]}>
              <Text style={styles.ratingText}>{t.rating}</Text>
            </View>
          </View>
          <View style={styles.trancheNums}>
            <View>
              <Text style={styles.trancheNumValue}>{rm(t.thicknessRM)}</Text>
              <Text style={styles.trancheNumKey}>{pct(t.thicknessPct, 0)} of pool</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.trancheNumValue}>{pct(t.profitRate)}</Text>
              <Text style={styles.trancheNumKey}>profit rate</Text>
            </View>
          </View>
          <Text style={styles.trancheReason}>{t.reason}</Text>
        </Card>
      ))}

      <Text style={styles.noteText}>
        Ratings are computed deterministically from the pool's expected loss — a weaker pool is
        downgraded, not rubber-stamped. The AI supplies the upstream risk; the structuring is
        transparent and auditable.
      </Text>
    </>
  );
}

// ── Success card ───────────────────────────────────────────────────────────────

function SuccessCard({ result }: { result: VerifyResult }) {
  const { passport } = result;
  const validUntil = new Date(passport.validUntil).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const issuedAt = new Date(passport.issuedAt).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Card style={styles.successCard}>
      {/* Headline */}
      <View style={styles.resultRow}>
        <View style={styles.checkCircle}>
          <Icon name="check" size={14} color="#fff" stroke={2.6} />
        </View>
        <Text style={styles.successHeadline}>Verified</Text>
      </View>

      {/* Holder identity (eKYC) */}
      {passport.holder && (
        <View style={styles.identityRow}>
          <Icon name="check" size={13} color={colors.accentInk} stroke={2.5} />
          <Text style={styles.identityText}>
            {passport.holder.name} · {passport.holder.nricMasked} · eKYC verified ({passport.holder.provider})
          </Text>
        </View>
      )}

      {/* Score + band */}
      <View style={styles.scoreBand}>
        <Text style={styles.scoreNum}>{passport.score}</Text>
        <View style={styles.bandPill}>
          <Text style={styles.bandText}>{passport.band}</Text>
        </View>
      </View>

      <Divider />

      {/* Factor summary */}
      <Text style={styles.sectionLabel}>Credit Factors</Text>
      {passport.factorSummary.map((f) => (
        <View key={f.key} style={styles.factorRow}>
          <Text style={styles.factorKey}>{f.key}</Text>
          <View style={styles.factorBar}>
            <ProgressTrack pct={f.subScore} height={6} />
          </View>
          <Text style={styles.factorScore}>{f.subScore}</Text>
        </View>
      ))}

      <Divider />

      {/* Provenance */}
      <Text style={styles.sectionLabel}>Data Sources</Text>
      <Text style={styles.provenanceText}>{passport.provenanceSummary}</Text>

      <Divider />

      {/* Repayment record */}
      <Text style={styles.sectionLabel}>Repayment Record</Text>
      <Text style={styles.repayText}>
        {passport.repaymentRecord.onTime}/{passport.repaymentRecord.total} on-time
      </Text>

      <Divider />

      {/* Dates */}
      <View style={styles.dateRow}>
        <View>
          <Text style={styles.dateLabelTiny}>Issued</Text>
          <Text style={styles.dateValue}>{issuedAt}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.dateLabelTiny}>Valid until</Text>
          <Text style={styles.dateValue}>{validUntil}</Text>
        </View>
      </View>
    </Card>
  );
}

// ── Failure card ───────────────────────────────────────────────────────────────

function FailureCard({ result }: { result: VerifyResult }) {
  const { tampered, reasons } = result;
  const headline = tampered
    ? 'Signature mismatch — passport may have been altered'
    : 'Verification failed';

  return (
    <Card style={styles.failCard}>
      <View style={styles.resultRow}>
        <Icon name="alert" size={18} color="#c0392b" stroke={1.9} />
        <Text style={styles.failHeadline}>Could not verify passport</Text>
      </View>
      <Text style={styles.failSubtitle}>{headline}</Text>
      {reasons.length > 0 && (
        <View style={styles.reasonsList}>
          {reasons.map((r, i) => (
            <Text key={i} style={styles.reasonItem}>
              {'• '}{r}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}

// ── Loan decision card ─────────────────────────────────────────────────────────

const DECISION_META: Record<
  'approve' | 'refer' | 'decline',
  { label: string; bg: string; text: string; borderColor: string }
> = {
  approve: { label: 'Approved', bg: '#f4fbf7', text: '#1a7a4a', borderColor: '#a8d9c1' },
  refer: { label: 'Refer for review', bg: '#fffbf0', text: '#a05c00', borderColor: '#f5d78a' },
  decline: { label: 'Declined', bg: '#fff8f8', text: '#c0392b', borderColor: '#f4c4c4' },
};

function LoanDecisionCard({ decision, confidence }: { decision: LoanDecision; confidence?: number }) {
  const meta = DECISION_META[decision.decision];

  return (
    <Card
      style={[
        styles.decisionCard,
        { backgroundColor: meta.bg, borderColor: meta.borderColor },
      ]}
    >
      {/* Decision badge */}
      <View style={[styles.decisionBadge, { backgroundColor: meta.borderColor }]}>
        <Text style={[styles.decisionBadgeText, { color: meta.text }]}>{meta.label}</Text>
      </View>

      {/* Amount + installment (approve / refer with offer) */}
      {decision.maxAmount > 0 && (
        <>
          <View style={styles.decisionAmountRow}>
            <View>
              <Text style={styles.decisionAmtLabel}>Max amount</Text>
              <Text style={[styles.decisionAmtValue, { color: meta.text }]}>
                RM{Math.round(decision.maxAmount).toLocaleString('en-MY')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.decisionAmtLabel}>Monthly installment</Text>
              <Text style={[styles.decisionAmtValue, { color: meta.text }]}>
                RM{Math.round(decision.installment).toLocaleString('en-MY')}/mo
              </Text>
            </View>
          </View>
          <Divider />
        </>
      )}

      {/* Audit trail */}
      <Text style={styles.sectionLabel}>Audit trail</Text>
      {decision.reasons.map((r, i) => (
        <View key={i} style={styles.auditRow}>
          <Text style={styles.auditBullet}>{'›'}</Text>
          <Text style={styles.auditText}>{r}</Text>
        </View>
      ))}

      <Divider />

      {/* Data confidence badge */}
      <View style={styles.confidenceBadge}>
        <Icon name="check" size={13} color={colors.accentInk} stroke={2.5} />
        <Text style={styles.confidenceText}>
          Passport verified — data confidence:{' '}
          {typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'n/a'}
        </Text>
      </View>
    </Card>
  );
}

// ── Small helper ───────────────────────────────────────────────────────────────

function Divider() {
  return <View style={styles.divider} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // View switcher
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 999,
  },
  segmentBtnActive: { backgroundColor: colors.accent },
  segmentText: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink2 },
  segmentTextActive: { color: colors.onAccent },

  // Capital Markets — pool summary
  poolCard: { padding: 16, marginBottom: 14 },
  poolGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  poolCell: { width: '33.33%', paddingHorizontal: 6, marginBottom: 12 },
  poolValue: { fontFamily: numFont(700), fontSize: 17, color: colors.ink },
  poolKey: {
    fontFamily: uiFont(600),
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.3,
    marginTop: 2,
  },

  // Capital Markets — waterfall
  waterfallCard: { padding: 16, marginBottom: 14 },
  waterfallBar: {
    flexDirection: 'row',
    height: 26,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: 12,
  },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendText: { fontFamily: uiFont(600), fontSize: 12, color: colors.ink2 },

  // Capital Markets — tranche cards
  trancheCard: { padding: 16, marginBottom: 12 },
  trancheHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  trancheName: { fontFamily: uiFont(700), fontSize: 16, color: colors.ink },
  ratingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  ratingText: { fontFamily: uiFont(700), fontSize: 13, color: '#fff', letterSpacing: 0.5 },
  trancheNums: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trancheNumValue: { fontFamily: numFont(700), fontSize: 18, color: colors.ink },
  trancheNumKey: {
    fontFamily: uiFont(600),
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  trancheReason: {
    fontFamily: uiFont(500),
    fontSize: 12.5,
    color: colors.ink2,
    lineHeight: 18,
  },

  introCard: { padding: 16, marginBottom: 14 },
  introText: {
    fontFamily: uiFont(500),
    fontSize: 14,
    color: colors.ink2,
    lineHeight: 20,
  },
  inputCard: { padding: 16, marginBottom: 14 },
  inputLabel: {
    fontFamily: uiFont(600),
    fontSize: 13,
    color: colors.ink2,
    marginBottom: 8,
  },
  codeInput: {
    fontFamily: uiFont(400),
    fontSize: 13.5,
    color: colors.ink,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
    minHeight: 96,
    lineHeight: 20,
  },
  verifyBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.accent,
    marginBottom: 14,
  },
  verifyBtnDisabled: { opacity: 0.45 },
  verifyBtnText: {
    fontFamily: uiFont(700),
    fontSize: 15,
    color: colors.onAccent,
  },
  noteText: {
    fontFamily: uiFont(500),
    fontSize: 12.5,
    color: colors.ink3,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginTop: 10,
  },

  // Anti-stacking warning
  stackingCard: {
    padding: 16,
    marginBottom: 14,
    borderColor: '#f5d78a',
    backgroundColor: '#fffbf0',
  },
  stackingHeadline: {
    fontFamily: uiFont(700),
    fontSize: 14.5,
    color: '#a05c00',
    marginLeft: 8,
  },
  stackingBody: {
    fontFamily: uiFont(500),
    fontSize: 13,
    color: '#7a4d00',
    lineHeight: 19,
    marginTop: 8,
  },

  // Error (parse failure)
  errorCard: {
    padding: 16,
    marginBottom: 14,
    borderColor: '#f4c4c4',
    backgroundColor: '#fff8f8',
  },
  errorHeadline: {
    fontFamily: uiFont(700),
    fontSize: 14,
    color: '#c0392b',
    marginLeft: 8,
  },
  errorBody: {
    fontFamily: uiFont(500),
    fontSize: 13,
    color: '#c0392b',
    lineHeight: 19,
    marginTop: 8,
    opacity: 0.85,
  },

  // Success
  successCard: {
    padding: 18,
    marginBottom: 14,
    borderColor: '#a8d9c1',
    backgroundColor: '#f4fbf7',
  },
  successHeadline: {
    fontFamily: uiFont(700),
    fontSize: 16,
    color: colors.accentInk,
    marginLeft: 10,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  identityText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.accentInk, flex: 1 },
  scoreBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginBottom: 2,
  },
  scoreNum: {
    fontFamily: numFont(700),
    fontSize: 48,
    color: colors.ink,
    lineHeight: 54,
  },
  bandPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  bandText: {
    fontFamily: uiFont(700),
    fontSize: 14,
    color: colors.accentInk,
  },

  // Failure
  failCard: {
    padding: 16,
    marginBottom: 14,
    borderColor: '#f4c4c4',
    backgroundColor: '#fff8f8',
  },
  failHeadline: {
    fontFamily: uiFont(700),
    fontSize: 15,
    color: '#c0392b',
    marginLeft: 10,
  },
  failSubtitle: {
    fontFamily: uiFont(500),
    fontSize: 13.5,
    color: '#c0392b',
    lineHeight: 19,
    marginTop: 8,
    opacity: 0.85,
  },
  reasonsList: { marginTop: 10, gap: 4 },
  reasonItem: {
    fontFamily: uiFont(500),
    fontSize: 13,
    color: colors.ink2,
    lineHeight: 18,
  },

  // Shared section chrome
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 14,
  },
  sectionLabel: {
    fontFamily: uiFont(700),
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 10,
  },

  // Factor rows
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  factorKey: {
    fontFamily: uiFont(500),
    fontSize: 13,
    color: colors.ink2,
    width: 110,
  },
  factorBar: { flex: 1 },
  factorScore: {
    fontFamily: numFont(600),
    fontSize: 13,
    color: colors.ink,
    width: 28,
    textAlign: 'right',
  },

  // Provenance + repayment
  provenanceText: {
    fontFamily: uiFont(500),
    fontSize: 13.5,
    color: colors.ink2,
    lineHeight: 19,
  },
  repayText: {
    fontFamily: numFont(600),
    fontSize: 15,
    color: colors.ink,
  },

  // Dates
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateLabelTiny: {
    fontFamily: uiFont(600),
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  dateValue: {
    fontFamily: uiFont(500),
    fontSize: 13,
    color: colors.ink2,
  },

  // Loan amount input card
  loanInputCard: { padding: 16, marginBottom: 14 },
  loanAmountInput: {
    fontFamily: numFont(400),
    fontSize: 18,
    color: colors.ink,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 12,
  },
  assessBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  assessBtnDisabled: { opacity: 0.45 },
  assessBtnText: {
    fontFamily: uiFont(700),
    fontSize: 15,
    color: colors.onAccent,
  },

  // Loan decision card
  decisionCard: {
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
  },
  decisionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 16,
  },
  decisionBadgeText: {
    fontFamily: uiFont(700),
    fontSize: 14,
  },
  decisionAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  decisionAmtLabel: {
    fontFamily: uiFont(600),
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  decisionAmtValue: {
    fontFamily: numFont(700),
    fontSize: 22,
  },
  auditRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 7,
  },
  auditBullet: {
    fontFamily: uiFont(600),
    fontSize: 13,
    color: colors.ink3,
    lineHeight: 19,
  },
  auditText: {
    flex: 1,
    fontFamily: uiFont(500),
    fontSize: 13,
    color: colors.ink2,
    lineHeight: 19,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  confidenceText: {
    fontFamily: uiFont(600),
    fontSize: 13,
    color: colors.accentInk,
    flex: 1,
  },

  // Sample applicant button
  sampleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    marginBottom: 14,
  },
  sampleBtnText: {
    fontFamily: uiFont(600),
    fontSize: 14,
    color: colors.accent,
  },
});
