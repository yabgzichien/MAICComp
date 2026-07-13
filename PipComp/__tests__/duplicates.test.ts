import { findDuplicate, todayISO } from '../src/lib/duplicates';
import type { Transaction } from '../src/lib/types';

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2),
    merchantRaw: 'ABC Trading',
    merchantKey: 'abc trading',
    amount: 10,
    currency: 'MYR',
    type: 'expense',
    date: '2026-05-12',
    categoryId: 'shopping',
    createdAt: '2026-05-12T19:00:00.000Z',
    source: 'manual',
    ...over,
  };
}

const TODAY = '2026-06-01';

describe('findDuplicate', () => {
  const saved = [txn({ merchantRaw: 'ABC Trading', merchantKey: 'abc trading', amount: 10, date: '2026-05-12' })];

  it('flags same merchant + amount + day', () => {
    const hit = findDuplicate(saved, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12' }, TODAY);
    expect(hit).not.toBeNull();
  });

  it('is case/space tolerant on the merchant', () => {
    const hit = findDuplicate(saved, { merchant: '  abc   trading ', amount: 10, date: '2026-05-12' }, TODAY);
    expect(hit).not.toBeNull();
  });

  it('does not flag a different amount', () => {
    expect(findDuplicate(saved, { merchant: 'ABC Trading', amount: 12, date: '2026-05-12' }, TODAY)).toBeNull();
  });

  it('does not flag a different day', () => {
    expect(findDuplicate(saved, { merchant: 'ABC Trading', amount: 10, date: '2026-05-13' }, TODAY)).toBeNull();
  });

  it('does not flag a different merchant', () => {
    expect(findDuplicate(saved, { merchant: 'XYZ Mart', amount: 10, date: '2026-05-12' }, TODAY)).toBeNull();
  });

  it('tolerates float noise in amount', () => {
    const s = [txn({ amount: 10.0 })];
    expect(findDuplicate(s, { merchant: 'ABC Trading', amount: 10.004, date: '2026-05-12' }, TODAY)).not.toBeNull();
  });

  it('treats a null candidate date as today', () => {
    const sToday = [txn({ date: TODAY, createdAt: `${TODAY}T10:00:00.000Z` })];
    expect(findDuplicate(sToday, { merchant: 'ABC Trading', amount: 10, date: null }, TODAY)).not.toBeNull();
    // ...and does NOT match an old saved txn when candidate has no date
    expect(findDuplicate(saved, { merchant: 'ABC Trading', amount: 10, date: null }, TODAY)).toBeNull();
  });

  it('falls back to createdAt day when saved.date is null', () => {
    const s = [txn({ date: null, createdAt: '2026-05-12T19:00:00.000Z' })];
    expect(findDuplicate(s, { merchant: 'ABC Trading', amount: 10, date: '2026-05-12' }, TODAY)).not.toBeNull();
  });
});

describe('todayISO', () => {
  it('formats YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 5, 1))).toBe('2026-06-01');
  });
});
