// src/lib/incomeBaseline.ts
// A safe monthly income figure for borrowers whose earnings are irregular. Pure, unit-tested,
// no UI or DB imports.
//
// WHY NOT THE AVERAGE. The target user is a gig driver, hawker or online seller: their income
// swings month to month, and a budget built on the average is unaffordable in every below-average
// month, which is most of the reason budgets get abandoned. The standard adaptation for irregular
// earners is to plan against a conservative floor instead, so a good month produces surplus rather
// than a bad month producing a shortfall. That floor is what this module computes.
//
// SCOPE. This is a BUDGETING figure only. Credit scoring and affordability keep using the
// averages `assembleCredit.ts` computes; nothing here feeds the score, the passport, or a loan
// decision. Two different questions deserve two different numbers, and quietly swapping the
// lender-facing income for a deliberately pessimistic one would understate real capacity.
import { txnMonthKey } from './budget';
import type { Transaction } from './types';

/** Full months of history needed before the conservative percentile is used. */
const MONTHS_FOR_PERCENTILE = 6;
/** Full months of history needed before an irregularity verdict is trustworthy at all. */
const MIN_MONTHS = 3;
/**
 * Coefficient of variation above which income counts as irregular. A salaried borrower sits near
 * zero; a gig worker whose months swing by a third or more of their own mean sits well above.
 */
const IRREGULAR_CV = 0.15;

export type BaselineMethod = 'percentile' | 'lowest' | 'average' | 'none';

export interface IncomeBaseline {
  /** The figure to budget against, in whole ringgit. */
  baseline: number;
  /** Plain mean of the full months observed, for comparison against the baseline. */
  average: number;
  /** Full months of income history the figure is drawn from. */
  months: number;
  /** How `baseline` was derived, so the UI can explain itself honestly. */
  method: BaselineMethod;
  /** True when this borrower's income swings enough that the average is a poor planning figure. */
  irregular: boolean;
  /** Standard deviation over the mean. Zero when there is too little history to judge. */
  variation: number;
  /** Lowest and highest full month observed. */
  low: number;
  high: number;
}

/**
 * Monthly income totals, oldest first, EXCLUDING the current month.
 *
 * The current month is excluded on purpose: a part-finished month reads as a collapse in income
 * on the 3rd and would drag the baseline down every single month.
 */
export function monthlyIncomeSeries(
  txns: Transaction[],
  now: Date = new Date()
): { month: string; income: number }[] {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== 'income') continue;
    const mk = txnMonthKey(t);
    if (!mk || mk >= currentMonth) continue;
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + t.amount);
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([month, income]) => ({ month, income }));
}

/** Linearly interpolated percentile over a sorted ascending series. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/**
 * A conservative monthly income to plan against.
 *
 * With six or more full months, the 25th percentile: low enough that three months in four clear
 * it, without letting one catastrophic month define the plan the way a plain minimum would. With
 * three to five months there is not enough history for a percentile to mean anything, so the
 * lowest observed month is used instead. Below three months there is no basis for a conservative
 * figure at all, so the plain average is returned and `method` says so.
 */
export function computeIncomeBaseline(
  txns: Transaction[],
  now: Date = new Date()
): IncomeBaseline {
  const series = monthlyIncomeSeries(txns, now);
  const values = series.map((s) => s.income);
  const months = values.length;

  if (months === 0) {
    return {
      baseline: 0,
      average: 0,
      months: 0,
      method: 'none',
      irregular: false,
      variation: 0,
      low: 0,
      high: 0,
    };
  }

  const average = values.reduce((s, v) => s + v, 0) / months;
  const sorted = [...values].sort((a, b) => a - b);
  const variance = values.reduce((s, v) => s + (v - average) ** 2, 0) / months;
  const variation = average > 0 ? Math.sqrt(variance) / average : 0;
  const irregular = months >= MIN_MONTHS && variation > IRREGULAR_CV;

  let baseline = average;
  let method: BaselineMethod = 'average';
  if (months >= MONTHS_FOR_PERCENTILE) {
    baseline = percentile(sorted, 0.25);
    method = 'percentile';
  } else if (months >= MIN_MONTHS) {
    baseline = sorted[0];
    method = 'lowest';
  }

  return {
    baseline: Math.max(0, Math.round(baseline)),
    average: Math.max(0, Math.round(average)),
    months,
    method,
    irregular,
    variation,
    low: Math.round(sorted[0]),
    high: Math.round(sorted[sorted.length - 1]),
  };
}

/** One honest sentence explaining where the figure came from, for the UI to show verbatim. */
export function baselineExplanation(b: IncomeBaseline): string {
  switch (b.method) {
    case 'percentile':
      return `Three months in four you earned at least this much, across ${b.months} months of records.`;
    case 'lowest':
      return `Your lowest month out of the ${b.months} you have recorded.`;
    case 'average':
      return `Your average over ${b.months} month${b.months === 1 ? '' : 's'}. Record a few more and Pip can plan against a safer floor.`;
    default:
      return 'No full month of income recorded yet.';
  }
}
