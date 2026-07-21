// src/lib/borrowingLimit.ts
// Graduated (progressive) borrowing limit  the "how much can this user borrow" ceiling, composed
// from signals that each act in exactly ONE place (no double-counting):
//   - credit score      -> already picks the product tier, which sets `engineMax` (via decideLoan)
//   - data confidence    -> already gates approval + dampens the score that picks the tier
//   - affordability       -> already caps `engineMax` by surplus share + DSR
//   - repayment record   -> THIS module's NEW lever: a progression cap that starts small on the
//                            first loan, grows with each on-time repayment, and is cut by misses
//   - existing exposure  -> subtract the outstanding principal on active loans (stacking defence)
// Pure and deterministic; no UI/DB imports. `engineMax` is decideLoan(...).maxAmount evaluated at
// the ladder's top request  it already encodes score/confidence/coverage/affordability, so this
// module never re-applies them.

import type { LoanApplication } from '../db/loansRepo';

export interface ProgressionPolicy {
  /** Ceiling for a borrower with no repayment record yet (classic graduated-lending first loan). */
  firstLoanCap: number;
  /** How much each on-time repayment raises the cap. */
  stepPerOnTime: number;
  /** How much each missed installment cuts the cap. */
  missedPenalty: number;
}

export const DEFAULT_PROGRESSION: ProgressionPolicy = {
  firstLoanCap: 5000,
  stepPerOnTime: 1500,
  missedPenalty: 3000,
};

/**
 * The repayment-driven ceiling, clamped to `[0, ladderMax]`. Grows from `firstLoanCap` by
 * `stepPerOnTime` per on-time repayment; each missed installment subtracts `missedPenalty`
 * (so a poor record freezes borrowing toward zero). Never exceeds the product ladder's top.
 */
export function progressionCap(
  repaymentOnTime: number,
  repaymentMissed: number,
  ladderMax: number,
  policy: ProgressionPolicy = DEFAULT_PROGRESSION,
): number {
  const raw =
    policy.firstLoanCap +
    Math.max(0, repaymentOnTime) * policy.stepPerOnTime -
    Math.max(0, repaymentMissed) * policy.missedPenalty;
  return Math.max(0, Math.min(ladderMax, Math.round(raw)));
}

/** Sum the outstanding principal on active loans, read from each loan's linked liability account's
 *  current value (the balance we pay down as the borrower repays). Loans with no linked account
 *  (legacy rows) contribute nothing. Pure. */
export function outstandingExposure(
  applications: LoanApplication[],
  accountValues: Record<string, number>,
): number {
  let total = 0;
  for (const app of applications) {
    if (app.status !== 'active' || !app.liabilityAccountId) continue;
    total += accountValues[app.liabilityAccountId] ?? 0;
  }
  return Math.round(total);
}

export type LimitBinding = 'affordability' | 'progression' | 'exposure';

export interface BorrowingLimitInput {
  /** decideLoan(...).maxAmount at the ladder top  score/confidence/coverage/affordability baked in. */
  engineMax: number;
  /** Top of the product ladder (the absolute ceiling the progression cap is clamped to). */
  ladderMax: number;
  repaymentOnTime: number;
  repaymentMissed: number;
  /** Outstanding principal already borrowed (see `outstandingExposure`). */
  outstandingPrincipal: number;
}

export interface BorrowingLimit {
  /** Total borrowing power before subtracting what's already outstanding: min(engineMax, progressionCap). */
  limit: number;
  /** What the borrower can still draw now: max(0, limit  outstandingPrincipal). */
  available: number;
  outstanding: number;
  progressionCap: number;
  /** Which signal is holding the borrower back  drives the explainable "why" line. */
  binding: LimitBinding;
  reason: string;
}

/** Compose the borrowing limit from the engine's affordability max, the repayment progression cap,
 *  and existing exposure. Pure and deterministic. */
export function computeBorrowingLimit(
  input: BorrowingLimitInput,
  policy: ProgressionPolicy = DEFAULT_PROGRESSION,
): BorrowingLimit {
  const cap = progressionCap(input.repaymentOnTime, input.repaymentMissed, input.ladderMax, policy);
  const engineMax = Math.max(0, Math.round(input.engineMax));
  const limit = Math.min(engineMax, cap);
  const outstanding = Math.max(0, Math.round(input.outstandingPrincipal));
  const available = Math.max(0, limit - outstanding);

  // The binding constraint, most-restrictive first: if exposure alone has exhausted the limit,
  // that's the story; otherwise whichever of affordability / progression set the lower ceiling.
  let binding: LimitBinding;
  let reason: string;
  if (outstanding > 0 && available < limit) {
    binding = 'exposure';
    reason =
      available > 0
        ? `RM${available.toLocaleString('en-MY')} of your RM${limit.toLocaleString('en-MY')} limit is free — the rest is committed to loans you're already repaying.`
        : `You've drawn your full RM${limit.toLocaleString('en-MY')} limit — repay before borrowing more.`;
  } else if (cap < engineMax) {
    binding = 'progression';
    reason =
      input.repaymentMissed > 0
        ? 'Your limit is held back by a missed repayment — a clean run of on-time payments raises it.'
        : 'Your limit grows as you build an on-time repayment record.';
  } else {
    binding = 'affordability';
    reason = 'Your limit is set by what your income and score can affordably support.';
  }

  return { limit, available, outstanding, progressionCap: cap, binding, reason };
}
