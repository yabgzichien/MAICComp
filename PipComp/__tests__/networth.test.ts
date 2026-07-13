// __tests__/networth.test.ts
import {
  currentValue,
  accountValueAsOf,
  netWorth,
  groupByClass,
  netWorthSeries,
  defaultLinkEffect,
  applyEffect,
} from '../src/lib/networth';
import type { Account, BalanceEntry } from '../src/lib/types';

function acct(over: Partial<Account>): Account {
  return {
    id: 'a1', name: 'Acct', kind: 'asset', cls: 'cash', archived: false, createdAt: '2026-01-01T00:00:00.000Z',
    sub: null, symbol: null, ticker: null, quantity: null, cost: null, ...over,
  };
}
function entry(over: Partial<BalanceEntry>): BalanceEntry {
  return { id: Math.random().toString(36).slice(2), accountId: 'a1', value: 100, asOf: '2026-05-01', createdAt: '2026-05-01T00:00:00.000Z', ...over };
}

describe('currentValue', () => {
  it('returns the latest entry by asOf', () => {
    const es = [entry({ value: 100, asOf: '2026-04-01' }), entry({ value: 250, asOf: '2026-06-01' }), entry({ value: 180, asOf: '2026-05-01' })];
    expect(currentValue(es)).toBe(250);
  });
  it('breaks asOf ties by createdAt', () => {
    const es = [
      entry({ value: 10, asOf: '2026-05-01', createdAt: '2026-05-01T09:00:00.000Z' }),
      entry({ value: 20, asOf: '2026-05-01', createdAt: '2026-05-01T18:00:00.000Z' }),
    ];
    expect(currentValue(es)).toBe(20);
  });
  it('is 0 when there are no entries', () => {
    expect(currentValue([])).toBe(0);
  });
});

describe('accountValueAsOf', () => {
  const es = [entry({ value: 100, asOf: '2026-04-10' }), entry({ value: 300, asOf: '2026-06-15' })];
  it('uses the latest entry on or before the date', () => {
    expect(accountValueAsOf(es, '2026-05-31')).toBe(100);
    expect(accountValueAsOf(es, '2026-06-30')).toBe(300);
  });
  it('is 0 before any entry exists', () => {
    expect(accountValueAsOf(es, '2026-03-01')).toBe(0);
  });
});

describe('netWorth', () => {
  it('sums assets minus liabilities, ignoring archived', () => {
    const accounts = [
      acct({ id: 'cash1', kind: 'asset', cls: 'cash' }),
      acct({ id: 'inv1', kind: 'asset', cls: 'investments' }),
      acct({ id: 'car', kind: 'liability', cls: 'car' }),
      acct({ id: 'old', kind: 'asset', cls: 'cash', archived: true }),
    ];
    const values = { cash1: 1000, inv1: 5000, car: 2000, old: 9999 };
    expect(netWorth(accounts, values)).toEqual({ assets: 6000, liabilities: 2000, net: 4000 });
  });
  it('handles missing values as 0', () => {
    expect(netWorth([acct({ id: 'x' })], {})).toEqual({ assets: 0, liabilities: 0, net: 0 });
  });
});

describe('groupByClass', () => {
  it('groups active accounts by class in canonical order with totals', () => {
    const accounts = [
      acct({ id: 'tng', name: 'TnG', kind: 'asset', cls: 'cash' }),
      acct({ id: 'fd', name: 'FD', kind: 'asset', cls: 'cash' }),
      acct({ id: 'stk', name: 'Stocks', kind: 'asset', cls: 'investments' }),
      acct({ id: 'car', name: 'Car Loan', kind: 'liability', cls: 'car' }),
    ];
    const values = { tng: 50, fd: 950, stk: 3000, car: 1500 };
    const g = groupByClass(accounts, values);
    expect(g.assets.map((c) => [c.cls, c.total])).toEqual([['cash', 1000], ['investments', 3000]]);
    expect(g.liabilities.map((c) => [c.cls, c.total])).toEqual([['car', 1500]]);
    // Sorted by value, high → low (FD 950 before TnG 50).
    expect(g.assets[0].accounts.map((a) => a.account.name)).toEqual(['FD', 'TnG']);
  });
});

describe('netWorthSeries', () => {
  it('computes month-end net worth per month key', () => {
    const accounts = [acct({ id: 'cash1', kind: 'asset', cls: 'cash' }), acct({ id: 'loan', kind: 'liability', cls: 'personal' })];
    const entries = [
      entry({ accountId: 'cash1', value: 1000, asOf: '2026-04-15' }),
      entry({ accountId: 'cash1', value: 1200, asOf: '2026-06-10' }),
      entry({ accountId: 'loan', value: 500, asOf: '2026-04-20' }),
      entry({ accountId: 'loan', value: 300, asOf: '2026-06-05' }),
    ];
    const series = netWorthSeries(accounts, entries, ['2026-04', '2026-05', '2026-06']);
    expect(series).toEqual([
      { monthKey: '2026-04', assets: 1000, liabilities: 500, net: 500 },
      { monthKey: '2026-05', assets: 1000, liabilities: 500, net: 500 },
      { monthKey: '2026-06', assets: 1200, liabilities: 300, net: 900 },
    ]);
  });
});

describe('defaultLinkEffect', () => {
  it('liability + expense pays down (subtract); income draws up (add)', () => {
    expect(defaultLinkEffect('liability', 'expense')).toBe('subtract');
    expect(defaultLinkEffect('liability', 'income')).toBe('add');
  });
  it('asset + income adds; expense subtracts', () => {
    expect(defaultLinkEffect('asset', 'income')).toBe('add');
    expect(defaultLinkEffect('asset', 'expense')).toBe('subtract');
  });
});

describe('applyEffect', () => {
  it('adds or subtracts and rounds to cents', () => {
    expect(applyEffect(100, 25.5, 'add')).toBe(125.5);
    expect(applyEffect(50, 10, 'subtract')).toBe(40);
    expect(applyEffect(0, 1 / 3, 'add')).toBe(0.33);
  });
});
