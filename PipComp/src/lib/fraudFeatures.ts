// src/lib/fraudFeatures.ts
// Pure feature extraction for the fraud/authenticity detection model.
// Produces the 9-element vector defined in tools/fraudData/FEATURES.md.
// No DB, UI, or external imports  unit-tested.
import { provenanceTrust, benfordConformity, type ConfidenceTxn } from './dataConfidence';

// ── Utilities ─────────────────────────────────────────────────────────────────

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

// ── Named feature record ──────────────────────────────────────────────────────

export interface FraudFeatures {
  readonly provenance_trust: number;   // [0]
  readonly benford_conformity: number; // [1]
  readonly round_ratio: number;        // [2]
  readonly duplicate_ratio: number;    // [3]
  readonly gap_mean: number;           // [4]
  readonly gap_variance: number;       // [5]
  readonly merchant_entropy: number;   // [6]
  readonly amount_mean_norm: number;   // [7]
  readonly amount_cv: number;          // [8]
}

// ── toFeatureVector ───────────────────────────────────────────────────────────

/** Returns the canonical 9-element feature vector in FEATURES.md index order. */
export function toFeatureVector(f: FraudFeatures): number[] {
  return [
    f.provenance_trust,   // 0
    f.benford_conformity, // 1
    f.round_ratio,        // 2
    f.duplicate_ratio,    // 3
    f.gap_mean,           // 4
    f.gap_variance,       // 5
    f.merchant_entropy,   // 6
    f.amount_mean_norm,   // 7
    f.amount_cv,          // 8
  ];
}

// ── Internal feature helpers ──────────────────────────────────────────────────

/** Fraction of amounts divisible by 100 where amount > 0, divided by total txn count. */
function computeRoundRatio(txns: ConfidenceTxn[]): number {
  if (txns.length === 0) return 0;
  const roundCount = txns.filter((t) => t.amount > 0 && t.amount % 100 === 0).length;
  return roundCount / txns.length;
}

/** Fraction of duplicate rows (same merchantKey|amount|date key). */
function computeDuplicateRatio(txns: ConfidenceTxn[]): number {
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

/** Compute gap_mean (normalized by 30) and gap_variance (normalized by 100). */
function computeGapFeatures(txns: ConfidenceTxn[]): { gap_mean: number; gap_variance: number } {
  // Collect dated transactions and sort by ISO date string.
  const dated = txns
    .filter((t) => t.date != null && t.date !== '')
    .map((t) => t.date as string)
    .sort();

  if (dated.length < 2) return { gap_mean: 0, gap_variance: 0 };

  // Compute gaps in days between consecutive dated transactions.
  const MS_PER_DAY = 86_400_000;
  const gaps: number[] = [];
  for (let i = 1; i < dated.length; i++) {
    const prev = new Date(dated[i - 1]).getTime();
    const curr = new Date(dated[i]).getTime();
    gaps.push((curr - prev) / MS_PER_DAY);
  }

  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;

  return {
    gap_mean: clamp(mean / 30, 0, 1),
    gap_variance: clamp(variance / 100, 0, 1),
  };
}

/** Shannon entropy of merchant frequency, normalized by log2(uniqueCount + 1). */
function computeMerchantEntropy(txns: ConfidenceTxn[]): number {
  const freq = new Map<string, number>();
  for (const t of txns) {
    if (t.merchantKey === undefined) continue;
    freq.set(t.merchantKey, (freq.get(t.merchantKey) ?? 0) + 1);
  }
  const unique = freq.size;
  if (unique <= 1) return 0;

  const total = Array.from(freq.values()).reduce((s, c) => s + c, 0);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return clamp(entropy / Math.log2(unique + 1), 0, 1);
}

/** Mean amount normalized by 5000, clamped 0..1. */
function computeAmountMeanNorm(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  return clamp(mean / 5000, 0, 1);
}

/** Coefficient of variation (std/mean), clamped 0..1. Returns 0 if mean === 0. */
function computeAmountCV(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  if (mean === 0) return 0;
  const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
  const std = Math.sqrt(variance);
  return clamp(std / mean, 0, 1);
}

// ── Main extraction function ──────────────────────────────────────────────────

/** Extracts the 9-feature FraudFeatures record from a list of ConfidenceTxn. */
export function extractFraudFeatures(txns: ConfidenceTxn[]): FraudFeatures {
  if (txns.length === 0) {
    return {
      provenance_trust: 0,
      benford_conformity: 0,
      round_ratio: 0,
      duplicate_ratio: 0,
      gap_mean: 0,
      gap_variance: 0,
      merchant_entropy: 0,
      amount_mean_norm: 0,
      amount_cv: 0,
    };
  }

  const amounts = txns.map((t) => t.amount);
  const sources = txns.map((t) => t.source);

  // provenanceTrust returns 0.5 for empty; we want 0 for our empty-input guarantee,
  // but the guard above handles that already. For non-empty, use the real function.
  const provenance_trust = provenanceTrust(sources);

  // benfordConformity returns 0.5 for <30 amounts (neutral). Match training generator.
  const benford_conformity = benfordConformity(amounts);

  const round_ratio = computeRoundRatio(txns);
  const duplicate_ratio = computeDuplicateRatio(txns);
  const { gap_mean, gap_variance } = computeGapFeatures(txns);
  const merchant_entropy = computeMerchantEntropy(txns);
  const amount_mean_norm = computeAmountMeanNorm(amounts);
  const amount_cv = computeAmountCV(amounts);

  return {
    provenance_trust,
    benford_conformity,
    round_ratio,
    duplicate_ratio,
    gap_mean,
    gap_variance,
    merchant_entropy,
    amount_mean_norm,
    amount_cv,
  };
}
