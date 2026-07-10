// src/lib/spendingProfile.ts (Brief P)
// Pure spending-behaviour signals over the borrower's own ledger — a Tier 2 (behavioural)
// block. Lender-facing EVIDENCE only; it does not feed creditScore.ts. No UI/DB imports.

import type { Transaction } from './types';

export interface SpendingProfile {
  /** Essential expense ÷ total expense (0..1). Higher = less discretionary slack. */
  essentialsRatio: number;
  /** Coefficient of variation of monthly expense totals; 0 when < 2 months. */
  expenseVolatility: number;
  /** Average days of buffer: monthly surplus ÷ average daily spend (0 when spend is 0). */
  bufferDays: number;
  /** Average monthly surplus ÷ average monthly income (0 when income is 0). */
  savingsRate: number;
}

/** Category ids treated as essential spending (the rest are discretionary). Mirrors the
 *  seeded expense categories in src/data/categories.ts; unknown categories are discretionary. */
const ESSENTIAL_CATEGORY_IDS = new Set(['groceries', 'bills', 'transport', 'fuel', 'health', 'rent', 'utilities', 'education', 'childcare']);

function monthKeyOf(t: Transaction): string {
  return (t.date ?? t.createdAt).slice(0, 7);
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Spending profile from the ledger. Empty spend → all-zero. */
export function computeSpendingProfile(transactions: Transaction[]): SpendingProfile {
  const expenses = transactions.filter((t) => t.type === 'expense' && t.amount > 0);
  const income = transactions.filter((t) => t.type === 'income' && t.amount > 0);

  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  const essentialExpense = expenses.filter((t) => t.categoryId != null && ESSENTIAL_CATEGORY_IDS.has(t.categoryId)).reduce((s, t) => s + t.amount, 0);
  const essentialsRatio = totalExpense > 0 ? essentialExpense / totalExpense : 0;

  const expenseByMonth = new Map<string, number>();
  for (const t of expenses) expenseByMonth.set(monthKeyOf(t), (expenseByMonth.get(monthKeyOf(t)) ?? 0) + t.amount);
  const monthlyExpense = [...expenseByMonth.values()];
  const meanExpense = mean(monthlyExpense);
  const expenseVolatility = meanExpense > 0 ? stdev(monthlyExpense) / meanExpense : 0;

  const incomeByMonth = new Map<string, number>();
  for (const t of income) incomeByMonth.set(monthKeyOf(t), (incomeByMonth.get(monthKeyOf(t)) ?? 0) + t.amount);
  const meanIncome = mean([...incomeByMonth.values()]);

  const avgSurplus = meanIncome - meanExpense;
  const savingsRate = meanIncome > 0 ? avgSurplus / meanIncome : 0;
  const avgDailySpend = meanExpense / 30;
  const bufferDays = avgDailySpend > 0 ? Math.max(0, avgSurplus / avgDailySpend) : 0;

  return { essentialsRatio, expenseVolatility, bufferDays, savingsRate };
}
