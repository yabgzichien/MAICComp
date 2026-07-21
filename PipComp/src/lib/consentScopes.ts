/**
 * Consent ceremony  single source of truth for what a minted passport carries.
 *
 * `buildPassportDraft` assembles the exact `PassportInput` (minus the signing
 * subject, which only exists at mint time) that a confirmed ceremony will sign.
 * The tier scope rows shown on the ceremony screen are derived from that same
 * draft, so what the borrower reviews is byte-for-byte what gets minted.
 *
 * The Tier 0 disclosure map below is exhaustive over the draft's keys: adding a
 * field to `PassportInput` fails compilation here until the ceremony discloses
 * it  the display list cannot silently drift from the signed payload.
 */

import type { ConsentReceipt, PassportInput } from './passport';
import type { CreditProfile, CreditScore } from './creditScore';
import { leadingDigitHistogram, type DataConfidence } from './dataConfidence';
import type { Coverage } from './coverage';
import type { Momentum } from './momentum';
import type { IncomeQuality } from './incomeQuality';
import type { SpendingProfile } from './spendingProfile';
import type { ObligationSummary } from './obligations';
import { ENGINE_VERSION, MODEL_WEIGHTS_VERSION, POLICY_VERSION } from './versions';

/** Everything of the signed passport input except the subject key (mint-time only). */
export type PassportDraft = Omit<PassportInput, 'subject'>;

/** Verified identity as the ceremony needs it  a structural subset of kycRepo's KycIdentity. */
export interface ConsentIdentity {
  fullName: string;
  nricMasked: string;
  provider: string;
}

/** Self-declared occupation as the ceremony needs it  a structural subset of occupationRepo's
 *  Occupation (kept structural so this pure lib never imports the DB layer). */
export interface ConsentOccupation {
  occupation: string;
  sector: string;
  employmentType: 'salaried' | 'gig' | 'self-employed' | 'micro-business';
  tenureMonths: number;
}

export interface PassportDraftArgs {
  profile: CreditProfile;
  score: CreditScore;
  dataConfidence: DataConfidence;
  coverage: Coverage;
  /** Null when the borrower is below momentum's minimum-history floor  no block is carried. */
  momentum: Momentum | null;
  /** Transaction amounts behind the confidence run  the digit histogram's input. */
  amounts: number[];
  identity: ConsentIdentity | null;
  /** Tier 1 grant: carry the verified identity (and self-declared occupation) into the passport. */
  includeIdentity: boolean;
  /** Income-quality evidence (Brief P, Tier 0)  always carried; aggregate and non-identifying. */
  incomeQuality: IncomeQuality;
  /** Detected recurring obligations (Brief P): their sum evidences the assessment's monthly debt
   *  service (Tier 0), and the itemised list rides inside the Tier 2 spending block. */
  obligations: ObligationSummary;
  /** Spending-behaviour evidence (Brief P, Tier 2). */
  spendingProfile: SpendingProfile;
  /** Self-declared occupation (Brief P, Tier 1), or null when the borrower hasn't provided it. */
  occupation: ConsentOccupation | null;
  /** Tier 2 grant: carry the spending-behaviour profile (with itemised obligations). */
  includeSpending: boolean;
}

/** One plain-language line on the ceremony screen: a field the passport will carry, with its real value. */
export interface ConsentScopeRow {
  key: string;
  label: string;
  detail: string;
}

/** Whole-ringgit display without Intl (Hermes locale-data gaps  same reasoning as lib/format.ts). */
function rm(n: number): string {
  const negative = n < 0;
  const grouped = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-RM' : 'RM') + grouped;
}

