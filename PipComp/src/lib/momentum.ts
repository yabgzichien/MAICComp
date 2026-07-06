// src/lib/momentum.ts
// Pure "Credit Momentum" — the borrower's score/coverage *trajectory*, recomputed from the same
// dated transaction evidence the passport anchors (never a separate log). Thin-file borrowers can't
// show a high level, but they can show verifiable upward direction. No UI/DB imports — unit-tested.
import { assembleCredit, type CreditInputs } from './assembleCredit';

export type MomentumDirection = 'rising' | 'flat' | 'falling';

export interface Momentum {
  lookbackDays: number;
  scoreFrom: number;
  scoreTo: number;
  coverageDaysFrom: number;
  coverageDaysTo: number;
  confidenceFrom: number;
  confidenceTo: number;
  direction: MomentumDirection;
}

const DEFAULT_LOOKBACK_DAYS = 90;
/** Score moves within ±this over the window read as "flat" (noise, not a trend). */
const FLAT_BAND = 5;
/** Minimum-history floor (Brief D): the from-point must itself rest on meaningful data —
 *  at least this many covered days at (now − lookback) — before a trajectory is claimed.
 *  Below it no block is emitted: an absent block is honest; a universal "rising" that every
 *  brand-new user gets for free is not. */
const MIN_FROM_COVERAGE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Compare the borrower's assembled profile now vs `lookbackDays` ago, replaying the deterministic
 * engines over the transactions on/before each date. Only transaction-derived signals move (net
 * worth and repayment count are held), so this is the honest data-growth trajectory.
 *
 * Returns null when the from-point had fewer than MIN_FROM_COVERAGE_DAYS covered days —
 * there is no meaningful baseline to measure a trajectory from.
 */
export function computeMomentum(
  input: CreditInputs,
  now: Date = new Date(),
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Momentum | null {
  const past = new Date(now.getTime() - lookbackDays * DAY_MS);
  const from = assembleCredit(input, past);
  if (from.coverage.daysCovered < MIN_FROM_COVERAGE_DAYS) return null;
  const to = assembleCredit(input, now);

  const delta = to.score.score - from.score.score;
  const direction: MomentumDirection = delta > FLAT_BAND ? 'rising' : delta < -FLAT_BAND ? 'falling' : 'flat';

  return {
    lookbackDays,
    scoreFrom: from.score.score,
    scoreTo: to.score.score,
    coverageDaysFrom: from.coverage.daysCovered,
    coverageDaysTo: to.coverage.daysCovered,
    confidenceFrom: from.dataConfidence.confidence,
    confidenceTo: to.dataConfidence.confidence,
    direction,
  };
}
