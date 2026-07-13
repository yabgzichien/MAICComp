// __tests__/recap.test.ts
import {
  monthlyIncomeStatement,
  spentByCategory,
  computeAdherence,
  availableMonths,
} from '../src/lib/recap';
import type { Transaction } from '../src/lib/types';

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'X', merchantKey: 'x', amount: 10, currency: 'MYR',
    type: 'expense', date: '2026-06-10', categoryId: 'dining',
    createdAt: '2026-06-10T10:00:00.000Z', source: 'manual', ...over,
  };
}

describe('monthlyIncomeStatement', () => {
  it('sums income and expenses for the given month and nets them', () => {
    const txns = [
      txn({ type: 'income', amount: 5000, date: '2026-06-01' }),
      txn({ type: 'expense', amount: 1200, date: '2026-06-05' }),
      txn({ type: 'expense', amount: 300, date: '2026-06-09' }),
      txn({ type: 'expense', amount: 999, date: '2026-05-30' }), // other month, ignored
    ];
    expect(monthlyIncomeStatement(txns, '2026-06')).toEqual({
      income: 5000,
      expenses: 1500,
      net: 3500,
    });
  });

  it('falls back to createdAt month when date is null', () => {
    const txns = [txn({ type: 'income', amount: 100, date: null, createdAt: '2026-06-02T00:00:00.000Z' })];
    expect(monthlyIncomeStatement(txns, '2026-06').income).toBe(100);
  });

  it('returns zeros for an empty month', () => {
    expect(monthlyIncomeStatement([], '2026-06')).toEqual({ income: 0, expenses: 0, net: 0 });
  });
});

describe('spentByCategory', () => {
  it('totals expenses per category for the month, ignoring income', () => {
    const txns = [
      txn({ categoryId: 'dining', amount: 100, date: '2026-06-01' }),
      txn({ categoryId: 'dining', amount: 50, date: '2026-06-02' }),
      txn({ categoryId: 'fuel', amount: 80, date: '2026-06-03' }),
      txn({ type: 'income', categoryId: 'salary', amount: 5000, date: '2026-06-01' }),
    ];
    expect(spentByCategory(txns, '2026-06')).toEqual({ dining: 150, fuel: 80 });
  });

  it('buckets a null category under "other"', () => {
    const txns = [txn({ categoryId: null, amount: 40, date: '2026-06-01' })];
    expect(spentByCategory(txns, '2026-06')).toEqual({ other: 40 });
  });
});

describe('computeAdherence', () => {
  it('counts categories within budget and ranks overspends by amount', () => {
    const allocations = { dining: 200, fuel: 100, groceries: 300 };
    const spent = { dining: 250, fuel: 60, groceries: 500 };
    const a = computeAdherence(allocations, spent);
    expect(a.totalBudgeted).toBe(3);
    expect(a.withinCount).toBe(1); // only fuel stayed within
    expect(a.overspends.map((o) => o.catId)).toEqual(['groceries', 'dining']);
    expect(a.overspends[0]).toEqual({ catId: 'groceries', allocated: 300, spent: 500, over: 200, pct: 67 });
    expect(a.overspends[1]).toEqual({ catId: 'dining', allocated: 200, spent: 250, over: 50, pct: 25 });
  });

  it('treats a category exactly on budget as within', () => {
    const a = computeAdherence({ dining: 200 }, { dining: 200 });
    expect(a.withinCount).toBe(1);
    expect(a.overspends).toEqual([]);
  });

  it('counts an unspent budgeted category as within', () => {
    const a = computeAdherence({ dining: 200 }, {});
    expect(a.withinCount).toBe(1);
    expect(a.overspends).toEqual([]);
  });

  it('handles no budget at all', () => {
    expect(computeAdherence({}, { dining: 50 })).toEqual({ withinCount: 0, totalBudgeted: 0, overspends: [] });
  });
});

describe('availableMonths', () => {
  const now = new Date(2026, 5, 15); // June 2026

  it('merges transaction months, snapshot months, and the current month, newest first, deduped', () => {
    const txns = [
      txn({ date: '2026-04-10' }),
      txn({ date: '2026-04-12' }),
      txn({ date: null, createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(availableMonths(txns, ['2026-05', '2026-04'], now)).toEqual([
      '2026-06', // current month always present
      '2026-05', // from snapshots
      '2026-04', // from txns + snapshots (deduped)
      '2026-03', // from createdAt fallback
    ]);
  });

  it('always includes the current month even with no data', () => {
    expect(availableMonths([], [], now)).toEqual(['2026-06']);
  });
});
