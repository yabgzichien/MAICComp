import { DEFAULT_SAVINGS_TARGET, computeSavingsHabit, savingsStepUp } from '../src/lib/savingsHabit';
import type { Transaction } from '../src/lib/types';

const NOW = new Date('2026-08-15T00:00:00Z');

let seq = 0;
function txn(date: string, amount: number, type: 'income' | 'expense'): Transaction {
  seq++;
  return {
    id: `t${seq}`,
    merchantRaw: 'X',
    merchantKey: 'x',
    amount,
    currency: 'MYR',
    type,
    date,
    categoryId: type === 'income' ? 'gig-income' : 'food',
    createdAt: `${date}T09:00:00Z`,
    source: 'extracted',
  };
}

/** One income and one expense per month, `nets` oldest first ending July 2026 (the last full month). */
function history(nets: number[], baseIncome = 2000): Transaction[] {
  return nets.flatMap((net, i) => {
    const d = new Date(Date.UTC(2026, 6 - (nets.length - 1 - i), 10)).toISOString().slice(0, 10);
    return [txn(d, baseIncome, 'income'), txn(d, baseIncome - net, 'expense')];
  });
}

describe('computeSavingsHabit', () => {
  it('counts consecutive full months that met the target', () => {
    const h = computeSavingsHabit(history([80, 90, 120, 60]), 50, NOW);
    expect(h.monthsKept).toBe(4);
    expect(h.monthsObserved).toBe(4);
  });

  it('breaks the run on the first month that fell short, counting back', () => {
    const h = computeSavingsHabit(history([200, 200, 10, 90, 70]), 50, NOW);
    expect(h.monthsKept).toBe(2); // only the last two months cleared 50
  });

  it('is zero when the most recent full month missed', () => {
    expect(computeSavingsHabit(history([200, 200, 200, 5]), 50, NOW).monthsKept).toBe(0);
  });

  it('keeps the best run on record so a lapse does not erase the evidence', () => {
    const h = computeSavingsHabit(history([90, 90, 90, 10, 90]), 50, NOW);
    expect(h.monthsKept).toBe(1);
    expect(h.bestRun).toBe(3);
  });

  it('reports the current part-finished month as live progress, not as a broken run', () => {
    const txns = [
      ...history([90, 90]),
      txn('2026-08-02', 1000, 'income'),
      txn('2026-08-05', 970, 'expense'),
    ];
    const h = computeSavingsHabit(txns, 50, NOW);
    expect(h.monthsKept).toBe(2); // the in-flight month has not reset anything
    expect(h.thisMonthSaved).toBe(30);
    expect(h.thisMonthMet).toBe(false);
    expect(h.thisMonthProgress).toBeCloseTo(0.6);
  });

  it('marks the current month met once it clears the target', () => {
    const h = computeSavingsHabit(
      [txn('2026-08-02', 900, 'income'), txn('2026-08-06', 700, 'expense')],
      50,
      NOW
    );
    expect(h.thisMonthSaved).toBe(200);
    expect(h.thisMonthMet).toBe(true);
    expect(h.thisMonthProgress).toBe(1);
  });

  it('reports a negative current month honestly rather than clamping the figure', () => {
    const h = computeSavingsHabit(
      [txn('2026-08-02', 300, 'income'), txn('2026-08-06', 800, 'expense')],
      50,
      NOW
    );
    expect(h.thisMonthSaved).toBe(-500);
    expect(h.thisMonthProgress).toBe(0); // the bar stays empty, but the figure is not rewritten
  });

  it('reports no run at all when no target has been set', () => {
    const h = computeSavingsHabit(history([500, 500, 500]), 0, NOW);
    expect(h).toMatchObject({ target: 0, monthsKept: 0, bestRun: 0, thisMonthMet: false });
    expect(h.monthsObserved).toBe(3);
  });

  it('handles an empty ledger', () => {
    expect(computeSavingsHabit([], DEFAULT_SAVINGS_TARGET, NOW)).toMatchObject({
      monthsKept: 0,
      bestRun: 0,
      thisMonthSaved: 0,
      monthsObserved: 0,
    });
  });

  it('raising the target can shorten an existing run, and that is the honest answer', () => {
    const txns = history([90, 90, 90]);
    expect(computeSavingsHabit(txns, 50, NOW).monthsKept).toBe(3);
    expect(computeSavingsHabit(txns, 100, NOW).monthsKept).toBe(0);
  });

  it('starts borrowers at a target small enough to survive a bad month', () => {
    expect(DEFAULT_SAVINGS_TARGET).toBe(50);
  });
});

describe('savingsStepUp', () => {
  const habitWithRun = (monthsKept: number, target = 50) =>
    computeSavingsHabit(history(Array(Math.max(monthsKept, 1)).fill(monthsKept > 0 ? 500 : 0)), target, NOW);

  it('suggests the guide figure once a run is established', () => {
    expect(savingsStepUp(habitWithRun(3), 150)).toBe(150);
    expect(savingsStepUp(habitWithRun(5), 150)).toBe(150);
  });

  it('stays quiet until the borrower has actually held the smaller amount', () => {
    expect(savingsStepUp(habitWithRun(1), 150)).toBeNull();
    expect(savingsStepUp(habitWithRun(2), 150)).toBeNull();
    expect(savingsStepUp(habitWithRun(0), 150)).toBeNull();
  });

  it('never suggests a target the borrower already meets or exceeds', () => {
    expect(savingsStepUp(habitWithRun(6, 150), 150)).toBeNull();
    expect(savingsStepUp(habitWithRun(6, 300), 150)).toBeNull();
  });

  it('stays quiet when the guide has no savings figure for this household', () => {
    expect(savingsStepUp(habitWithRun(6), undefined)).toBeNull();
    expect(savingsStepUp(habitWithRun(6), 0)).toBeNull();
  });
});
