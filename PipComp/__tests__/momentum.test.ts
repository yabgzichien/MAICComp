import { computeMomentum } from '../src/lib/momentum';
import type { CreditInputs } from '../src/lib/assembleCredit';
import type { Transaction } from '../src/lib/types';

let seq = 0;
function txn(date: string, amount: number, type: 'income' | 'expense'): Transaction {
  seq += 1;
  return {
    id: String(seq),
    merchantRaw: `M${seq}`,
    merchantKey: `m${seq}`,
    amount,
    currency: 'MYR',
    type,
    date,
    categoryId: type === 'income' ? 'inc' : 'exp',
    createdAt: `${date}T12:00:00.000Z`,
    source: 'extracted',
  };
}
function inputsOf(transactions: Transaction[]): CreditInputs {
  return {
    transactions,
    snapshotMonths: [],
    allocations: {},
    accounts: [],
    balanceEntries: [],
    accountValues: {},
    repaymentSummary: { onTime: 0, total: 0 },
  };
}

const NOW = new Date('2026-07-01T12:00:00.000Z');

// N distinct daily transactions ending the day before `endExclusive`, walking
// backwards one day at a time. Income on every 5th day, expenses otherwise.
function dailyHistory(n: number, endExclusive: string): Transaction[] {
  const end = new Date(`${endExclusive}T12:00:00.000Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end.getTime() - (i + 1) * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    return i % 5 === 0 ? txn(iso, 1800 + i, 'income') : txn(iso, 35 + i * 1.3, 'expense');
  });
}

describe('computeMomentum', () => {
  // The from-point (NOW − 90d = 2026-04-02) must itself have had meaningful
  // data  Brief D's minimum-history floor of 30 covered days.

  it('established user: emits the block unchanged when the from-point clears the floor', () => {
    const txns: Transaction[] = [
      // 40 covered days ending just before the from-point (2026-04-02).
      ...dailyHistory(40, '2026-04-02'),
      // Dense recent activity (the last ~3 months) across many distinct days.
      ...['04', '05', '06'].flatMap((mm) =>
        Array.from({ length: 18 }, (_, i) =>
          i % 6 === 0
            ? txn(`2026-${mm}-${String(i + 2).padStart(2, '0')}`, 2000 + i, 'income')
            : txn(`2026-${mm}-${String(i + 2).padStart(2, '0')}`, 120 + i * 2.1, 'expense')
        )
      ),
    ];

    const m = computeMomentum(inputsOf(txns), NOW, 90);

    expect(m).not.toBeNull();
    expect(m!.coverageDaysFrom).toBeGreaterThanOrEqual(30);
    expect(m!.coverageDaysTo).toBeGreaterThan(m!.coverageDaysFrom);
    expect(m!.lookbackDays).toBe(90);
    expect(['rising', 'flat', 'falling']).toContain(m!.direction);
  });

  it('new user: no block at all when the from-point had no data', () => {
    // Only recent history  90 days ago this borrower did not exist in the data.
    const txns = dailyHistory(35, '2026-07-01');
    expect(computeMomentum(inputsOf(txns), NOW, 90)).toBeNull();
  });

  it('no history at all: no block (an absent block is honest; a universal "flat" is not)', () => {
    expect(computeMomentum(inputsOf([]), NOW, 90)).toBeNull();
  });

  it('boundary: exactly 30 covered days at the from-point emits the block', () => {
    const txns = [...dailyHistory(30, '2026-04-02'), ...dailyHistory(40, '2026-07-01')];
    const m = computeMomentum(inputsOf(txns), NOW, 90);
    expect(m).not.toBeNull();
    expect(m!.coverageDaysFrom).toBe(30);
  });

  it('boundary: 29 covered days at the from-point stays below the floor  no block', () => {
    const txns = [...dailyHistory(29, '2026-04-02'), ...dailyHistory(40, '2026-07-01')];
    expect(computeMomentum(inputsOf(txns), NOW, 90)).toBeNull();
  });
});
