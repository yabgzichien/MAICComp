// src/lib/dataConfidence.ts
// Pure, deterministic data-authenticity scoring. No UI/DB imports — unit-tested.
import type { TxnSource } from './types';
import { extractFraudFeatures } from './fraudFeatures';
import { scoreFraud } from './fraudModel';

/** Per-source trust weight (how much we trust data from this origin). */
const SOURCE_WEIGHT: Record<TxnSource, number> = {
  verified: 1.0,
  extracted: 0.7,
  imported: 0.7,
  manual: 0.4,
};

/** Minimal transaction shape this module needs. */
export interface ConfidenceTxn {
  amount: number;
  source: TxnSource;
  merchantKey?: string;
  date?: string | null;
}

export interface ConfidenceReason {
  key: string;
  ok: boolean;
  detail: string;
}

export interface DataConfidence {
  confidence: number; // 0..1
  reasons: ConfidenceReason[];
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Provenance-weighted trust 0..1 from transaction sources (0.5 if empty). */
export function provenanceTrust(sources: TxnSource[]): number {
  if (sources.length === 0) return 0.5;
  const total = sources.reduce((s, src) => s + (SOURCE_WEIGHT[src] ?? 0.4), 0);
  return total / sources.length;
}

/**
 * Conformity of leading digits to Benford's Law, 0..1 (1 = perfect).
 * Neutral 0.5 when there are too few amounts to judge (<30).
 */
export function benfordConformity(amounts: number[]): number {
  const digits = amounts
    .map((a) => Math.floor(Math.abs(a)))
    .filter((n) => n > 0)
    .map((n) => Number(String(n)[0]))
    .filter((d) => d >= 1 && d <= 9);
  if (digits.length < 30) return 0.5;
  const counts = new Array(10).fill(0);
  for (const d of digits) counts[d]++;
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    const observed = counts[d] / digits.length;
    const expected = Math.log10(1 + 1 / d);
    deviation += Math.abs(observed - expected);
  }
  return clamp(1 - deviation / 1.7, 0, 1); // normalizer: empirical ~1.9 max total deviation; clamp handles any overflow
}

function roundRatio(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  return amounts.filter((a) => a > 0 && a % 100 === 0).length / amounts.length;
}

function duplicateRatio(txns: ConfidenceTxn[]): number {
  if (txns.length === 0) return 0;
  const seen = new Map<string, number>();
  let dups = 0;
  for (const t of txns) {
    const k = `${t.merchantKey ?? ''}|${t.amount}|${t.date ?? ''}`;
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    if (c > 1) dups++;
  }
  return dups / txns.length;
}

/**
 * Overall data confidence 0..1 with human-readable reasons.
 *
 * `coverageRatio` (0..1, optional) is the 90-day data-coverage signal from `lib/coverage.ts`.
 * When omitted, the function behaves exactly as before (back-compat). When provided, a small
 * weight is taken from the round-number and duplicate sub-weights so trust + Benford keep
 * their dominance, and one extra `ConfidenceReason` row reports coverage.
 *
 * `expenseRatio` (recorded expenses ÷ recorded income, optional) drives a plausibility check:
 * a working person spends a meaningful share of income, so an implausibly low ratio suggests
 * the picture is incomplete (e.g. income-only screenshots). It is treated as a penalty (like
 * the ML penalty), not a weighted term, so a healthy ratio leaves confidence untouched.
 */
export function computeDataConfidence(
  txns: ConfidenceTxn[],
  coverageRatio?: number,
  expenseRatio?: number
): DataConfidence {
  const amounts = txns.map((t) => t.amount);
  const trust = provenanceTrust(txns.map((t) => t.source));
  const benford = benfordConformity(amounts);
  const round = roundRatio(amounts);
  const dup = duplicateRatio(txns);
  const roundPenalty = clamp((round - 0.2) / 0.5, 0, 1);

  const coverageProvided = typeof coverageRatio === 'number';
  const cov = coverageProvided ? clamp(coverageRatio as number, 0, 1) : 0;

  // Weighting: when coverage is provided, take 0.05 from round + 0.05 from duplicates so
  // trust (0.5) + Benford (0.25) keep their dominance and coverage carries 0.10.
  const heuristicConfidence = coverageProvided
    ? clamp(
        trust * 0.5 + benford * 0.25 + (1 - roundPenalty) * 0.1 + (1 - dup) * 0.05 + cov * 0.1,
        0,
        1
      )
    : clamp(
        trust * 0.5 + benford * 0.25 + (1 - roundPenalty) * 0.15 + (1 - dup) * 0.1,
        0,
        1
      );

  // ML fraud model blending
  const fraudFeatures = extractFraudFeatures(txns);
  const fraudScore = scoreFraud(fraudFeatures);
  const mlPenalty = fraudScore.probability * 0.3; // up to 0.3 penalty at max fraud prob

  // Plausibility: recorded expenses should be a meaningful share of recorded income.
  // Below PLAUSIBLE_EXPENSE_FLOOR the picture looks curated/incomplete → a penalty up to 0.25.
  const PLAUSIBLE_EXPENSE_FLOOR = 0.4;
  const plausibilityProvided = typeof expenseRatio === 'number';
  const expRatio = plausibilityProvided ? clamp(expenseRatio as number, 0, 1) : 1;
  const plausibility = clamp(expRatio / PLAUSIBLE_EXPENSE_FLOOR, 0, 1);
  const plausibilityPenalty = plausibilityProvided ? (1 - plausibility) * 0.25 : 0;

  const confidence = clamp(heuristicConfidence * (1 - mlPenalty) * (1 - plausibilityPenalty), 0, 1);

  const reasons: ConfidenceReason[] = [
    { key: 'provenance', ok: trust >= 0.7, detail: `source trust ${Math.round(trust * 100)}%` },
    {
      key: 'benford',
      ok: benford >= 0.6,
      detail: amounts.length >= 30 ? `Benford conformity ${Math.round(benford * 100)}%` : 'not enough data for Benford',
    },
    { key: 'round_numbers', ok: roundPenalty === 0, detail: `${Math.round(round * 100)}% round amounts` },
    { key: 'duplicates', ok: dup < 0.05, detail: `${Math.round(dup * 100)}% duplicate-looking rows` },
  ];

  if (coverageProvided) {
    reasons.push({
      key: 'coverage',
      ok: cov >= 0.3,
      detail: `coverage ${Math.round(cov * 100)}% of last 90 days`,
    });
  }

  if (plausibilityProvided) {
    const ok = expRatio >= PLAUSIBLE_EXPENSE_FLOOR;
    reasons.push({
      key: 'plausibility',
      ok,
      detail: ok
        ? `expenses ${Math.round(expRatio * 100)}% of income`
        : `expenses only ${Math.round(expRatio * 100)}% of income — picture may be incomplete`,
    });
  }

  // Append top 2 ML fraud contributions as reasons (only when enough data)
  if (txns.length >= 10) {
    const top2 = fraudScore.contributions.slice(0, 2);
    for (const contribution of top2) {
      reasons.push({
        key: `ml_${contribution.feature}`,
        ok: contribution.weight < 0, // negative weight = pushes toward genuine = ok
        detail: `ML: ${contribution.feature.replace(/_/g, ' ')} (${contribution.weight >= 0 ? 'fraud signal' : 'genuine signal'})`,
      });
    }
  }

  return { confidence, reasons };
}
