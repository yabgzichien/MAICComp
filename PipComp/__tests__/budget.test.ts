// __tests__/budget.test.ts
import {
  monthKey,
  txnMonthKey,
  currentMonthKey,
  averageMonthlySpend,
  allocatedTotal,
  leftover,
  categoryStatus,
  budgetHash,
} from '../src/lib/budget';
import type { Transaction } from '../src/lib/types';

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'X', merchantKey: 'x', amount: 10, currency: 'MYR',
    type: 'expense', date: '2026-06-10', categoryId: 'dining',
    createdAt: '2026-06-10T10:00:00.000Z', source: 'manual', ...over,
  };
}

describe('monthKey', () => {
  it('returns YYYY-MM from a date', () => {
    expect(monthKey('2026-06-10')).toBe('2026-06');
  });
  it('returns null for empty', () => {
    expect(monthKey(null)).toBeNull();
  });
});

describe('txnMonthKey', () => {
  it('uses the transaction date when present', () => {
    // Imported in June (createdAt) but dated May  belongs to May, not June.
    expect(txnMonthKey({ date: '2026-05-02', createdAt: '2026-06-02T10:00:00.000Z' })).toBe('2026-05');
  });
  it('falls back to createdAt when there is no date', () => {
    expect(txnMonthKey({ date: null, createdAt: '2026-06-02T10:00:00.000Z' })).toBe('2026-06');
  });
});

describe('currentMonthKey', () => {
  it('formats the current month as YYYY-MM (local)', () => {
    expect(currentMonthKey(new Date(2026, 5, 2))).toBe('2026-06');
    expect(currentMonthKey(new Date(2026, 0, 31))).toBe('2026-01');
  });
});

describe('averageMonthlySpend', () => {
  const now = new Date(2026, 5, 15); // June 2026
  it('averages a category over months that had spend', () => {
    const txns = [
      txn({ categoryId: 'dining', amount: 100, date: '2026-06-01' }),
      txn({ categoryId: 'dining', amount: 200, date: '2026-05-01' }),
      txn({ categoryId: 'fuel', amount: 80, date: '2026-06-02' }),
    ];
    const avg = averageMonthlySpend(txns, now, 3);
    expect(avg['dining']).toBe(150); // (100+200)/2 months
    expect(avg['fuel']).toBe(80); // 1 month
  });
  it('ignores income and months outside the window', () => {
    const txns = [
      txn({ categoryId: 'dining', amount: 100, date: '2026-06-01' }),
      txn({ categoryId: 'dining', amount: 999, date: '2026-01-01' }), // too old
      txn({ categoryId: 'income', amount: 500, type: 'income', date: '2026-06-01' }),
    ];
    const avg = averageMonthlySpend(txns, now, 3);
    expect(avg['dining']).toBe(100);
    expect(avg['income']).toBeUndefined();
  });
});

describe('allocatedTotal & leftover', () => {
  it('sums allocations and computes leftover', () => {
    const a = { dining: 300, fuel: 150 };
    expect(allocatedTotal(a)).toBe(450);
    expect(leftover(1000, a)).toBe(550);
    expect(leftover(400, a)).toBe(-50);
  });
});

describe('categoryStatus', () => {
  it('classifies ok / warn / over', () => {
    expect(categoryStatus(10, 100)).toBe('ok');
    expect(categoryStatus(80, 100)).toBe('warn');
    expect(categoryStatus(120, 100)).toBe('over');
    expect(categoryStatus(10, 0)).toBe('over'); // any spend with 0 budget
  });
});

describe('budgetHash', () => {
  it('is stable regardless of key order', () => {
    expect(budgetHash(1000, { a: 1, b: 2 })).toBe(budgetHash(1000, { b: 2, a: 1 }));
  });
  it('changes when income or amounts change', () => {
    expect(budgetHash(1000, { a: 1 })).not.toBe(budgetHash(1001, { a: 1 }));
    expect(budgetHash(1000, { a: 1 })).not.toBe(budgetHash(1000, { a: 2 }));
  });
});
