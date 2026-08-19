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
  generateAdvancedImportJSON,
} from '../src/lib/financialExport';
import { parseJSON } from '../src/lib/advancedImport';
import type { Commitment, CommitmentOccurrence } from '../src/lib/commitments';
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

describe('generateAdvancedImportJSON', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'salary', amount: 4500, date: '2026-06-01', merchantRaw: 'Employer Sdn Bhd' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 500, date: '2026-06-05', merchantRaw: 'Grocer' }),
  ];
  const accounts = [
    makeAcct({ id: 'a1', name: 'CIMB Bank', kind: 'asset', cls: 'cash' }),
    makeAcct({ id: 'a2', name: 'Owed by Friends', kind: 'asset', cls: 'receivable' }),
  ];
  const entries = [
    makeEntry({ accountId: 'a1', value: 6000, asOf: '2026-06-30' }),
    makeEntry({ accountId: 'a2', value: 120, asOf: '2026-06-30' }),
  ];
  const period = buildReportPeriod('monthly', '2026-06');
  const bundle = buildFinancialReportBundle(txns, mockCategories, accounts, entries, period, 'Nurul');

  it('produces JSON that round-trips through the Advanced Import parser', () => {
    const json = generateAdvancedImportJSON(bundle);
    const { transactions, accounts: parsedAccounts } = parseJSON(json);

    expect(transactions).toHaveLength(2);
    expect(transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'income', amount: 4500, merchant: 'Employer Sdn Bhd' }),
      expect.objectContaining({ type: 'expense', amount: 500, merchant: 'Grocer' }),
    ]));

    // The managed receivable ("Owed to me") balance must never round-trip
    // back into a re-importable account.
    expect(parsedAccounts).toHaveLength(1);
    expect(parsedAccounts[0]).toMatchObject({ name: 'CIMB Bank', cls: 'cash', balance: 6000 });
  });

  it('stamps a version-2 payload', () => {
    const json = generateAdvancedImportJSON(bundle);
    expect(JSON.parse(json).version).toBe(2);
  });
});

