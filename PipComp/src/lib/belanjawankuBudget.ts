// src/lib/belanjawankuBudget.ts
// Turns a Belanjawanku benchmark into a concrete monthly budget, and compares actual spending
// back against it. Pure, unit-tested, no UI or DB imports.
//
// THE WATERFALL. A budget built from a national reference budget only helps if it survives
// contact with a real income, and the target borrower's income is often below what the guide
// says a decent standard of living costs. So allocation runs as a priority waterfall, and what
// gets squeezed when money is short is an explicit product decision rather than an accident:
//
//   1. Committed obligations first. Loan repayment is contractual, and the guide has no line for
//      it (it books repayment inside Housing and Transportation), so the borrower's own recorded
//      average is used. Starving this line would just produce arrears.
//   2. Essentials at the guide figure. Food, home, transport, healthcare, childcare. The guide
//      calls these the cost of a decent standard of living, so trimming them is not a win.
//   3. Savings next, pay-yourself-first, ahead of anything discretionary. This is the one
//      ordering choice the method turns on: EPF and AKPK both put a small automatic set-aside
//      before lifestyle spending, because a savings line that only gets the leftovers never
//      gets funded.
//   4. Flexible lines last, scaled to whatever remains.
//
// When income cannot cover steps 1 and 2, essentials are scaled down proportionally and the
// result is flagged `belowGuideIncome`. The UI must say so plainly. Quietly emitting a budget
// that "balances" at an income below the national reference would be the dishonest option.
import type { Allocations } from './budget';
import type { Benchmark, BenchmarkLine, BenchmarkLineKind } from './belanjawanku';

/** Rounds to whole ringgit. Budgets are never shown to the sen. */
const rm = (n: number): number => Math.max(0, Math.round(n));

export interface BudgetTemplateInput {
  /** Monthly income to budget against. */
  income: number;
  benchmark: Benchmark;
  /** The borrower's own average monthly spend per category id. */
  actualByCategory: Record<string, number>;
  /** Expense category ids that exist in this borrower's app. */
  categoryIds: string[];
  /** Display labels per category id, used for committed-obligation lines the guide has no name for. */
  categoryLabels?: Record<string, string>;
  /** Monthly savings to reserve. Defaults to the guide's own figure for this household. */
  savingsTarget?: number;
}

export interface TemplateLine {
  /** Benchmark line id, or the category id itself for a committed obligation. */
  id: string;
  label: string;
  categoryIds: string[];
  /** What the guide allocates, or null for a committed obligation the guide does not model. */
  guideAmount: number | null;
  /** What this template allocates after the waterfall. */
  amount: number;
}

export interface BudgetTemplate {
  /** Per-category allocations, ready for `saveBudget`. */
  allocations: Allocations;
  /** Savings reserved before any discretionary spending. */
  savings: number;
  /** Lines that made up the allocation, in waterfall order, for display. */
  lines: TemplateLine[];
  /** Income minus everything allocated, including savings. Never negative. */
  unallocated: number;
  /** True when income could not cover committed obligations plus the guide essentials. */
  belowGuideIncome: boolean;
  /** Ringgit short of the guide essentials. Zero unless `belowGuideIncome`. */
  shortfall: number;
}

/** Sums the borrower's actual spend across the categories a line covers. */
function actualFor(categoryIds: string[], actual: Record<string, number>): number {
  return categoryIds.reduce((s, id) => s + (actual[id] ?? 0), 0);
}

/**
 * Splits `budget` across `weights` as whole ringgit that sum to EXACTLY `budget`.
 *
 * Rounding each share independently is what a naive version does, and it silently overshoots:
 * four lines each rounding up half a ringgit hands out a ringgit the borrower does not have.
 * Assigning against a running cumulative target instead makes the rounding error cancel rather
 * than accumulate, so the total is exact by construction at any number of lines.
 */
