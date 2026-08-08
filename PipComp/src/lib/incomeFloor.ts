// src/lib/incomeFloor.ts
// The income a borrower can actually COUNT ON, rather than the one an average implies.
//
// Why this exists: for a salaried earner, mean monthly income is a fair summary. For the gig
// workers, sellers and traders this app is built for, it is the least honest number available —
// it silently assumes the weak months and the strong months cancel out, when in fact only the
// weak months decide whether a repayment clears. The established budgeting advice for irregular
// income says the same thing bluntly ("if you plan against a $5,000/month average and you happen
// to be on the 'dip' end of that average for a few months in a row, it doesn't work").
//
// So instead of averaging we take a low PERCENTILE of the monthly totals: the level that actually
// held up. Deliberately between the two schools of thought —
//   · lowest-month (Ramsey school) is too punitive: one catastrophic month defines the borrower
//     forever, which is exactly the unfairness this product exists to fix.
//   · averaging overstates capacity, per above.
// The 20th percentile reads naturally in the UI ("you cleared this in 5 of your last 6 months")
// and degrades gracefully as history grows.
//
// Pure and unit-tested: no UI/DB imports, no Date.now(), no randomness.
import type { Transaction } from './types';
import type { ExpenseStructure } from './spendingProfile';

/** Months of income history required before a floor is claimed at all. Below this the honest
 *  answer is "not yet", never a number invented from one or two observations. */
export const FLOOR_MIN_MONTHS = 3;

/** Which percentile of monthly income totals becomes the floor. See the header for why. */
export const FLOOR_PERCENTILE = 20;

export interface IncomeFloor {
  /** RM/month that held up in all but the weakest months. 0 when `reliable` is false. */
  floor: number;
  /** Mean monthly income — what the rest of the app currently underwrites on. */
  average: number;
  /** Best observed month: the upside a floor deliberately ignores. */
  best: number;
  /** Weakest observed month. */
  worst: number;
  /** Months whose income total reached `floor`. 0 when `reliable` is false. */
  monthsAtOrAboveFloor: number;
  /** Months that carried any income — the denominator for the line above. */
  monthsWithIncome: number;
  /** The percentile `floor` was taken at, so the UI never hardcodes it. */
  percentile: number;
  /** False when history is too thin to claim a floor. The UI must then show no floor. */
  reliable: boolean;
  /** Monthly income totals, oldest first — the series the chart plots. Present even when
   *  `reliable` is false, so a thin history can still show the months it does have. */
  months: MonthlyIncome[];
}

export interface MonthlyIncome {
  /** YYYY-MM. */
  key: string;
  total: number;
}

/** Month key (YYYY-MM) for a transaction — its own date when present, else when logged.
 *  Matches incomeQuality.ts / spendingProfile.ts so all three agree on what a month is. */
function monthKeyOf(t: Transaction): string {
  return (t.date ?? t.createdAt).slice(0, 7);
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Nearest-rank percentile over an ascending array. Chosen over an interpolating variant because
 *  the result is always a month that genuinely happened, which is what the UI claims it is. */
function nearestRank(ascending: number[], percentile: number): number {
  if (ascending.length === 0) return 0;
  const rank = Math.max(1, Math.ceil((percentile / 100) * ascending.length));
  return ascending[Math.min(rank, ascending.length) - 1];
}

const EMPTY: IncomeFloor = {
  floor: 0,
  average: 0,
  best: 0,
  worst: 0,
  monthsAtOrAboveFloor: 0,
  monthsWithIncome: 0,
  percentile: FLOOR_PERCENTILE,
  reliable: false,
  months: [],
};

/**
 * The dependable-income block from the ledger. Months without any income are excluded from the
 * percentile (a month with no recorded income is a coverage problem, which `regularityRatio` in
 * incomeQuality.ts already measures; folding it in here would double-count it as a *level*
 * problem and understate an honest earner twice for the same gap).
 *
 * NOTE: `floor` can legitimately come out ABOVE `average`, when one catastrophic month drags the
 * mean below the typical one. That is not a bug and must not be clamped — it is the clearest
 * possible demonstration of why an average misdescribes an uneven earner, and the percentile
 * claim ("cleared in 5 of 6 months") stays true either way. UI copy has to survive this case.
 */
export function computeIncomeFloor(transactions: Transaction[]): IncomeFloor {
  const income = transactions.filter((t) => t.type === 'income' && t.amount > 0);
  if (income.length === 0) return { ...EMPTY };

  const totalByMonth = new Map<string, number>();
  for (const t of income) {
    const mk = monthKeyOf(t);
    totalByMonth.set(mk, (totalByMonth.get(mk) ?? 0) + t.amount);
  }

  // Chronological, so the chart reads left-to-right as time. Month keys sort lexically.
  const months: MonthlyIncome[] = [...totalByMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, total]) => ({ key, total }));

  const totals = months.map((m) => m.total);
  const ascending = [...totals].sort((a, b) => a - b);
  const monthsWithIncome = totals.length;
  const average = mean(totals);
  const best = ascending[ascending.length - 1];
  const worst = ascending[0];

  if (monthsWithIncome < FLOOR_MIN_MONTHS) {
    return { ...EMPTY, average, best, worst, monthsWithIncome, months };
  }

  const floor = nearestRank(ascending, FLOOR_PERCENTILE);
  const monthsAtOrAboveFloor = totals.filter((x) => x >= floor).length;

  return {
    floor,
    average,
    best,
    worst,
    monthsAtOrAboveFloor,
    monthsWithIncome,
    percentile: FLOOR_PERCENTILE,
    reliable: true,
    months,
  };
}

/**
 * What is left in a weak month at CURRENT spending: dependable income minus the whole outflow.
 *
 * Contrast with the app's existing `avgMonthlySurplus` (mean income − mean expense), which pairs
 * an average income with an average expense and so describes a month that may never occur. This
 * pairs the income that held up with the spending that actually happens, so it is always ≤
 * `avgMonthlySurplus` — the honest, pessimistic reading.
 *
 * May be negative. That is a real and important finding, not an error, so it is never clamped:
 * a borrower whose weak months do not cover their spending needs to be told exactly that.
 */
export function dependableSurplus(floor: number, structure: ExpenseStructure): number {
  return floor - structure.monthlyTotal;
}

/**
 * What could go toward a repayment in a weak month IF flexible spending were redirected — the
 * headroom `dependableSurplus` deliberately leaves on the table.
 *
 * The pair tells the whole story for a variable-income earner: "a weak month leaves you RM60,
 * but RM650 of your spending is flexible, so you could free that up." Exceeds
 * `dependableSurplus` by exactly `structure.flexible`.
 */
export function serviceableCapacity(floor: number, structure: ExpenseStructure): number {
  return floor - structure.committed - structure.essentialVariable;
}
