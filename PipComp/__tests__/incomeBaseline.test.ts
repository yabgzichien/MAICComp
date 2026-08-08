import {
  baselineExplanation,
  computeIncomeBaseline,
  monthlyIncomeSeries,
} from '../src/lib/incomeBaseline';
import type { Transaction } from '../src/lib/types';

const NOW = new Date('2026-08-15T00:00:00Z');

let seq = 0;
function txn(date: string, amount: number, type: 'income' | 'expense' = 'income'): Transaction {
  seq++;
  return {
    id: `t${seq}`,
    merchantRaw: 'Payer',
    merchantKey: 'payer',
    amount,
    currency: 'MYR',
    type,
    date,
    categoryId: type === 'income' ? 'gig-income' : 'food',
    createdAt: `${date}T09:00:00Z`,
    source: 'extracted',
  };
}

/** One income transaction per month, `amounts` given oldest first ending in July 2026. */
function history(amounts: number[]): Transaction[] {
  return amounts.map((amount, i) => {
    // Month index 6 is July 2026, the last full month before NOW.
    const d = new Date(Date.UTC(2026, 6 - (amounts.length - 1 - i), 10));
    return txn(d.toISOString().slice(0, 10), amount);
  });
}

describe('monthlyIncomeSeries', () => {
  it('totals income per month, oldest first, and ignores expenses', () => {
    const series = monthlyIncomeSeries(
      [txn('2026-06-03', 800), txn('2026-06-20', 400), txn('2026-07-05', 900), txn('2026-07-06', 500, 'expense')],
      NOW
    );
    expect(series).toEqual([
      { month: '2026-06', income: 1200 },
      { month: '2026-07', income: 900 },
    ]);
  });

  it('excludes the part-finished current month, which would read as an income collapse', () => {
    const series = monthlyIncomeSeries([txn('2026-07-05', 900), txn('2026-08-02', 120)], NOW);
    expect(series.map((s) => s.month)).toEqual(['2026-07']);
  });

  it('is empty when there is no income at all', () => {
    expect(monthlyIncomeSeries([txn('2026-07-05', 900, 'expense')], NOW)).toEqual([]);
  });
});

describe('computeIncomeBaseline', () => {
  it('uses the 25th percentile once there are six or more full months', () => {
    const b = computeIncomeBaseline(history([1000, 1200, 1400, 1600, 1800, 2000]), NOW);
    expect(b.months).toBe(6);
    expect(b.method).toBe('percentile');
    expect(b.baseline).toBe(1250); // p25 of the six sorted months
    expect(b.average).toBe(1500);
    expect(b.baseline).toBeLessThan(b.average);
  });

  it('is not dragged all the way down by one catastrophic month, unlike a plain minimum', () => {
    const b = computeIncomeBaseline(history([0, 2000, 2100, 2000, 1900, 2050]), NOW);
    expect(b.low).toBe(0);
    expect(b.baseline).toBeGreaterThan(1000);
  });

  it('falls back to the lowest month between three and five months of history', () => {
    const b = computeIncomeBaseline(history([1800, 900, 1500]), NOW);
    expect(b.method).toBe('lowest');
    expect(b.baseline).toBe(900);
  });

  it('falls back to the plain average below three months, and says so', () => {
    const b = computeIncomeBaseline(history([1000, 2000]), NOW);
    expect(b.method).toBe('average');
    expect(b.baseline).toBe(1500);
    expect(b.irregular).toBe(false); // too little history to make the call
    expect(baselineExplanation(b)).toContain('average');
  });

  it('reports no history at all rather than guessing', () => {
    const b = computeIncomeBaseline([], NOW);
    expect(b).toMatchObject({ baseline: 0, average: 0, months: 0, method: 'none', irregular: false });
    expect(baselineExplanation(b)).toContain('No full month');
  });

  it('flags a swinging gig income as irregular', () => {
    const b = computeIncomeBaseline(history([900, 2600, 1200, 2900, 1000, 2400]), NOW);
    expect(b.irregular).toBe(true);
    expect(b.variation).toBeGreaterThan(0.15);
  });

  it('does not flag a steady salary as irregular', () => {
    const b = computeIncomeBaseline(history([3000, 3000, 3000, 3000, 3000, 3000]), NOW);
    expect(b.irregular).toBe(false);
    expect(b.variation).toBe(0);
    expect(b.baseline).toBe(3000);
    expect(b.baseline).toBe(b.average);
  });

  it('never returns a negative or fractional figure', () => {
    const b = computeIncomeBaseline(history([1000.55, 1200.35, 1400.15, 1600.75, 1800.25, 2000.9]), NOW);
    expect(Number.isInteger(b.baseline)).toBe(true);
    expect(b.baseline).toBeGreaterThanOrEqual(0);
  });

  it('reports the observed range alongside the baseline', () => {
    const b = computeIncomeBaseline(history([900, 2600, 1200, 2900, 1000, 2400]), NOW);
    expect(b.low).toBe(900);
    expect(b.high).toBe(2900);
    expect(b.baseline).toBeGreaterThanOrEqual(b.low);
    expect(b.baseline).toBeLessThanOrEqual(b.high);
  });
});
