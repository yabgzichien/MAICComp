// __tests__/commitments.test.ts
import { clampToMonth, occurrencesFor, findCommitmentMatch, toArrearsRows } from '../src/lib/commitments';
import type { Commitment, CommitmentOccurrence } from '../src/lib/commitments';
import type { Transaction } from '../src/lib/types';

function commitment(over: Partial<Commitment>): Commitment {
  return {
    id: 'c1', label: 'Maxis', merchantKey: 'maxis', kind: 'expense', amount: 89,
    categoryId: 'communications', fromAccountId: 'a1', toAccountId: null,
    dueDay: 5, startMonth: '2026-06', endMonth: null, archived: false,
    createdAt: '2026-06-01T00:00:00.000Z', ...over,
  };
}

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'Maxis', merchantKey: 'maxis', amount: 89, currency: 'MYR',
    type: 'expense', date: '2026-06-05', categoryId: 'communications',
    createdAt: '2026-06-05T10:00:00.000Z', source: 'manual', ...over,
  };
}

describe('clampToMonth', () => {
  it('keeps a normal day', () => {
    expect(clampToMonth('2026-06', 15)).toBe('2026-06-15');
  });
  it('clamps a day-of-month past the end of a short month', () => {
    expect(clampToMonth('2026-02', 31)).toBe('2026-02-28');
  });
  it('clamps into a leap February', () => {
    expect(clampToMonth('2028-02', 31)).toBe('2028-02-29');
  });
});

describe('occurrencesFor', () => {
  it('generates the horizon of months starting at max(startMonth, fromMonth)', () => {
    const c = commitment({ startMonth: '2026-06', dueDay: 5 });
    const occs = occurrencesFor(c, '2026-06', 3);
    expect(occs.map((o) => o.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(occs.map((o) => o.dueDate)).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
    expect(occs.every((o) => o.amount === 89)).toBe(true);
  });

  it('does not backfill: starts from fromMonth even if startMonth is older', () => {
    const c = commitment({ startMonth: '2020-01' });
    const occs = occurrencesFor(c, '2026-06', 2);
    expect(occs.map((o) => o.month)).toEqual(['2026-06', '2026-07']);
  });

  it('starts from startMonth when it is later than fromMonth', () => {
    const c = commitment({ startMonth: '2026-09' });
    const occs = occurrencesFor(c, '2026-06', 3);
    expect(occs.map((o) => o.month)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('stops at endMonth', () => {
    const c = commitment({ startMonth: '2026-06', endMonth: '2026-07' });
    const occs = occurrencesFor(c, '2026-06', 6);
    expect(occs.map((o) => o.month)).toEqual(['2026-06', '2026-07']);
  });

  it('produces nothing once endMonth has already passed', () => {
    const c = commitment({ startMonth: '2026-01', endMonth: '2026-03' });
    const occs = occurrencesFor(c, '2026-06', 3);
    expect(occs).toEqual([]);
  });
});

describe('findCommitmentMatch', () => {
  const c = commitment({ amount: 89, merchantKey: 'maxis' });

  it('matches a same-merchant transaction within the amount and day tolerance', () => {
    const t = txn({ amount: 88.5, date: '2026-06-03' });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBe(t);
  });

  it('rejects an amount outside the 5% tolerance', () => {
    const t = txn({ amount: 120 });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBeNull();
  });

  it('rejects a date more than 7 days from the due date', () => {
    const t = txn({ date: '2026-06-20' });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBeNull();
  });

  it('rejects a different merchant', () => {
    const t = txn({ merchantKey: 'celcom' });
    expect(findCommitmentMatch([t], c, '2026-06-05')).toBeNull();
  });

  it('skips a candidate already excluded (already linked elsewhere)', () => {
    const t = txn({ id: 'txn-1' });
    expect(findCommitmentMatch([t], c, '2026-06-05', new Set(['txn-1']))).toBeNull();
  });
});

describe('toArrearsRows', () => {
  function occ(over: Partial<CommitmentOccurrence>): CommitmentOccurrence {
    return {
      id: 'o1', commitmentId: 'c1', dueDate: '2026-06-05', month: '2026-06', amount: 89,
      paidAmount: null, paidOn: null, status: 'scheduled', txnId: null, txnCreated: false,
      unitsAdded: null, priceMYR: null, createdAt: '2026-06-01T00:00:00.000Z', ...over,
    };
  }

  it('drops skipped occurrences', () => {
    const rows = toArrearsRows([occ({ status: 'skipped' })]);
    expect(rows).toEqual([]);
  });

  it('maps scheduled/paid/late rows to the Repayment shape', () => {
    const rows = toArrearsRows([occ({ status: 'paid', paidOn: '2026-06-03' })]);
    expect(rows).toEqual([{ id: 'o1', applicationId: 'c1', dueDate: '2026-06-05', paidOn: '2026-06-03', amount: 89, status: 'paid' }]);
  });
});