function apportion(weights: number[], budget: number): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || budget <= 0) return weights.map(() => 0);
  const out: number[] = [];
  let cumulative = 0;
  let assigned = 0;
  weights.forEach((w, i) => {
    cumulative += w;
    const target = i === weights.length - 1 ? budget : Math.round((budget * cumulative) / total);
    out.push(target - assigned);
    assigned = target;
  });
  return out;
}

/**
 * Splits one line's allocation across the categories it covers, in proportion to what the
 * borrower actually spends on each. With nothing recorded on any of them there is no evidence
 * to split on, so the whole amount lands on the line's primary (first) category.
 */
function splitAcross(
  categoryIds: string[],
  amount: number,
  actual: Record<string, number>,
  into: Allocations
): void {
  if (amount <= 0 || categoryIds.length === 0) return;
  if (actualFor(categoryIds, actual) <= 0) {
    into[categoryIds[0]] = (into[categoryIds[0]] ?? 0) + amount;
    return;
  }
  const shares = apportion(
    categoryIds.map((id) => actual[id] ?? 0),
    amount
  );
  categoryIds.forEach((id, i) => {
    if (shares[i] > 0) into[id] = (into[id] ?? 0) + shares[i];
  });
}

/**
 * Whole-ringgit amount per line: each line's guide figure when `available` covers them all,
 * otherwise proportionally scaled down to fit exactly.
 */
function scaled(lines: BenchmarkLine[], available: number): Map<string, number> {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const budget = Math.min(total, Math.max(0, Math.floor(available)));
  const amounts = apportion(
    lines.map((l) => l.amount),
    budget
  );
  return new Map(lines.map((l, i) => [l.id, amounts[i]]));
}

/**
 * Builds a monthly budget from a Belanjawanku benchmark, adapted to what this borrower actually
 * earns and owes. See the file header for the waterfall and why it is ordered that way.
 */
export function buildBelanjawankuBudget(input: BudgetTemplateInput): BudgetTemplate {
  const { benchmark, actualByCategory, income } = input;
  const known = new Set(input.categoryIds);
  const benchmarked = new Set(benchmark.lines.flatMap((l) => l.categoryIds));

  const allocations: Allocations = {};
  const lines: TemplateLine[] = [];
  // Whole ringgit throughout, so allocations can never sum past the income by a rounding sliver.
  let remaining = Math.max(0, Math.floor(income));

  // 1. Committed obligations the guide does not model, at the borrower's own recorded average.
  const committed = input.categoryIds
    .filter((id) => !benchmarked.has(id) && (actualByCategory[id] ?? 0) > 0)
    .map((id) => ({ id, amount: rm(actualByCategory[id]) }));
  for (const c of committed) {
    const amount = Math.min(c.amount, remaining);
    if (amount <= 0) continue;
    allocations[c.id] = (allocations[c.id] ?? 0) + rm(amount);
    lines.push({
      id: c.id,
      label: input.categoryLabels?.[c.id] ?? c.id,
      categoryIds: [c.id],
      guideAmount: null,
      amount: rm(amount),
    });
    remaining -= amount;
  }
  const afterCommitted = remaining;

  // 2. Essentials at the guide figure, scaled down together only if income cannot reach them.
  const essentials = benchmark.lines.filter(
    (l) => l.kind === 'essential' && l.categoryIds.some((id) => known.has(id))
  );
  const essentialTotal = essentials.reduce((s, l) => s + l.amount, 0);
  const belowGuideIncome = afterCommitted < essentialTotal;
  const essentialAmounts = scaled(essentials, remaining);
  for (const line of essentials) {
    const amount = essentialAmounts.get(line.id) ?? 0;
    if (amount <= 0) continue;
    splitAcross(line.categoryIds.filter((id) => known.has(id)), amount, actualByCategory, allocations);
    lines.push({
      id: line.id,
      label: line.label,
      categoryIds: line.categoryIds,
      guideAmount: line.amount,
      amount: rm(amount),
    });
    remaining -= amount;
  }

  // 3. Savings, pay-yourself-first, ahead of anything discretionary.
  const target = input.savingsTarget ?? benchmark.savings;
  const savings = rm(Math.min(Math.max(0, target), Math.max(0, remaining)));
  remaining -= savings;

  // 4. Flexible lines take whatever is left.
  const flexible = benchmark.lines.filter(
    (l) => l.kind === 'flexible' && l.categoryIds.some((id) => known.has(id))
  );
  const flexibleAmounts = scaled(flexible, remaining);
  for (const line of flexible) {
    const amount = flexibleAmounts.get(line.id) ?? 0;
    if (amount <= 0) continue;
    splitAcross(line.categoryIds.filter((id) => known.has(id)), amount, actualByCategory, allocations);
    lines.push({
      id: line.id,
      label: line.label,
      categoryIds: line.categoryIds,
      guideAmount: line.amount,
      amount: rm(amount),
    });
    remaining -= amount;
  }

  return {
    allocations,
    savings,
    lines,
    unallocated: rm(remaining),
    belowGuideIncome,
    shortfall: belowGuideIncome ? rm(essentialTotal - afterCommitted) : 0,
  };
}

