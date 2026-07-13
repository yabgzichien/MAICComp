import { assembleCredit, type CreditInputs } from '../src/lib/assembleCredit';
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

describe('assembleCredit', () => {
  it('excludes transactions dated after the as-of date', () => {
    const input = inputsOf([
      txn('2026-04-10', 100, 'expense'),
      txn('2026-05-10', 100, 'expense'),
      txn('2026-06-10', 100, 'expense'),
    ]);

    const early = assembleCredit(input, new Date('2026-04-15T12:00:00.000Z'));
    const late = assembleCredit(input, new Date('2026-06-15T12:00:00.000Z'));

    // As-of mid-April only the first transaction exists; by mid-June all three do.
    expect(early.coverage.daysCovered).toBe(1);
    expect(late.coverage.daysCovered).toBe(3);
  });
});
