import * as XLSX from 'xlsx';
import {
  buildReportPeriod,
  buildFinancialReportBundle,
} from '../src/lib/bookkeeping';
import {
  generateExcelWorkbook,
  generateCSV,
  generateHTMLReport,
  generatePrintablePDFHtml,
} from '../src/lib/financialExport';
import type { Account, BalanceEntry, Category, Transaction } from '../src/lib/types';

function makeTxn(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    merchantRaw: 'GrabCar',
    merchantKey: 'grabcar',
    amount: 30,
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
    name: 'CIMB Bank',
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
    value: 5000,
    asOf: '2026-06-30',
    createdAt: '2026-06-30T10:00:00.000Z',
    ...over,
  };
}

const mockCategories: Category[] = [
  { id: 'salary', label: 'Monthly Salary', icon: 'wallet', hue: 150, kind: 'income', isDefault: true },
  { id: 'transport', label: 'Transport & Fuel', icon: 'car', hue: 240, kind: 'expense', isDefault: true },
  { id: 'food', label: 'Food & Groceries', icon: 'cart', hue: 160, kind: 'expense', isDefault: true },
];

describe('generateExcelWorkbook', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'salary', amount: 5000, date: '2026-06-01' }),
    makeTxn({ type: 'expense', categoryId: 'transport', amount: 300, date: '2026-06-10' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 700, date: '2026-06-12' }),
  ];
  const accounts = [makeAcct({ id: 'a1', kind: 'asset', cls: 'cash' })];
  const entries = [makeEntry({ accountId: 'a1', value: 8000, asOf: '2026-06-30' })];
  const period = buildReportPeriod('monthly', '2026-06');
  const bundle = buildFinancialReportBundle(txns, mockCategories, accounts, entries, period, 'Test Borrower');

  it('generates a valid .xlsx binary array with all 4 sheets', () => {
    const bytes = generateExcelWorkbook(bundle);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);

    // Read back workbook
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual([
      'Income Statement',
      'Balance Sheet',
      'Transaction Ledger',
      'Trends & Statistics',
    ]);

    // Check Income Statement Sheet content
    const isCsv = XLSX.utils.sheet_to_csv(wb.Sheets['Income Statement']);
    expect(isCsv).toContain('FINANCIAL REPORT: INCOME STATEMENT');
    expect(isCsv).toContain('Monthly Salary');
    expect(isCsv).toContain('5000');
    expect(isCsv).toContain('TOTAL EXPENSES');
    expect(isCsv).toContain('1000');

    // Check Balance Sheet
    const bsCsv = XLSX.utils.sheet_to_csv(wb.Sheets['Balance Sheet']);
    expect(bsCsv).toContain('TOTAL ASSETS');
    expect(bsCsv).toContain('TOTAL NET WORTH');

    // Check Ledger
    const ledgerCsv = XLSX.utils.sheet_to_csv(wb.Sheets['Transaction Ledger']);
    expect(ledgerCsv).toContain('GrabCar');
  });
});

describe('generateCSV', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'salary', amount: 4500, date: '2026-06-01' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 500, date: '2026-06-05' }),
  ];
  const accounts = [makeAcct({ id: 'a1' })];
  const entries = [makeEntry({ value: 6000 })];
  const period = buildReportPeriod('monthly', '2026-06');
  const bundle = buildFinancialReportBundle(txns, mockCategories, accounts, entries, period, 'Nurul');

  it('generates structured CSV with headers, summaries, and ledger lines', () => {
    const csv = generateCSV(bundle);
    expect(csv).toContain('"FINANCIAL REPORT & BOOKKEEPING EXPORT"');
    expect(csv).toContain('"Name","Nurul"');
    expect(csv).toContain('"Total Revenue",4500');
    expect(csv).toContain('"Total Expenses",500');
    expect(csv).toContain('"Net Income / Savings",4000');
    expect(csv).toContain('=== TRANSACTION LEDGER ===');
  });
});

describe('generateHTMLReport', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'salary', amount: 3500, date: '2026-05-01' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 800, date: '2026-05-10' }),
    makeTxn({ type: 'income', categoryId: 'salary', amount: 4500, date: '2026-06-01' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 900, date: '2026-06-10' }),
  ];
  const accounts = [makeAcct({ id: 'a1' })];
  const entries = [makeEntry({ value: 5000, asOf: '2026-06-30' })];
  const period = buildReportPeriod('yearly', undefined, 2026);
  const bundle = buildFinancialReportBundle(txns, mockCategories, accounts, entries, period, 'Faizal');

  it('generates complete standalone HTML with embedded SVG charts and statistics', () => {
    const html = generateHTMLReport(bundle);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Financial Report & Analytics - Faizal - Year 2026</title>');
    expect(html).toContain('Monthly Cash Flow (Income vs Expenses)');
    expect(html).toContain('Expense Category Distribution');
    expect(html).toContain('Net Worth & Cumulative Savings Trajectory');
    expect(html).toContain('<svg');
    expect(html).toContain('Income Statement (P&amp;L)');
    expect(html).toContain('Balance Sheet');
    expect(html).toContain('Itemized Transaction Ledger');
  });
});

describe('generatePrintablePDFHtml', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'salary', amount: 3200, date: '2026-06-01' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 400, date: '2026-06-15' }),
  ];
  const accounts = [makeAcct({ id: 'a1' })];
  const entries = [makeEntry({ value: 4000, asOf: '2026-06-30' })];
  const period = buildReportPeriod('monthly', '2026-06');
  const bundle = buildFinancialReportBundle(txns, mockCategories, accounts, entries, period, 'Ravi');

  it('generates clean printable PDF HTML with formal accounting sections', () => {
    const pdfHtml = generatePrintablePDFHtml(bundle);
    expect(pdfHtml).toContain('Statement of Financial Condition &amp; Operations');
    expect(pdfHtml).toContain('I. Income Statement (Statement of Profit &amp; Loss)');
    expect(pdfHtml).toContain('II. Balance Sheet (Statement of Financial Position)');
    expect(pdfHtml).toContain('III. Key Financial Statistics &amp; Regularity');
    expect(pdfHtml).toContain('IV. Itemized Transaction Ledger');
  });
});
