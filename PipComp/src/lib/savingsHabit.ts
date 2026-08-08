// src/lib/savingsHabit.ts
// Pay-yourself-first habit tracking: how many months in a row the borrower kept back at least
// their own savings target. Pure, unit-tested, no UI or DB imports.
//
// PURE MOTIVATION, NOT A CREDIT SIGNAL. Like `streak.ts`, nothing here reaches `creditScore.ts`,
// `dataConfidence.ts` or any loan decision, and it must stay that way. Real surplus already
// reaches the score through the cashflow and savings-rate factors, computed from the ledger. A
// target is something the borrower sets for themselves, so scoring it would reward setting a low
// one, and rewarding a self-set number is exactly the kind of gameable signal the rest of this
// codebase is built to avoid.
//
// WHY MONTHS AND NOT DAYS. EPF and AKPK both frame the habit as a fixed set-aside each time
// income lands, and the target user is paid irregularly rather than daily, so the month is the
// smallest unit where "did you keep any of it" is a meaningful question.
import { monthKey, txnMonthKey } from './budget';
import type { Transaction } from './types';

/** Suggested starting target. Deliberately small: AKPK's guidance is to start at an amount that
 *  survives a bad month and raise it as income grows, not to start at what looks impressive. */
export const DEFAULT_SAVINGS_TARGET = 50;

export interface SavingsHabit {
  /** The monthly amount the borrower committed to keeping back. */
  target: number;
  /** Consecutive full months, counting back from the last one, that met the target. */
  monthsKept: number;
  /** The longest run ever achieved, so a lapse does not erase the evidence of the habit. */
  bestRun: number;
  /** Net surplus in the current, part-finished month. May be negative. */
  thisMonthSaved: number;
  /** Whether the current month has already cleared the target. */
  thisMonthMet: boolean;
  /** Progress through the current month's target, 0 to 1. */
  thisMonthProgress: number;
  /** Full months of history the run was measured over. */
  monthsObserved: number;
}

/** Months of an unbroken run before Pip suggests raising the target. */
const RUN_BEFORE_STEP_UP = 3;

/**
 * Whether to nudge the borrower toward the guide's own savings figure, and to what.
 *
 * Two savings numbers exist on purpose and they should eventually meet. The habit starts at a
 * deliberately small RM50 because AKPK's guidance is to begin at an amount that survives a bad
 * month; Belanjawanku separately recommends 10% of the minimum wage for this household. Nudging
 * only once a run is established is the "increase gradually" half of that same advice, and it
 * means the suggestion arrives as evidence the borrower can afford more rather than as a target
 * set before they have kept a single month.
 *
 * Returns null when there is no run yet, no guide figure, or the target already meets it.
 */
export function savingsStepUp(habit: SavingsHabit, guideSuggestion: number | undefined): number | null {
  if (!guideSuggestion || guideSuggestion <= habit.target) return null;
  return habit.monthsKept >= RUN_BEFORE_STEP_UP ? guideSuggestion : null;
}

/** Net surplus (income minus expenses) per month, oldest first, excluding the current month. */
function fullMonthNets(txns: Transaction[], currentMonth: string): { month: string; net: number }[] {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    const mk = txnMonthKey(t);
    if (!mk || mk >= currentMonth) continue;
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + (t.type === 'income' ? t.amount : -t.amount));
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([month, net]) => ({ month, net }));
}

/**
 * How the pay-yourself-first habit is going.
 *
 * The run is measured over full months only and breaks on the first month that fell short,
 * counting back from the most recent full month. The current month is reported separately as
 * live progress rather than folded into the run, since it is not over yet and would otherwise
 * reset the count to zero on the 1st of every month.
 *
 * A target of zero or less means no commitment has been made, so there is no run to report.
 */
export function computeSavingsHabit(
  txns: Transaction[],
  target: number,
  now: Date = new Date()
): SavingsHabit {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = fullMonthNets(txns, currentMonth);

  let thisMonthSaved = 0;
  for (const t of txns) {
    if ((monthKey(t.date) ?? monthKey(t.createdAt)) !== currentMonth) continue;
    thisMonthSaved += t.type === 'income' ? t.amount : -t.amount;
  }
  thisMonthSaved = Math.round(thisMonthSaved);

  if (!(target > 0)) {
    return {
      target: 0,
      monthsKept: 0,
      bestRun: 0,
      thisMonthSaved,
      thisMonthMet: false,
      thisMonthProgress: 0,
      monthsObserved: months.length,
    };
  }

  let monthsKept = 0;
  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i].net < target) break;
    monthsKept++;
  }

  let bestRun = 0;
  let run = 0;
  for (const m of months) {
    run = m.net >= target ? run + 1 : 0;
    if (run > bestRun) bestRun = run;
  }

  return {
    target,
    monthsKept,
    bestRun: Math.max(bestRun, monthsKept),
    thisMonthSaved,
    thisMonthMet: thisMonthSaved >= target,
    thisMonthProgress: Math.max(0, Math.min(1, thisMonthSaved / target)),
    monthsObserved: months.length,
  };
}