export interface BenchmarkGap {
  lineId: string;
  /** The line's display label, e.g. "Food & Dining". */
  label: string;
  /**
   * Whether this line is one the borrower can genuinely trade against savings.
   *
   * This matters more than it looks. The guide's essential figures are a MINIMUM for a decent
   * standard of living, so spending above them is not automatically a problem: the healthcare
   * basket, for instance, is four GP visits and one dental visit a year, and someone managing a
   * real condition will exceed it every month. Coaching them to spend less on health because a
   * reference budget says so would be actively harmful, so only `flexible` gaps are ever turned
   * into advice. Essential gaps stay informational.
   */
  kind: BenchmarkLineKind;
  categoryIds: string[];
  /** What the guide allocates for this household. */
  guideAmount: number;
  /** What the borrower actually spends across the line's categories. */
  actualAmount: number;
  /** How far over the guide they are. Always positive; under-guide lines are not returned. */
  overBy: number;
}

/** How a gap compares with the same line a month earlier. */
export type GapTrend = 'new' | 'unchanged' | 'improving' | 'worsening';

/** Ringgit of month-on-month movement below which a gap counts as unchanged. */
const TREND_NOISE_RM = 20;

/**
 * How a gap moved since the previous month, so a recurring finding can be reported as tracking
 * rather than repeated as a fresh warning.
 *
 * A borrower whose dining has run over the guide for five months does not need the same sentence
 * five times; they need to know it has not moved. Repeating identical warnings is how a useful
 * signal turns into noise the reader learns to skip.
 */
export function gapTrend(current: BenchmarkGap, previous: BenchmarkGap | undefined): GapTrend {
  if (!previous) return 'new';
  const delta = current.overBy - previous.overBy;
  if (Math.abs(delta) <= TREND_NOISE_RM) return 'unchanged';
  return delta < 0 ? 'improving' : 'worsening';
}

/**
 * Categories where the borrower spends more than the national guide sets aside for their
 * household, largest gap first. Deliberately one-sided: only over-guide lines are returned, so an
 * unbenchmarked or under-guide category can never produce a claim the guide does not support.
 */
export function benchmarkGaps(
  benchmark: Benchmark,
  actualByCategory: Record<string, number>
): BenchmarkGap[] {
  return benchmark.lines
    .map((line) => {
      const actualAmount = rm(actualFor(line.categoryIds, actualByCategory));
      return {
        lineId: line.id,
        label: line.label,
        kind: line.kind,
        categoryIds: line.categoryIds,
        guideAmount: line.amount,
        actualAmount,
        overBy: actualAmount - line.amount,
      };
    })
    .filter((g) => g.overBy > 0)
    .sort((a, b) => b.overBy - a.overBy || a.lineId.localeCompare(b.lineId));
}