/** Assemble the passport input a confirmed ceremony will sign. Pure  deterministic given args. */
export function buildPassportDraft(args: PassportDraftArgs): PassportDraft {
  const { profile, score, dataConfidence, coverage, momentum, amounts, identity, includeIdentity } = args;
  const { incomeQuality, obligations, spendingProfile, occupation, includeSpending } = args;

  const provenanceSummary =
    dataConfidence.reasons.length > 0
      ? dataConfidence.reasons.map((r) => r.detail).join('; ')
      : 'No provenance data available';

  // Evidenced DSR (Brief P): the sum of detected recurring outflows replaces the loans-only
  // self-reported figure. When detection finds nothing, fall back to the in-app loans figure so
  // known committed debt is never understated.
  const monthlyDebtService =
    obligations.obligations.length > 0 ? obligations.evidencedMonthlyDebtService : profile.monthlyDebtService;

  return {
    score: score.score,
    band: score.band,
    factorSummary: score.factors.map((f) => ({ key: f.key, subScore: f.subScore })),
    provenanceSummary,
    aggregates: {
      avgIncome: profile.avgIncome,
      avgSurplus: profile.avgSurplus,
      months: profile.months,
      incomeMonths: profile.incomeMonths,
      savingsRate: profile.savingsRate,
      adherenceWithinRatio: profile.adherenceWithinRatio,
      netWorthSlope: profile.netWorthSlope,
      repaymentOnTime: profile.repaymentOnTime,
      repaymentTotal: profile.repaymentTotal,
    },
    repaymentRecord: { onTime: profile.repaymentOnTime, total: profile.repaymentTotal },
    assessment: {
      confidence: dataConfidence.confidence,
      coverageRatio: coverage.ratio,
      coverageDays: coverage.daysCovered,
      avgIncome: profile.avgIncome,
      avgMonthlySurplus: profile.avgSurplus,
      monthlyDebtService,
    },
    // Income quality (Tier 0): aggregate, non-identifying  always carried.
    incomeQuality: {
      variationCoefficient: incomeQuality.variationCoefficient,
      sourceCount: incomeQuality.sourceCount,
      regularityRatio: incomeQuality.regularityRatio,
      seasonal: incomeQuality.seasonal,
    },
    ...(identity && includeIdentity
      ? {
          holder: {
            name: identity.fullName,
            nricMasked: identity.nricMasked,
            verified: true,
            provider: identity.provider,
          },
        }
      : {}),
    // Occupation (Tier 1): self-declared, rides with the identity grant.
    ...(occupation && includeIdentity
      ? { occupation: { ...occupation, selfDeclared: true as const } }
      : {}),
    // Spending profile (Tier 2): behavioural, with the itemised obligations behind the DSR.
    ...(includeSpending
      ? {
          spendingProfile: {
            essentialsRatio: spendingProfile.essentialsRatio,
            expenseVolatility: spendingProfile.expenseVolatility,
            bufferDays: spendingProfile.bufferDays,
            savingsRate: spendingProfile.savingsRate,
            obligations: obligations.obligations.map((o) => ({
              label: o.label,
              kind: o.kind,
              monthlyAmount: o.monthlyAmount,
              monthsObserved: o.monthsObserved,
            })),
          },
        }
      : {}),
    ...(momentum
      ? {
          momentum: {
            lookbackDays: momentum.lookbackDays,
            scoreFrom: momentum.scoreFrom,
            scoreTo: momentum.scoreTo,
            coverageDaysFrom: momentum.coverageDaysFrom,
            coverageDaysTo: momentum.coverageDaysTo,
            direction: momentum.direction,
          },
        }
      : {}),
    provenanceMeta: {
      engineVersion: ENGINE_VERSION,
      policyVersion: POLICY_VERSION,
      modelWeightsVersion: MODEL_WEIGHTS_VERSION,
    },
    digitHistogram: leadingDigitHistogram(amounts),
  };
}

type RowBuilder = (d: PassportDraft) => ConsentScopeRow[];

/**
 * Exhaustive disclosure map: every PassportDraft key is either disclosed by a
 * Tier 0 row builder, folded into another row ('mergedIntoScore'), or belongs
 * to the identity tier ('tier1'). Literal key order = display order.
 *
 * `consent` is excluded: it is the receipt of what is shared, not itself a shared
 * aggregate  it records the very grants this ceremony produces. The Tier 1/2 Brief P
 * blocks (occupation/spendingProfile) are also excluded here: they are disclosed by their
 * own tiered ceremony sections when attached (see buildConsentReceipts and the ceremony's
 * Tier 1/2 rows). incomeQuality IS a Tier 0 aggregate, so it carries a builder below. `standing`
 * is excluded too: buildPassportDraft doesn't populate it yet (repayment standing isn't wired
 * into the ceremony as of this change)  once a later change adds it to PassportDraftArgs and
 * assembles it below, this exclusion should be removed so the drift guard covers it. Every
 * other field stays covered by the drift guard (adding one breaks the build until disclosed).
 */
