// src/lib/incomeQuality.ts (Brief P)
// Pure, on-device income-quality signals over the borrower's own transactions — an
// aggregate, non-identifying block (Tier 0). Lender-facing EVIDENCE only: it does not
// feed creditScore.ts (the score formula is unchanged), it gives the underwriter the
// "how do they earn?" context a single average income hides. No UI/DB imports.

import type { Transaction } from './types';

export interface IncomeQuality {
  /** Coefficient of variation of monthly income totals (stdev/mean); 0 when < 2 months. */
  variationCoefficient: number;
  /** Distinct recurring inflow sources (a merchant seen as income in ≥ 2 months). */
  sourceCount: number;
  /** Months with any income ÷ months observed (0..1). */
  regularityRatio: number;
  /** True when income is concentrated in a minority of months (a lumpy/seasonal earner). */
  seasonal: boolean;
}

/** Month key (YYYY-MM) for a transaction — its own date when present, else when logged. */
function monthKeyOf(t: Transaction): string {
  return (t.date ?? t.createdAt).slice(0, 7);
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Income-quality block from the ledger. `months` bounds the observation window (distinct
 * months seen across ALL transactions, so a month with expenses but no income still counts
 * against regularity). Empty income → all-zero, non-seasonal.
 */
export function computeIncomeQuality(transactions: Transaction[]): IncomeQuality {
  const income = transactions.filter((t) => t.type === 'income' && t.amount > 0);
  const allMonths = new Set(transactions.map(monthKeyOf));
  const monthsObserved = allMonths.size;

  // Monthly income totals over the months that HAD income.
  const totalByMonth = new Map<string, number>();
  const monthsByMerchant = new Map<string, Set<string>>();
  for (const t of income) {
    const mk = monthKeyOf(t);
    totalByMonth.set(mk, (totalByMonth.get(mk) ?? 0) + t.amount);
    const key = t.merchantKey || t.merchantRaw || 'unknown';
    if (!monthsByMerchant.has(key)) monthsByMerchant.set(key, new Set());
    monthsByMerchant.get(key)!.add(mk);
  }

  const monthlyTotals = [...totalByMonth.values()];
  const m = mean(monthlyTotals);
  const variationCoefficient = m > 0 ? stdev(monthlyTotals) / m : 0;
  const sourceCount = [...monthsByMerchant.values()].filter((mset) => mset.size >= 2).length;
  const regularityRatio = monthsObserved > 0 ? totalByMonth.size / monthsObserved : 0;
  // Seasonal: with enough history, income lands in a minority of months (a lumpy earner —
  // gig/harvest/commission). Timing concentration is the signal; amount swings are the
  // separate variationCoefficient axis.
  const seasonal = monthsObserved >= 3 && regularityRatio < 0.6;

  return { variationCoefficient, sourceCount, regularityRatio, seasonal };
}
