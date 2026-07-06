/**
 * Consent ceremony — single source of truth for what a minted passport carries.
 *
 * `buildPassportDraft` assembles the exact `PassportInput` (minus the signing
 * subject, which only exists at mint time) that a confirmed ceremony will sign.
 * The tier scope rows shown on the ceremony screen are derived from that same
 * draft, so what the borrower reviews is byte-for-byte what gets minted.
 *
 * The Tier 0 disclosure map below is exhaustive over the draft's keys: adding a
 * field to `PassportInput` fails compilation here until the ceremony discloses
 * it — the display list cannot silently drift from the signed payload.
 */

import type { PassportInput } from './passport';
import type { CreditProfile, CreditScore } from './creditScore';
import { leadingDigitHistogram, type DataConfidence } from './dataConfidence';
import type { Coverage } from './coverage';
import type { Momentum } from './momentum';
import { ENGINE_VERSION, MODEL_WEIGHTS_VERSION, POLICY_VERSION } from './versions';

/** Everything of the signed passport input except the subject key (mint-time only). */
export type PassportDraft = Omit<PassportInput, 'subject'>;

/** Verified identity as the ceremony needs it — a structural subset of kycRepo's KycIdentity. */
export interface ConsentIdentity {
  fullName: string;
  nricMasked: string;
  provider: string;
}

export interface PassportDraftArgs {
  profile: CreditProfile;
  score: CreditScore;
  dataConfidence: DataConfidence;
  coverage: Coverage;
  momentum: Momentum;
  /** Transaction amounts behind the confidence run — the digit histogram's input. */
  amounts: number[];
  identity: ConsentIdentity | null;
  /** Tier 1 grant: carry the verified identity into the passport. */
  includeIdentity: boolean;
}

/** One plain-language line on the ceremony screen: a field the passport will carry, with its real value. */
export interface ConsentScopeRow {
  key: string;
  label: string;
  detail: string;
}

/** Whole-ringgit display without Intl (Hermes locale-data gaps — same reasoning as lib/format.ts). */
function rm(n: number): string {
  const negative = n < 0;
  const grouped = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-RM' : 'RM') + grouped;
}

/** Assemble the passport input a confirmed ceremony will sign. Pure — deterministic given args. */
export function buildPassportDraft(args: PassportDraftArgs): PassportDraft {
  const { profile, score, dataConfidence, coverage, momentum, amounts, identity, includeIdentity } = args;

  const provenanceSummary =
    dataConfidence.reasons.length > 0
      ? dataConfidence.reasons.map((r) => r.detail).join('; ')
      : 'No provenance data available';

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
      monthlyDebtService: profile.monthlyDebtService,
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
    momentum: {
      lookbackDays: momentum.lookbackDays,
      scoreFrom: momentum.scoreFrom,
      scoreTo: momentum.scoreTo,
      coverageDaysFrom: momentum.coverageDaysFrom,
      coverageDaysTo: momentum.coverageDaysTo,
      direction: momentum.direction,
    },
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
 */
const TIER0_DISCLOSURE: { [K in keyof PassportDraft]-?: RowBuilder | 'mergedIntoScore' | 'tier1' } = {
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
            detail: `9 digit counts across ${d.digitHistogram.reduce((s, n) => s + n, 0)} amounts — no individual amounts`,
          },
        ]
      : [],
  provenanceSummary: (d) => [{ key: 'provenance', label: 'Data provenance summary', detail: d.provenanceSummary }],
  aggregates: (d) => [
    {
      key: 'evidence',
      label: 'Evidence fingerprint',
      detail: `SHA-256 fingerprint of ${Object.keys(d.aggregates).length} aggregate figures — a hash, not the figures`,
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
  holder: 'tier1',
};

/** Tier 0 — the aggregate fields every passport carries, with their real values. */
export function tier0ScopeRows(draft: PassportDraft): ConsentScopeRow[] {
  return (Object.keys(TIER0_DISCLOSURE) as (keyof PassportDraft)[]).flatMap((k) => {
    const builder = TIER0_DISCLOSURE[k];
    return typeof builder === 'function' ? builder(draft) : [];
  });
}

/** Tier 1 — the verified identity rows; empty when the draft carries no holder block. */
export function tier1ScopeRows(draft: PassportDraft): ConsentScopeRow[] {
  const h = draft.holder;
  if (!h) return [];
  return [
    { key: 'holderName', label: 'Verified name', detail: h.name },
    { key: 'holderNric', label: 'IC number (masked)', detail: h.nricMasked },
    { key: 'holderProvider', label: 'Verified by', detail: h.provider },
  ];
}