const TIER0_DISCLOSURE: { [K in keyof Omit<PassportDraft, 'consent' | 'occupation' | 'spendingProfile' | 'standing'>]-?: RowBuilder | 'mergedIntoScore' | 'tier1' } = {
  score: (d) => [{ key: 'score', label: 'Credit score & band', detail: `${Math.round(d.score)} · ${d.band}` }],
  band: 'mergedIntoScore',
  factorSummary: (d) => [
    {
      key: 'factors',
      label: 'Factor sub-scores',
      detail: d.factorSummary.map((f) => `${f.key} ${Math.round(f.subScore)}`).join(' · '),
    },
  ],
  assessment: (d) =>
    d.assessment
      ? [
          { key: 'confidence', label: 'Data confidence', detail: `${Math.round(d.assessment.confidence * 100)}%` },
          { key: 'coverage', label: '90-day coverage', detail: `${d.assessment.coverageDays} of 90 days` },
          { key: 'income', label: 'Average monthly income', detail: `${rm(d.assessment.avgIncome)}/mo` },
          { key: 'surplus', label: 'Average monthly surplus', detail: `${rm(d.assessment.avgMonthlySurplus)}/mo` },
          { key: 'debtService', label: 'Monthly debt service', detail: `${rm(d.assessment.monthlyDebtService)}/mo` },
        ]
      : [],
  repaymentRecord: (d) => [
    {
      key: 'repayment',
      label: 'Repayment record',
      detail: `${d.repaymentRecord.onTime} of ${d.repaymentRecord.total} on time`,
    },
  ],
  momentum: (d) =>
    d.momentum
      ? [
          {
            key: 'momentum',
            label: 'Score momentum',
            detail: `${Math.round(d.momentum.scoreFrom)} → ${Math.round(d.momentum.scoreTo)} over ${d.momentum.lookbackDays} days (${d.momentum.direction})`,
          },
        ]
      : [],
  digitHistogram: (d) =>
    d.digitHistogram
      ? [
          {
            key: 'digitHistogram',
            label: 'Leading-digit histogram',
            detail: `9 digit counts across ${d.digitHistogram.reduce((s, n) => s + n, 0)} amounts. No individual amounts`,
          },
        ]
      : [],
  provenanceSummary: (d) => [{ key: 'provenance', label: 'Data provenance summary', detail: d.provenanceSummary }],
  aggregates: (d) => [
    {
      key: 'evidence',
      label: 'Evidence fingerprint',
      detail: `SHA-256 fingerprint proving the ${Object.keys(d.aggregates).length} aggregate figures weren't altered, without exposing them`,
    },
  ],
  provenanceMeta: (d) =>
    d.provenanceMeta
      ? [
          {
            key: 'versions',
            label: 'Engine versions',
            detail: `engine ${d.provenanceMeta.engineVersion} · policy ${d.provenanceMeta.policyVersion} · model ${d.provenanceMeta.modelWeightsVersion}`,
          },
        ]
      : [],
  incomeQuality: (d) =>
    d.incomeQuality
      ? [
          {
            key: 'incomeQuality',
            label: 'Income quality',
            detail: `${Math.round(d.incomeQuality.variationCoefficient * 100)}% variance · ${d.incomeQuality.sourceCount} source(s) · ${Math.round(d.incomeQuality.regularityRatio * 100)}% regular${d.incomeQuality.seasonal ? ' · seasonal' : ''}`,
          },
        ]
      : [],
  holder: 'tier1',
};

/** Tier 0  the aggregate fields every passport carries, with their real values. */
export function tier0ScopeRows(draft: PassportDraft): ConsentScopeRow[] {
  return (Object.keys(TIER0_DISCLOSURE) as (keyof Omit<PassportDraft, 'consent' | 'occupation' | 'spendingProfile' | 'standing'>)[]).flatMap((k) => {
    const builder = TIER0_DISCLOSURE[k];
    return typeof builder === 'function' ? builder(draft) : [];
  });
}

const EMPLOYMENT_LABELS: Record<ConsentOccupation['employmentType'], string> = {
  salaried: 'Salaried',
  gig: 'Gig',
  'self-employed': 'Self-employed',
  'micro-business': 'Micro-business',
};

/** Tier 1  the verified identity rows plus the self-declared occupation; empty when the draft
 *  carries neither block (i.e. the borrower excluded identity at the ceremony). */
export function tier1ScopeRows(draft: PassportDraft): ConsentScopeRow[] {
  const rows: ConsentScopeRow[] = [];
  const h = draft.holder;
  if (h) {
    rows.push(
      { key: 'holderName', label: 'Verified name', detail: h.name },
      { key: 'holderNric', label: 'IC number (masked)', detail: h.nricMasked },
      { key: 'holderProvider', label: 'Verified by', detail: h.provider },
    );
  }
  const o = draft.occupation;
  if (o) {
    rows.push(
      { key: 'occupation', label: 'Occupation (self-declared)', detail: `${o.occupation} · ${o.sector}` },
      { key: 'employment', label: 'Employment', detail: `${EMPLOYMENT_LABELS[o.employmentType]} · ${o.tenureMonths} mo` },
    );
  }
  return rows;
}

