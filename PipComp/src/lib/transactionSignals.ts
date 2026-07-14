// src/lib/transactionSignals.ts
// Pure, provenance/digit-pattern signals shared by dataConfidence.ts and fraudFeatures.ts.
// Split out (UI/UX P3.19) to break a require cycle: dataConfidence.ts previously imported
// fraudFeatures.ts (to blend the ML fraud probability into confidence) while fraudFeatures.ts
// imported these signals back FROM dataConfidence.ts. Neither file depends on the other now;
// dataConfidence.ts re-exports everything below so no other import site changes.
import type { TxnSource, TxnType } from './types';

/** Minimal transaction shape the shared signals + the confidence/fraud modules need. */
export interface ConfidenceTxn {
  amount: number;
  source: TxnSource;
  merchantKey?: string;
  date?: string | null;
  /** income vs expense  required for the asymmetric-fraud integrity rings (Section 4 of the
   *  confidence-hardening plan). Optional for back-compat: when absent on every row the rings
   *  are inert and confidence is computed exactly as before. */
  type?: TxnType;
  /** Raw payer/merchant string, used by the merchant-to-income entity-alignment check. */
  merchantRaw?: string;
  /** Running-account balance after this row, when the source document carries one. Drives the
   *  ledger reconciliation ring; inert (no balance) for screenshots and manual entry. */
  balance?: number | null;
}

/** Per-source trust weight (how much we trust data from this origin). */
const SOURCE_WEIGHT: Record<TxnSource, number> = {
  verified: 1.0,
  extracted: 0.7,
  imported: 0.7,
  manual: 0.4,
};

/** Provenance-weighted trust 0..1 from transaction sources (0.5 if empty). */
export function provenanceTrust(sources: TxnSource[]): number {
  if (sources.length === 0) return 0.5;
  const total = sources.reduce((s, src) => s + (SOURCE_WEIGHT[src] ?? 0.4), 0);
  return total / sources.length;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/**
 * Counts of leading digits 1–9 across the given amounts (index 0 = digit 1).
 * Aggregate-only  shared by `benfordConformity` and the passport's signed
 * `digitHistogram` block, so both always describe the same evidence.
 */
export function leadingDigitHistogram(amounts: number[]): number[] {
  const counts = new Array(9).fill(0);
  for (const a of amounts) {
    const n = Math.floor(Math.abs(a));
    if (n <= 0) continue;
    const d = Number(String(n)[0]);
    if (d >= 1 && d <= 9) counts[d - 1]++;
  }
  return counts;
}

/** Benford's Law only emerges over data spanning multiple orders of magnitude; below this
 *  spread, honest narrow-band earners (daily gig payouts RM80–120, hawker QR sales) would be
 *  penalized for their band's position on the number line, not for inauthenticity. */
const BENFORD_MIN_DISPERSION_DECADES = 1.2;

/** The absolute amounts the digit histogram actually counts (|a| ≥ 1). */
function benfordEligibleAmounts(amounts: number[]): number[] {
  return amounts.map((a) => Math.abs(a)).filter((a) => Math.floor(a) > 0);
}

/**
 * True when the amounts span too narrow a range for Benford analysis to be informative.
 * Dispersion measure: log10 of the p90/p10 ratio of the eligible absolute amounts, using
 * nearest-rank percentiles  robust to a handful of outlier rows, unlike max/min.
 */
export function benfordRangeTooNarrow(amounts: number[]): boolean {
  const xs = benfordEligibleAmounts(amounts).sort((a, b) => a - b);
  if (xs.length === 0) return true;
  const p = (q: number) => xs[Math.max(0, Math.ceil(q * xs.length) - 1)];
  return Math.log10(p(0.9) / p(0.1)) < BENFORD_MIN_DISPERSION_DECADES;
}

/**
 * Conformity of leading digits to Benford's Law, 0..1 (1 = perfect).
 * Neutral 0.5 when there are too few amounts to judge (<30), and neutral 0.5 when the
 * amounts span too narrow a range for the law to apply (see BENFORD_MIN_DISPERSION_DECADES)
 * the same convention, because in both cases the check is unreliable, not failed.
 */
export function benfordConformity(amounts: number[]): number {
  const counts = leadingDigitHistogram(amounts);
  const total = counts.reduce((s, c) => s + c, 0);
  if (total < 30) return 0.5;
  if (benfordRangeTooNarrow(amounts)) return 0.5;
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    const observed = counts[d - 1] / total;
    const expected = Math.log10(1 + 1 / d);
    deviation += Math.abs(observed - expected);
  }
  return clamp(1 - deviation / 1.7, 0, 1); // normalizer: empirical ~1.9 max total deviation; clamp handles any overflow
}
