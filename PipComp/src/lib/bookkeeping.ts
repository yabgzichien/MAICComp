// src/lib/bookkeeping.ts
// Pure, deterministic bookkeeping and financial report calculation engine.
// Implements traditional Income Statement (Profit & Loss), Balance Sheet,
// and statistical distributions (mean, median, standard deviation, trends).
// Zero UI or DB imports — 100% unit-testable.

import type { Account, AccountKind, BalanceEntry, Category, Transaction } from './types';
import { ACCOUNT_CLASSES, CLASS_BY_ID, accountValueAsOf } from './networth';

export type ReportPeriodType = 'monthly' | 'yearly' | 'all-time' | 'custom';

export interface ReportPeriod {
  type: ReportPeriodType;
  label: string;
  startDate: string | null; // ISO YYYY-MM-DD
  endDate: string | null;   // ISO YYYY-MM-DD
  asOfDate: string;         // ISO YYYY-MM-DD for Balance Sheet
}

export interface IncomeStatementRow {
  categoryId: string;
  categoryLabel: string;
  icon: string;
  amount: number;
  percentage: number; // % of total income or total expense
}

export interface IncomeStatement {
  period: ReportPeriod;
  incomeRows: IncomeStatementRow[];
  totalIncome: number;
  expenseRows: IncomeStatementRow[];
  totalExpense: number;
  netIncome: number; // totalIncome - totalExpense (Net Surplus / Retained Earnings)
  savingsRate: number; // % of income saved (0 if totalIncome <= 0)
  transactionCount: number;
}

export interface BalanceSheetItem {
  accountId: string;
  name: string;
  cls: string;
  clsLabel: string;
  value: number;
  sub: string | null;
  symbol: string | null;
  ticker: string | null;
  quantity: number | null;
}

export interface BalanceSheetGroup {
  cls: string;
  clsLabel: string;
  kind: AccountKind;
  total: number;
  items: BalanceSheetItem[];
}

export interface BalanceSheet {
  asOfDate: string;
  assetGroups: BalanceSheetGroup[];
  totalAssets: number;
  liabilityGroups: BalanceSheetGroup[];
  totalLiabilities: number;
  netWorth: number; // Total Assets - Total Liabilities
  retainedEarnings: number;
  balanced: boolean; // Assets == Liabilities + Equity
}

export interface MonthlyTrendItem {
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. "Aug 2026"
  income: number;
  expense: number;
  netSavings: number;
  savingsRate: number;
  netWorth: number;
}

export interface FinancialStatistics {
  period: ReportPeriod;
  meanMonthlyIncome: number;
  medianMonthlyIncome: number;
  stdDevMonthlyIncome: number;
  cvMonthlyIncome: number; // Coefficient of Variation (stdDev / mean)
  meanMonthlyExpense: number;
  medianMonthlyExpense: number;
  stdDevMonthlyExpense: number;
  minMonthlyIncome: number;
  maxMonthlyIncome: number;
  minMonthlyExpense: number;
  maxMonthlyExpense: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  overallSavingsRate: number;
  activeMonthsCount: number;
  monthlyTrends: MonthlyTrendItem[];
  expenseCategoryBreakdown: {
    categoryId: string;
    label: string;
    amount: number;
    percentage: number;
    hue: number;
  }[];
}

