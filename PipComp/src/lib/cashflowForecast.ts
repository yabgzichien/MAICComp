// src/lib/cashflowForecast.ts
// Pure, deterministic next-month cash-flow forecast over the borrower's own monthly nets.
//
// NOT a confidence score. dataConfidence.ts answers "is this evidence real?"; this module
// answers "how low might next month's net realistically go?". The two are orthogonal and
// must never be conflated  a well-calibrated band computed over fabricated data is still
// worthless, which is why the authenticity gates stay exactly where they are.
//
// No trained weights: the borrower has 4-6 monthly observations, which cannot identify an
// ARIMA order or train a tree ensemble. What 4-6 points *can* support is a textbook
// one-sided prediction bound, which is auditable arithmetic rather than a fitted model
// consistent with this project's rule that the AI never computes the decision. The
// t-multipliers below are hardcoded so the module carries no stats dependency.
//
// Validated (not trained) against the Berka/PKDD'99 account panel  see
// tools/cashflowForecast/evaluate.ts and docs/cashflow-forecast.md.
//
// No UI/DB imports  unit-tested.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CashflowForecast {
  /** Recency-weighted point forecast of next month's net cash flow (RM/mo). */
  nextMonthNet: number;
  /** One-sided 95% lower prediction bound on next month's net (RM/mo). May be negative. */
  lowerBound95: number;
  /** Number of completed months the forecast consumed (MIN_FORECAST_MONTHS..MAX_FORECAST_MONTHS). */
  monthsUsed: number;
  /** Pinned method identifier, signed into the passport for audit/replay. */
  method: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Method identifier signed into the passport. Bump when the math changes. */
export const FORECAST_METHOD = 'wma-linear+t95';

/** Below this many completed months, no forecast is emitted (a band over 3 points is fiction). */
export const MIN_FORECAST_MONTHS = 4;

/** The engine only ever aggregates 6 months, so longer series are truncated to the latest 6. */
export const MAX_FORECAST_MONTHS = 6;

/**
 * One-sided 95% Student-t multipliers, keyed by sample size n (df = n - 1).
 * Hardcoded rather than computed so the module stays dependency-free and the paper can
 * cite exact constants. Only the supported window sizes are present.
 */
const T95_ONE_SIDED: Readonly<Record<number, number>> = {
  4: 2.353, // df 3
  5: 2.132, // df 4
  6: 2.015, // df 5
};

// ── Forecast ──────────────────────────────────────────────────────────────────

/**
 * Forecast next month's net cash flow from the borrower's own completed-month nets.
 *
 * @param monthlyNets Completed-month nets, **oldest → newest**. Partial (current) months and
 *                    months with no recorded activity must be excluded by the caller  a
 *                    zero from an empty month is not an observation.
 * @returns The forecast, or `null` when fewer than MIN_FORECAST_MONTHS usable points exist
 *          (callers then fall back to the historical-average behaviour unchanged).
 *
 * Point estimate: linear-recency weighted mean (weight `i + 1`, so the latest month counts
 * n times the oldest). Chosen over exponential smoothing because it has no tunable decay
 * parameter to justify and reads plainly in an adverse-action letter.
 *
 * Lower bound: the classic one-sided prediction bound `x̄ - t·s·√(1 + 1/n)`, centred on the
 * *plain* mean so the textbook coverage guarantee holds, then clamped to never exceed the
 * point estimate. That clamp is a defensive invariant, not a live branch: `x̄ - WMA` is a
 * zero-sum linear functional of the series, so `(x̄ - WMA)/s <= ‖c‖·√(n-1)` (0.39 at n=4,
 * 0.45 at n=6), well under the `t·√(1 + 1/n)` the bound always subtracts (2.63 / 2.18).
 * It cannot fire for n in 4..6  it exists so the invariant survives any future retune.
 */
export function forecastNextMonthNet(monthlyNets: number[]): CashflowForecast | null {
  if (!Array.isArray(monthlyNets)) return null;
  if (!monthlyNets.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;

  const series = monthlyNets.slice(-MAX_FORECAST_MONTHS);
  const n = series.length;
  if (n < MIN_FORECAST_MONTHS) return null;

  const t = T95_ONE_SIDED[n];
  if (t === undefined) return null; // unreachable given the truncation above; defensive

  // Point estimate: linear recency weights, oldest → newest.
  let weightedSum = 0;
  let weightTotal = 0;
  series.forEach((x, i) => {
    const w = i + 1;
    weightedSum += w * x;
    weightTotal += w;
  });
  const nextMonthNet = weightedSum / weightTotal;

  // Prediction bound around the unweighted mean (sample stdev, n-1 denominator).
  const mean = series.reduce((s, x) => s + x, 0) / n;
  const variance = series.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const stdev = Math.sqrt(variance);
  const bound = mean - t * stdev * Math.sqrt(1 + 1 / n);

  return {
    nextMonthNet,
    lowerBound95: Math.min(bound, nextMonthNet),
    monthsUsed: n,
    method: FORECAST_METHOD,
  };
}