describe('generateAdvancedImportJSON — version 2 additions', () => {
  const txns = [
    makeTxn({ type: 'income', categoryId: 'salary', amount: 4500, date: '2026-06-01', merchantRaw: 'Employer Sdn Bhd' }),
    makeTxn({ type: 'expense', categoryId: 'food', amount: 500, date: '2026-06-05', merchantRaw: 'Grocer' }),
    makeTxn({ type: 'transfer', categoryId: null, amount: 200, date: '2026-06-15', merchantRaw: 'Stockbroker DCA', merchantKey: 'stockbroker-dca' }),
  ];
  const accounts = [
    makeAcct({ id: 'a1', name: 'CIMB Bank', kind: 'asset', cls: 'cash' }),
    makeAcct({ id: 'a2', name: 'S&P 500 ETF', kind: 'asset', cls: 'investments', sub: 'stock', symbol: 'VOO', ticker: 'VOO', quantity: 1.5, cost: 600 }),
  ];
  const entries = [
    makeEntry({ accountId: 'a1', value: 4800, asOf: '2026-06-30' }),
    makeEntry({ accountId: 'a2', value: 0, asOf: '2026-06-30' }),
  ];
  const period = buildReportPeriod('monthly', '2026-06');
  const bundle = buildFinancialReportBundle(txns, mockCategories, accounts, entries, period, 'Nurul');

  const commitment: Commitment = {
    id: 'c1', label: 'S&P 500 DCA', merchantKey: 'stockbroker-dca', kind: 'investment', amount: 200,
    categoryId: null, fromAccountId: 'a1', toAccountId: 'a2', dueDay: 15, startMonth: '2026-05',
    endMonth: null, archived: false, createdAt: '2026-05-01T00:00:00.000Z',
  };
  const occurrences: CommitmentOccurrence[] = [
    { id: 'o1', commitmentId: 'c1', dueDate: '2026-05-15', month: '2026-05', amount: 200, paidAmount: 200, paidOn: '2026-05-14', status: 'paid', txnId: null, txnCreated: true, unitsAdded: 1.5, priceMYR: 400, createdAt: '2026-05-01T00:00:00.000Z' },
    { id: 'o2', commitmentId: 'c1', dueDate: '2026-06-15', month: '2026-06', amount: 200, paidAmount: null, paidOn: null, status: 'scheduled', txnId: null, txnCreated: false, unitsAdded: null, priceMYR: null, createdAt: '2026-06-01T00:00:00.000Z' },
  ];

  it('keeps a transfer out of the `transactions` array and puts it in `transfers` instead', () => {
    const json = generateAdvancedImportJSON(bundle);
    const payload = JSON.parse(json);
    expect(payload.transactions).toHaveLength(2);
    expect(payload.transactions.every((t: { description: string }) => t.description !== 'Stockbroker DCA')).toBe(true);
    expect(payload.transfers).toEqual([
      expect.objectContaining({ description: 'Stockbroker DCA', amount: 200 }),
    ]);
  });

  it('a transfer round-trips through parseJSON as its own array, never as income', () => {
    const json = generateAdvancedImportJSON(bundle);
    const { transactions, transfers } = parseJSON(json);
    expect(transactions.some((t) => t.merchant === 'Stockbroker DCA')).toBe(false);
    expect(transfers).toEqual([
      expect.objectContaining({ description: 'Stockbroker DCA', amount: 200, date: '2026-06-15' }),
    ]);
  });

  it('exports quantity and cost on a holding account row', () => {
    const json = generateAdvancedImportJSON(bundle);
    const payload = JSON.parse(json);
    const holding = payload.accounts.find((a: { name: string }) => a.name === 'S&P 500 ETF');
    expect(holding).toMatchObject({ quantity: 1.5, cost: 600 });
  });

  it('quantity and cost round-trip through parseJSON', () => {
    const json = generateAdvancedImportJSON(bundle);
    const { accounts: parsedAccounts } = parseJSON(json);
    const holding = parsedAccounts.find((a) => a.name === 'S&P 500 ETF');
    expect(holding).toMatchObject({ quantity: 1.5, cost: 600 });
  });

  it('carries a commitment and its full occurrence history, resolving category/account names', () => {
    const json = generateAdvancedImportJSON(bundle, { commitments: [commitment], occurrences });
    const payload = JSON.parse(json);
    expect(payload.commitments).toEqual([
      expect.objectContaining({
        label: 'S&P 500 DCA',
        kind: 'investment',
        amount: 200,
        dueDay: 15,
        fromAccount: 'CIMB Bank',
        toAccount: 'S&P 500 ETF',
        startMonth: '2026-05',
        endMonth: null,
      }),
    ]);
    expect(payload.commitments[0].occurrences).toHaveLength(2);
    expect(payload.commitments[0].occurrences[0]).toMatchObject({ dueDate: '2026-05-15', status: 'paid', paidOn: '2026-05-14', paidAmount: 200 });
  });

  it('a commitment with its occurrence history round-trips through parseJSON', () => {
    const json = generateAdvancedImportJSON(bundle, { commitments: [commitment], occurrences });
    const { commitments: parsed } = parseJSON(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      label: 'S&P 500 DCA',
      kind: 'investment',
      amount: 200,
      dueDay: 15,
      fromAccount: 'CIMB Bank',
      toAccount: 'S&P 500 ETF',
    });
    expect(parsed[0].occurrences).toEqual([
      { dueDate: '2026-05-15', status: 'paid', paidOn: '2026-05-14', paidAmount: 200 },
      { dueDate: '2026-06-15', status: 'scheduled', paidOn: null, paidAmount: null },
    ]);
  });

  it('omitting the commitments extra produces an empty commitments array, not an error', () => {
    const json = generateAdvancedImportJSON(bundle);
    expect(JSON.parse(json).commitments).toEqual([]);
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