export interface FinancialReportData {
  userName: string;
  generatedAt: string;
  period: ReportPeriod;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  statistics: FinancialStatistics;
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/** Construct a ReportPeriod from selection parameters. */
export function buildReportPeriod(
  type: ReportPeriodType,
  selectedMonth?: string, // YYYY-MM
  selectedYear?: number,  // YYYY
  customStart?: string,   // YYYY-MM-DD
  customEnd?: string,     // YYYY-MM-DD
  now: Date = new Date()
): ReportPeriod {
  const currentIso = now.toISOString().slice(0, 10);
  const curY = now.getFullYear();
  const curM = String(now.getMonth() + 1).padStart(2, '0');

  if (type === 'monthly') {
    const mk = selectedMonth || `${curY}-${curM}`;
    const [yStr, mStr] = mk.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${mk}-01`;
    const endDate = `${mk}-${String(lastDay).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[m - 1] || mStr} ${y}`;
    return {
      type: 'monthly',
      label,
      startDate,
      endDate,
      asOfDate: endDate < currentIso ? endDate : currentIso,
    };
  }

  if (type === 'yearly') {
    const y = selectedYear || curY;
    const startDate = `${y}-01-01`;
    const endDate = `${y}-12-31`;
    return {
      type: 'yearly',
      label: `Year ${y}`,
      startDate,
      endDate,
      asOfDate: endDate < currentIso ? endDate : currentIso,
    };
  }

  if (type === 'custom') {
    const startDate = customStart || `${curY}-01-01`;
    const endDate = customEnd || currentIso;
    return {
      type: 'custom',
      label: `${startDate} to ${endDate}`,
      startDate,
      endDate,
      asOfDate: endDate,
    };
  }

  // All-time
  return {
    type: 'all-time',
    label: 'All-Time',
    startDate: null,
    endDate: null,
    asOfDate: currentIso,
  };
}

/** Filter transactions strictly within a period's date bounds. */
export function filterTransactionsByPeriod(
  txns: Transaction[],
  period: ReportPeriod
): Transaction[] {
  return txns.filter((t) => {
    const d = t.date;
    if (!d) return true; // Include if date-less or tie to general ledger
    if (period.startDate && d < period.startDate) return false;
    if (period.endDate && d > period.endDate) return false;
    return true;
  });
}

/**
 * Compute the traditional Income Statement (Profit & Loss) for a given period.
 */
export function computeIncomeStatement(
  txns: Transaction[],
  categories: Category[],
  period: ReportPeriod
): IncomeStatement {
  const filtered = filterTransactionsByPeriod(txns, period);
  const catMap = new Map<string, Category>();
  for (const c of categories) catMap.set(c.id, c);

  const incomeMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();
  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of filtered) {
    const catId = t.categoryId || (t.type === 'income' ? 'other-income' : 'other');
    const amt = Math.abs(t.amount);
    if (t.type === 'income') {
      incomeMap.set(catId, (incomeMap.get(catId) ?? 0) + amt);
      totalIncome += amt;
    } else {
      expenseMap.set(catId, (expenseMap.get(catId) ?? 0) + amt);
      totalExpense += amt;
    }
  }

  // Build sorted income rows
  const incomeRows: IncomeStatementRow[] = [];
  for (const [catId, amount] of incomeMap.entries()) {
    const cat = catMap.get(catId);
    incomeRows.push({
      categoryId: catId,
      categoryLabel: cat?.label || catId,
      icon: cat?.icon || 'wallet',
      amount: Math.round(amount * 100) / 100,
      percentage: totalIncome > 0 ? Math.round((amount / totalIncome) * 1000) / 10 : 0,
    });
  }
  incomeRows.sort((a, b) => b.amount - a.amount);

  // Build sorted expense rows
  const expenseRows: IncomeStatementRow[] = [];
  for (const [catId, amount] of expenseMap.entries()) {
    const cat = catMap.get(catId);
    expenseRows.push({
      categoryId: catId,
      categoryLabel: cat?.label || catId,
      icon: cat?.icon || 'receipt',
      amount: Math.round(amount * 100) / 100,
      percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 1000) / 10 : 0,
    });
  }
  expenseRows.sort((a, b) => b.amount - a.amount);

  const netIncome = Math.round((totalIncome - totalExpense) * 100) / 100;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netIncome / totalIncome) * 1000) / 10) : 0;

  return {
    period,
    incomeRows,
    totalIncome: Math.round(totalIncome * 100) / 100,
    expenseRows,
    totalExpense: Math.round(totalExpense * 100) / 100,
    netIncome,
    savingsRate,
    transactionCount: filtered.length,
  };
}

/**
 * Compute the traditional Balance Sheet as of a specific date.
 */
export function computeBalanceSheet(
  accounts: Account[],
  balanceEntries: BalanceEntry[],
  asOfDate: string
): BalanceSheet {
  const byAccount: Record<string, BalanceEntry[]> = {};
  for (const e of balanceEntries) (byAccount[e.accountId] ??= []).push(e);

  const assetGroupsMap = new Map<string, BalanceSheetGroup>();
  const liabilityGroupsMap = new Map<string, BalanceSheetGroup>();

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const a of accounts) {
    if (a.archived) continue;
    const value = accountValueAsOf(byAccount[a.id] ?? [], asOfDate);
    const meta = CLASS_BY_ID[a.cls];
    const clsLabel = meta?.label || a.cls;

    const item: BalanceSheetItem = {
      accountId: a.id,
      name: a.name,
      cls: a.cls,
      clsLabel,
      value: Math.round(value * 100) / 100,
      sub: a.sub,
      symbol: a.symbol,
      ticker: a.ticker,
      quantity: a.quantity,
    };

    if (a.kind === 'asset') {
      totalAssets += value;
      let g = assetGroupsMap.get(a.cls);
      if (!g) {
        g = { cls: a.cls, clsLabel, kind: 'asset', total: 0, items: [] };
        assetGroupsMap.set(a.cls, g);
      }
      g.total += value;
      g.items.push(item);
    } else {
      totalLiabilities += value;
      let g = liabilityGroupsMap.get(a.cls);
      if (!g) {
        g = { cls: a.cls, clsLabel, kind: 'liability', total: 0, items: [] };
        liabilityGroupsMap.set(a.cls, g);
      }
      g.total += value;
      g.items.push(item);
    }
  }

  // Order groups in standard ACCOUNT_CLASSES order
  const assetGroups = ACCOUNT_CLASSES
    .filter((c) => c.kind === 'asset')
    .map((c) => assetGroupsMap.get(c.id))
    .filter((g): g is BalanceSheetGroup => !!g);

  for (const g of assetGroups) {
    g.total = Math.round(g.total * 100) / 100;
    g.items.sort((a, b) => b.value - a.value);
  }

  const liabilityGroups = ACCOUNT_CLASSES
    .filter((c) => c.kind === 'liability')
    .map((c) => liabilityGroupsMap.get(c.id))
    .filter((g): g is BalanceSheetGroup => !!g);

  for (const g of liabilityGroups) {
    g.total = Math.round(g.total * 100) / 100;
    g.items.sort((a, b) => b.value - a.value);
  }

  const roundedAssets = Math.round(totalAssets * 100) / 100;
  const roundedLiabilities = Math.round(totalLiabilities * 100) / 100;
  const netWorth = Math.round((roundedAssets - roundedLiabilities) * 100) / 100;

  return {
    asOfDate,
    assetGroups,
    totalAssets: roundedAssets,
    liabilityGroups,
    totalLiabilities: roundedLiabilities,
    netWorth,
    retainedEarnings: netWorth,
    balanced: Math.abs(roundedAssets - (roundedLiabilities + netWorth)) < 0.01,
  };
}

/** Mathematical mean of numbers. */
export function mathMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/** Mathematical median of numbers. */
export function mathMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }
  return Math.round(sorted[mid] * 100) / 100;
}

/** Sample standard deviation of numbers. */
export function mathStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (values.length - 1);
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

/**
 * Compute monthly trends and comprehensive financial statistics (Mean, Median, Std Dev, Min/Max, SVG Data).
 */
export function computeFinancialStatistics(
  txns: Transaction[],
  categories: Category[],
  accounts: Account[],
  balanceEntries: BalanceEntry[],
  period: ReportPeriod
): FinancialStatistics {
  const filtered = filterTransactionsByPeriod(txns, period);
  const catMap = new Map<string, Category>();
  for (const c of categories) catMap.set(c.id, c);

  // Group by month YYYY-MM
  const monthMap = new Map<string, { income: number; expense: number }>();
  const expenseCatMap = new Map<string, number>();

  for (const t of filtered) {
    const d = t.date || period.asOfDate;
    const mk = d.slice(0, 7); // YYYY-MM
    let entry = monthMap.get(mk);
    if (!entry) {
      entry = { income: 0, expense: 0 };
      monthMap.set(mk, entry);
    }
    const amt = Math.abs(t.amount);
    if (t.type === 'income') {
      entry.income += amt;
    } else {
      entry.expense += amt;
      const catId = t.categoryId || 'other';
      expenseCatMap.set(catId, (expenseCatMap.get(catId) ?? 0) + amt);
    }
  }

  // Sorted months
  const sortedMonths = [...monthMap.keys()].sort();
  const byAccount: Record<string, BalanceEntry[]> = {};
  for (const e of balanceEntries) (byAccount[e.accountId] ??= []).push(e);

  const monthlyTrends: MonthlyTrendItem[] = sortedMonths.map((mk) => {
    const data = monthMap.get(mk)!;
    const [yStr, mStr] = mk.split('-');
    const m = parseInt(mStr, 10);
    const y = parseInt(yStr, 10);
    const monthLabel = `${MONTH_NAMES_SHORT[m - 1] || mStr} '${String(y).slice(2)}`;
    const lastDay = new Date(y, m, 0).getDate();
    const asOf = `${mk}-${String(lastDay).padStart(2, '0')}`;

    // Compute month-end net worth
    let aTotal = 0;
    let lTotal = 0;
    for (const a of accounts) {
      if (a.archived) continue;
      const val = accountValueAsOf(byAccount[a.id] ?? [], asOf);
      if (a.kind === 'asset') aTotal += val;
      else lTotal += val;
    }

    const netSavings = Math.round((data.income - data.expense) * 100) / 100;
    const savingsRate = data.income > 0 ? Math.max(0, Math.round((netSavings / data.income) * 1000) / 10) : 0;

    return {
      monthKey: mk,
      monthLabel,
      income: Math.round(data.income * 100) / 100,
      expense: Math.round(data.expense * 100) / 100,
      netSavings,
      savingsRate,
      netWorth: Math.round((aTotal - lTotal) * 100) / 100,
    };
  });