/** Tier 2  the spending-behaviour rows, including the itemised obligations behind the DSR;
 *  empty when the draft carries no spending block. */
export function tier2ScopeRows(draft: PassportDraft): ConsentScopeRow[] {
  const s = draft.spendingProfile;
  if (!s) return [];
  return [
    { key: 'essentialsRatio', label: 'Essential spend share', detail: `${Math.round(s.essentialsRatio * 100)}% of expenses` },
    { key: 'expenseVolatility', label: 'Expense volatility', detail: `${Math.round(s.expenseVolatility * 100)}% month-to-month` },
    { key: 'bufferDays', label: 'Cash buffer', detail: `${Math.round(s.bufferDays)} days` },
    { key: 'savingsRate', label: 'Savings rate', detail: `${Math.round(s.savingsRate * 100)}% of income` },
    { key: 'obligations', label: 'Recurring obligations', detail: `${s.obligations.length} detected · ${rm(s.obligations.reduce((a, o) => a + o.monthlyAmount, 0))}/mo evidenced` },
  ];
}

/**
 * Tier 3  post-disbursement monitoring (Brief S). Not data carried inside the passport (no
 * new block): a receipt-only grant that "the borrower will re-share updated aggregates while
 * this loan is active", with its own expiry set from the loan's tenor rather than the fixed
 * validity windows below. Pure  the row is the same whether shown in the ceremony preview or
 * signed into the receipt.
 */
export function monitoringScopeRow(tenorMonths: number): ConsentScopeRow {
  return {
    key: 'monitoring',
    label: 'Ongoing check-ins',
    detail: `Share updated aggregates while this loan is active (up to ${tenorMonths} months)`,
  };
}

// The passport itself is valid 30 days; aggregate consent expires with it, while a verified
// identity grant is longer-lived (a year)  "identity long-lived, spending profile short"
// (privacy-modes spec). Short-lived grants stand in for a revocation registry.
const DAY_MS = 24 * 60 * 60 * 1000;
const TIER0_VALIDITY_MS = 30 * DAY_MS;
const TIER1_VALIDITY_MS = 365 * DAY_MS;
// Behavioural spending data is the most sensitive tier, so its grant is the shortest-lived 
// "identity long-lived, spending profile short" (privacy-modes spec). It expires with the passport.
const TIER2_VALIDITY_MS = 30 * DAY_MS;
/** Average month length used to turn a loan's tenor (whole months) into a Tier 3 expiry offset. */
const MONTH_MS = 30.44 * DAY_MS;

/**
 * The signed consent receipts for a confirmed ceremony (Brief I stretch). Each tier's scope
 * is the list of field keys the draft actually carries, so the receipt can never disagree
 * with the disclosed rows. A Tier 1 receipt is produced exactly when the draft carries a holder
 * or occupation block, and a Tier 2 receipt when it carries a spending block  which is what
 * buildPassport requires before it will attach those blocks. `monitoring` (Brief S) is separate
 * from the draft: it is never a passport block, just a Tier 3 grant with its own expiry derived
 * from the loan's tenor, produced only when the ceremony is minting against an active loan and
 * the borrower left the monitoring toggle on.
 */
export function buildConsentReceipts(
  draft: PassportDraft,
  now: Date = new Date(),
  monitoring?: { tenorMonths: number },
): ConsentReceipt[] {
  const grantedAt = now.toISOString();
  const receipts: ConsentReceipt[] = [
    { tier: 0, scope: tier0ScopeRows(draft).map((r) => r.key), grantedAt, expiresAt: new Date(now.getTime() + TIER0_VALIDITY_MS).toISOString() },
  ];
  if (draft.holder || draft.occupation) {
    receipts.push({ tier: 1, scope: tier1ScopeRows(draft).map((r) => r.key), grantedAt, expiresAt: new Date(now.getTime() + TIER1_VALIDITY_MS).toISOString() });
  }
  if (draft.spendingProfile) {
    receipts.push({ tier: 2, scope: tier2ScopeRows(draft).map((r) => r.key), grantedAt, expiresAt: new Date(now.getTime() + TIER2_VALIDITY_MS).toISOString() });
  }
  if (monitoring) {
    receipts.push({
      tier: 3,
      scope: [monitoringScopeRow(monitoring.tenorMonths).key],
      grantedAt,
      expiresAt: new Date(now.getTime() + monitoring.tenorMonths * MONTH_MS).toISOString(),
    });
  }
  return receipts;
}
