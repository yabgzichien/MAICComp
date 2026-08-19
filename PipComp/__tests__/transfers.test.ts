// __tests__/transfers.test.ts
// Guard suite for the 'transfer' TxnType (see src/lib/types.ts). A transfer moves money between
// two of the user's own accounts (e.g. a DCA contribution from cash into a holding) and must be
// invisible to every score-relevant aggregator: it is neither income nor an expense, so it must
// never move avgSurplus, savingsRate, or a detected obligation's monthly debt-service estimate.
// This test snapshots every score-critical aggregator's output on a ledger, then asserts adding
// a transfer row leaves every output byte-identical.
import { monthlyIncomeStatement, spentByCategory } from '../src/lib/recap';
import { detectObligations } from '../src/lib/obligations';
import { computeSpendingProfile } from '../src/lib/spendingProfile';
import { computeIncomeQuality } from '../src/lib/incomeQuality';
import { computeSavingsHabit } from '../src/lib/savingsHabit';
import { computeIncomeStatement, computeFinancialStatistics, buildReportPeriod } from '../src/lib/bookkeeping';
import type { Account, BalanceEntry, Category, Transaction } from '../src/lib/types';

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'X', merchantKey: 'x', amount: 10, currency: 'MYR',
    type: 'expense', date: '2026-06-10', categoryId: 'dining',
    createdAt: '2026-06-10T10:00:00.000Z', source: 'manual', ...over,
  };
}

const mockCategories: Category[] = [
  { id: 'salary', label: 'Salary', icon: 'wallet', hue: 150, kind: 'income', isDefault: true },
  { id: 'dining', label: 'Dining', icon: 'utensils', hue: 25, kind: 'expense', isDefault: true },
  { id: 'housing', label: 'Housing', icon: 'home', hue: 200, kind: 'expense', isDefault: true },
];

// A 4-month ledger with a stable "Astro" bill each month, so detectObligations has evidence
// (MIN_MONTHS = 3) and a stable income source, so computeIncomeQuality/computeSavingsHabit have
// full months to look back over.
function baseLedger(): Transaction[] {
  const rows: Transaction[] = [];
  const months = ['2026-03', '2026-04', '2026-05', '2026-06'];
  for (const m of months) {
    rows.push(txn({ merchantRaw: 'Employer', merchantKey: 'employer', type: 'income', categoryId: 'salary', amount: 4000, date: `${m}-01` }));
    rows.push(txn({ merchantRaw: 'Astro', merchantKey: 'astro', type: 'expense', categoryId: 'housing', amount: 100, date: `${m}-05` }));
    rows.push(txn({ merchantRaw: 'Grocer', merchantKey: 'grocer', type: 'expense', categoryId: 'dining', amount: 300, date: `${m}-10` }));
  }
  return rows;
}

const now = new Date('2026-07-15T12:00:00.000Z');

function snapshotAll(txns: Transaction[]) {
  const period = buildReportPeriod('monthly', '2026-06');
  return {
    monthlyIncomeStatement: monthlyIncomeStatement(txns, '2026-06'),
    spentByCategory: spentByCategory(txns, '2026-06'),
    detectObligations: detectObligations(txns),
    spendingProfile: computeSpendingProfile(txns),
    incomeQuality: computeIncomeQuality(txns),
    savingsHabit: computeSavingsHabit(txns, 200, now),
    bookkeepingIncomeStatement: computeIncomeStatement(txns, mockCategories, period),
    bookkeepingStatistics: computeFinancialStatistics(txns, mockCategories, [] as Account[], [] as BalanceEntry[], period),
  };
}

describe('transfer TxnType is invisible to every score-relevant aggregator', () => {
  it('adding a transfer row leaves every money/score-relevant output unchanged', () => {
    const before = snapshotAll(baseLedger());

    const withTransfer = [
      ...baseLedger(),
      txn({
        merchantRaw: 'Stockbroker DCA',
        merchantKey: 'stockbroker-dca',
        type: 'transfer',
        categoryId: null,
        amount: 200,
        date: '2026-06-15',
      }),
    ];
    const after = snapshotAll(withTransfer);

    // `transactionCount` is a raw activity count for the report header, not a money figure, and
    // a transfer is a real recorded transaction — it is correct for this one field to move.
    // Every other field derives from income/expense amounts and must stay byte-identical.
    expect(after.bookkeepingIncomeStatement.transactionCount).toBe(before.bookkeepingIncomeStatement.transactionCount + 1);
    const { bookkeepingIncomeStatement: afterStmt, ...afterRest } = after;
    const { bookkeepingIncomeStatement: beforeStmt, ...beforeRest } = before;
    const { transactionCount: _afterCount, ...afterStmtRest } = afterStmt;
    const { transactionCount: _beforeCount, ...beforeStmtRest } = beforeStmt;
    expect({ ...afterRest, bookkeepingIncomeStatement: afterStmtRest }).toEqual({
      ...beforeRest,
      bookkeepingIncomeStatement: beforeStmtRest,
    });
  });

  it('a recurring transfer is never picked up as a detected obligation', () => {
    const rows: Transaction[] = [];
    for (const m of ['2026-03', '2026-04', '2026-05', '2026-06']) {
      rows.push(txn({ merchantRaw: 'Stockbroker DCA', merchantKey: 'stockbroker-dca', type: 'transfer', categoryId: null, amount: 200, date: `${m}-15` }));
    }
    const { obligations } = detectObligations(rows);
    expect(obligations.find((o) => o.label.toLowerCase().includes('stockbroker'))).toBeUndefined();
  });
});