  const incomeSeries = monthlyTrends.map((t) => t.income);
  const expenseSeries = monthlyTrends.map((t) => t.expense);

  const meanMonthlyIncome = mathMean(incomeSeries);
  const medianMonthlyIncome = mathMedian(incomeSeries);
  const stdDevMonthlyIncome = mathStdDev(incomeSeries);
  const cvMonthlyIncome = meanMonthlyIncome > 0 ? Math.round((stdDevMonthlyIncome / meanMonthlyIncome) * 100) / 100 : 0;

  const meanMonthlyExpense = mathMean(expenseSeries);
  const medianMonthlyExpense = mathMedian(expenseSeries);
  const stdDevMonthlyExpense = mathStdDev(expenseSeries);

  const minMonthlyIncome = incomeSeries.length ? Math.min(...incomeSeries) : 0;
  const maxMonthlyIncome = incomeSeries.length ? Math.max(...incomeSeries) : 0;
  const minMonthlyExpense = expenseSeries.length ? Math.min(...expenseSeries) : 0;
  const maxMonthlyExpense = expenseSeries.length ? Math.max(...expenseSeries) : 0;

  const totalIncome = Math.round(incomeSeries.reduce((a, b) => a + b, 0) * 100) / 100;
  const totalExpense = Math.round(expenseSeries.reduce((a, b) => a + b, 0) * 100) / 100;
  const netSavings = Math.round((totalIncome - totalExpense) * 100) / 100;
  const overallSavingsRate = totalIncome > 0 ? Math.max(0, Math.round((netSavings / totalIncome) * 1000) / 10) : 0;

