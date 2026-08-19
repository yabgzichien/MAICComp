import {
  buildReportPeriod,
  filterTransactionsByPeriod,
  computeIncomeStatement,
  computeBalanceSheet,
  mathMean,
  mathMedian,
  mathStdDev,
  computeFinancialStatistics,
  buildFinancialReportBundle,
} from '../src/lib/bookkeeping';
import type { Account, BalanceEntry, Category, Transaction } from '../src/lib/types';

function makeTxn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'Grab',
    merchantKey: 'grab',
    amount: 50,
    currency: 'MYR',
    type: 'expense',
    date: '2026-06-15',
    categoryId: 'transport',
    createdAt: '2026-06-15T10:00:00.000Z',
    source: 'extracted',
    ...over,
  };
}

function makeAcct(over: Partial<Account>): Account {
  return {
    id: 'a1',
    name: 'Maybank Savings',
    kind: 'asset',
    cls: 'cash',
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    sub: null,
    symbol: null,
    ticker: null,
    quantity: null,
    cost: null,
    ...over,
  };
}

function makeEntry(over: Partial<BalanceEntry>): BalanceEntry {
  return {
    id: Math.random().toString(36).slice(2),
    accountId: 'a1',
    value: 1000,
    asOf: '2026-06-30',
    createdAt: '2026-06-30T10:00:00.000Z',
    ...over,
  };
}

const mockCategories: Category[] = [
  { id: 'employment-income', label: 'Salary Income', icon: 'wallet', hue: 150, kind: 'income', isDefault: true },
  { id: 'gig-income', label: 'Gig Deliveries', icon: 'car', hue: 130, kind: 'income', isDefault: true },
  { id: 'food', label: 'Food & Groceries', icon: 'cart', hue: 160, kind: 'expense', isDefault: true },
  { id: 'transport', label: 'Transport & Fuel', icon: 'car', hue: 240, kind: 'expense', isDefault: true },
  { id: 'housing', label: 'Housing & Rent', icon: 'home', hue: 200, kind: 'expense', isDefault: true },
];

describe('buildReportPeriod', () => {
  const refDate = new Date('2026-08-15T12:00:00.000Z');

  it('builds monthly period with proper first/last dates', () => {
    const p = buildReportPeriod('monthly', '2026-06', undefined, undefined, undefined, refDate);
    expect(p.type).toBe('monthly');
    expect(p.label).toBe('June 2026');
    expect(p.startDate).toBe('2026-06-01');
    expect(p.endDate).toBe('2026-06-30');
    expect(p.asOfDate).toBe('2026-06-30');
  });

  it('builds yearly period with proper bounds', () => {
    const p = buildReportPeriod('yearly', undefined, 2025, undefined, undefined, refDate);
    expect(p.type).toBe('yearly');
    expect(p.label).toBe('Year 2025');
    expect(p.startDate).toBe('2025-01-01');
    expect(p.endDate).toBe('2025-12-31');
    expect(p.asOfDate).toBe('2025-12-31');
  });

  it('builds all-time period with null bounds', () => {
    const p = buildReportPeriod('all-time', undefined, undefined, undefined, undefined, refDate);
    expect(p.type).toBe('all-time');
    expect(p.label).toBe('All-Time');
    expect(p.startDate).toBeNull();
    expect(p.endDate).toBeNull();
    expect(p.asOfDate).toBe('2026-08-15');
  });
});

describe('filterTransactionsByPeriod', () => {
  const txns = [
    makeTxn({ date: '2026-05-31' }),
    makeTxn({ date: '2026-06-01' }),
    makeTxn({ date: '2026-06-15' }),
    makeTxn({ date: '2026-06-30' }),
    makeTxn({ date: '2026-07-01' }),
  ];

  it('filters strictly within period bounds', () => {
    const period = buildReportPeriod('monthly', '2026-06');
    const res = filterTransactionsByPeriod(txns, period);
    expect(res).toHaveLength(3);
    expect(res.map((t) => t.date)).toEqual(['2026-06-01', '2026-06-15', '2026-06-30']);
  });
});

