// src/lib/spendingProfile.ts (Brief P)
// Pure spending-behaviour signals over the borrower's own ledger  a Tier 2 (behavioural)
// block. Lender-facing EVIDENCE only; it does not feed creditScore.ts. No UI/DB imports.

import type { Transaction } from './types';
import type { DetectedObligation } from './obligations';

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
 *  seeded expense categories in src/data/categories.ts; unknown categories are discretionary.
 *
 *  These are COICOP's basic necessities  food (01), housing (04), health (06), transport (07),
 *  communication (08) and education (10)  plus the two non-discretionary commitment lines,
 *  insurance/fees and debt service. Discretionary is what is left: dining out, household and
 *  personal goods, recreation, and the residual. Before the bookkeeping retune this set named
 *  four ids that no seeded category actually carried ('rent', 'utilities', 'education',
 *  'childcare'), so those clauses never matched anything. */
const ESSENTIAL_CATEGORY_IDS = new Set([
  'housing',
  'food',
  'transport',
  'communications',
  'healthcare',
  'education',
  'insurance',
  'debt-service',
]);

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

// ── Expense structure: how escapable is each ringgit? ─────────────────────────
// `essentialsRatio` above answers "could this be cut?". `obligations.ts` separately answers "is
// the amount fixed?". Neither alone answers the question a borrower with uneven income actually
// has — *how small can my month get?* — because that needs both axes at once. This partitions
// spending into three buckets ordered by escapability, which is what makes the stacked bar in the
// UI readable left to right.

export interface ExpenseStructure {
  /** RM/month of detected recurring obligations. Contractually fixed; cannot be cut this month. */
  committed: number;
  /** RM/month of essential-category spend that is NOT an obligation (food, fuel). Compressible
   *  under pressure, but never removable. */
  essentialVariable: number;
  /** RM/month of everything else — the part that could genuinely be redirected. */
  flexible: number;
  /** Mean monthly expense. Always equals committed + essentialVariable + flexible. */
  monthlyTotal: number;
  /** committed ÷ monthlyTotal (0..1). How much of the month is already spoken for. */
  committedRatio: number;
  /** Months carrying any expense — the denominator behind every RM/month figure above. */
  monthsWithExpense: number;
}

const EMPTY_STRUCTURE: ExpenseStructure = {
  committed: 0,
  essentialVariable: 0,
  flexible: 0,
  monthlyTotal: 0,
  committedRatio: 0,
  monthsWithExpense: 0,
};

/** The key `obligations.ts` reports a detected obligation under (`label` there is
 *  `merchantRaw || merchantKey`), so a transaction can be matched back to one without re-running
 *  detection. Re-detecting would risk the two disagreeing about what counts as committed. */
function obligationKeyOf(t: Transaction): string {
  return t.merchantRaw || t.merchantKey || 'unknown';
}

/**
 * Partition spending by escapability, using obligations already detected by `detectObligations`.
 *
 * Buckets are assigned from ACTUAL transaction amounts rather than an obligation's median, so the
 * three buckets always sum exactly to observed spend — a partition that leaks money would quietly
 * misstate what the borrower can service.
 *
 * A recurring-but-cancellable charge (a subscription) lands in `committed`, which slightly
 * overstates what is truly unavoidable. That is deliberate and self-correcting: the UI lists every
 * obligation by name, so the borrower sees exactly what is counted and can judge it themselves.
 */
export function computeExpenseStructure(
  transactions: Transaction[],
  obligations: DetectedObligation[]
): ExpenseStructure {
  const expenses = transactions.filter((t) => t.type === 'expense' && t.amount > 0);
  if (expenses.length === 0) return { ...EMPTY_STRUCTURE };

  const committedLabels = new Set(obligations.map((o) => o.label));
  const months = new Set(expenses.map(monthKeyOf));
  const monthsWithExpense = months.size;

  let committedTotal = 0;
  let essentialVariableTotal = 0;
  let flexibleTotal = 0;
  for (const t of expenses) {
    if (committedLabels.has(obligationKeyOf(t))) committedTotal += t.amount;
    else if (t.categoryId != null && ESSENTIAL_CATEGORY_IDS.has(t.categoryId)) essentialVariableTotal += t.amount;
    else flexibleTotal += t.amount;
  }

  const perMonth = (x: number): number => (monthsWithExpense > 0 ? x / monthsWithExpense : 0);
  const committed = perMonth(committedTotal);
  const essentialVariable = perMonth(essentialVariableTotal);
  const flexible = perMonth(flexibleTotal);
  const monthlyTotal = committed + essentialVariable + flexible;

  return {
    committed,
    essentialVariable,
    flexible,
    monthlyTotal,
    committedRatio: monthlyTotal > 0 ? committed / monthlyTotal : 0,
    monthsWithExpense,
  };
}