  // Expense Category Breakdown
  const expenseCategoryBreakdown = [...expenseCatMap.entries()]
    .map(([catId, amount]) => {
      const cat = catMap.get(catId);
      return {
        categoryId: catId,
        label: cat?.label || catId,
        amount: Math.round(amount * 100) / 100,
        percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 1000) / 10 : 0,
        hue: cat?.hue ?? 200,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    period,
    meanMonthlyIncome,
    medianMonthlyIncome,
    stdDevMonthlyIncome,
    cvMonthlyIncome,
    meanMonthlyExpense,
    medianMonthlyExpense,
    stdDevMonthlyExpense,
    minMonthlyIncome,
    maxMonthlyIncome,
    minMonthlyExpense,
    maxMonthlyExpense,
    totalIncome,
    totalExpense,
    netSavings,
    overallSavingsRate,
    activeMonthsCount: monthlyTrends.length,
    monthlyTrends,
    expenseCategoryBreakdown,
  };
}

/**
 * Assemble all components into a complete financial report bundle.
 */
export function buildFinancialReportBundle(
  txns: Transaction[],
  categories: Category[],
  accounts: Account[],
  balanceEntries: BalanceEntry[],
  period: ReportPeriod,
  userName: string = 'Pip User'
): FinancialReportData {
  const incomeStatement = computeIncomeStatement(txns, categories, period);
  const balanceSheet = computeBalanceSheet(accounts, balanceEntries, period.asOfDate);
  const statistics = computeFinancialStatistics(txns, categories, accounts, balanceEntries, period);
  const filteredTxns = filterTransactionsByPeriod(txns, period);

  return {
    userName,
    generatedAt: new Date().toISOString(),
    period,
    incomeStatement,
    balanceSheet,
    statistics,
    transactions: [...filteredTxns].sort((a, b) => ((b.date || '') < (a.date || '') ? -1 : (b.date || '') > (a.date || '') ? 1 : 0)),
    categories,
    accounts,
  };
}