describe('computeIncomeStatement', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'employment-income', amount: 3000, date: '2026-06-05' }),
    makeTxn({ type: 'income', categoryId: 'gig-income', amount: 1000, date: '2026-06-12' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 600, date: '2026-06-10' }),
    makeTxn({ type: 'expense', categoryId: 'transport', amount: 400, date: '2026-06-18' }),
    makeTxn({ type: 'expense', categoryId: 'housing', amount: 1000, date: '2026-06-01' }),
  ];

  it('correctly calculates categorized revenue, expenses, net income, and savings rate', () => {
    const period = buildReportPeriod('monthly', '2026-06');
    const is = computeIncomeStatement(txns, mockCategories, period);

    expect(is.totalIncome).toBe(4000);
    expect(is.totalExpense).toBe(2000);
    expect(is.netIncome).toBe(2000);
    expect(is.savingsRate).toBe(50); // 50%
    expect(is.incomeRows).toHaveLength(2);
    expect(is.incomeRows[0]).toEqual({
      categoryId: 'employment-income',
      categoryLabel: 'Salary Income',
      icon: 'wallet',
      amount: 3000,
      percentage: 75,
    });
    expect(is.expenseRows).toHaveLength(3);
    expect(is.expenseRows[0].categoryLabel).toBe('Housing & Rent');
    expect(is.expenseRows[0].amount).toBe(1000);
    expect(is.expenseRows[0].percentage).toBe(50);
  });
});

describe('computeBalanceSheet', () => {
  const accounts: Account[] = [
    makeAcct({ id: 'cash1', name: 'Maybank', kind: 'asset', cls: 'cash' }),
    makeAcct({ id: 'inv1', name: 'Luno Bitcoin', kind: 'asset', cls: 'investments', symbol: 'BTC' }),
    makeAcct({ id: 'loan1', name: 'Personal Loan', kind: 'liability', cls: 'personal' }),
  ];

  const entries: BalanceEntry[] = [
    makeEntry({ accountId: 'cash1', value: 5000, asOf: '2026-06-30' }),
    makeEntry({ accountId: 'inv1', value: 8000, asOf: '2026-06-30' }),
    makeEntry({ accountId: 'loan1', value: 3000, asOf: '2026-06-30' }),
  ];

  it('computes double-entry Balance Sheet with Assets = Liabilities + Equity', () => {
    const bs = computeBalanceSheet(accounts, entries, '2026-06-30');
    expect(bs.totalAssets).toBe(13000);
    expect(bs.totalLiabilities).toBe(3000);
    expect(bs.netWorth).toBe(10000);
    expect(bs.balanced).toBe(true);
    expect(bs.assetGroups).toHaveLength(2);
    expect(bs.liabilityGroups).toHaveLength(1);
  });
});

describe('math statistics helpers', () => {
  const dataset = [1000, 2000, 3000, 4000, 5000];

  it('computes mathematical mean', () => {
    expect(mathMean(dataset)).toBe(3000);
    expect(mathMean([])).toBe(0);
  });

  it('computes mathematical median for odd and even sets', () => {
    expect(mathMedian(dataset)).toBe(3000);
    expect(mathMedian([1000, 2000, 4000, 5000])).toBe(3000);
  });

  it('computes sample standard deviation', () => {
    const std = mathStdDev(dataset);
    expect(std).toBeCloseTo(1581.14, 1);
  });
});

describe('computeFinancialStatistics & buildFinancialReportBundle', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'employment-income', amount: 3000, date: '2026-05-15' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 1000, date: '2026-05-20' }),
    makeTxn({ type: 'income', categoryId: 'employment-income', amount: 4000, date: '2026-06-15' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 1200, date: '2026-06-20' }),
  ];

  const accounts = [makeAcct({ id: 'cash1', kind: 'asset', cls: 'cash' })];
  const entries = [
    makeEntry({ accountId: 'cash1', value: 2000, asOf: '2026-05-31' }),
    makeEntry({ accountId: 'cash1', value: 4800, asOf: '2026-06-30' }),
  ];

  it('assembles complete report bundle with monthly trends and distributions', () => {
    const period = buildReportPeriod('yearly', undefined, 2026);
    const bundle = buildFinancialReportBundle(txns, mockCategories, accounts, entries, period, 'Ahmad Test');

    expect(bundle.userName).toBe('Ahmad Test');
    expect(bundle.incomeStatement.totalIncome).toBe(7000);
    expect(bundle.incomeStatement.totalExpense).toBe(2200);
    expect(bundle.statistics.meanMonthlyIncome).toBe(3500);
    expect(bundle.statistics.meanMonthlyExpense).toBe(1100);
    expect(bundle.statistics.monthlyTrends).toHaveLength(2);
    expect(bundle.statistics.monthlyTrends[0].monthKey).toBe('2026-05');
    expect(bundle.statistics.monthlyTrends[1].monthKey).toBe('2026-06');
  });
});
