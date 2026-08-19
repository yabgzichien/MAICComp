// src/lib/financialExport.ts
// Financial document export generators: Excel (.xlsx), CSV, Standalone Interactive HTML Report,
// and Printable PDF HTML. Multi-platform safe (Web and Mobile).
import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type { FinancialReportData, MonthlyTrendItem } from './bookkeeping';

export type ExportFormat = 'xlsx' | 'csv' | 'html' | 'pdf';

/** Format a number into standard MYR currency string (e.g. RM 1,234.56). */
export function formatCurrency(amount: number): string {
  const isNegative = amount < 0;
  const abs = Math.abs(amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `-RM ${abs}` : `RM ${abs}`;
}

/** Format percentage (e.g. 24.5%). */
export function formatPercent(val: number): string {
  return `${val.toFixed(1)}%`;
}

/** Clean string for CSV escaping. */
function csvEscape(val: string | number | null | undefined): string {
  if (val == null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// ---------------------------------------------------------------------------
// 1. EXCEL (.XLSX) MULTI-TAB WORKBOOK GENERATION
// ---------------------------------------------------------------------------

export function generateExcelWorkbook(data: FinancialReportData): Uint8Array {
  const wb = XLSX.utils.book_new();

  // --- SHEET 1: Income Statement ---
  const isRows: (string | number)[][] = [
    ['FINANCIAL REPORT: INCOME STATEMENT (PROFIT & LOSS)'],
    ['Name:', data.userName],
    ['Period:', data.period.label],
    ['Generated At:', data.generatedAt.slice(0, 19).replace('T', ' ')],
    ['Currency:', 'MYR (Malaysian Ringgit)'],
    [],
    ['=== REVENUES / INCOME ===', 'Amount (MYR)', '% of Total Income'],
  ];

  for (const row of data.incomeStatement.incomeRows) {
    isRows.push([row.categoryLabel, row.amount, `${row.percentage}%`]);
  }
  isRows.push(['TOTAL REVENUE / INCOME', data.incomeStatement.totalIncome, '100.0%']);
  isRows.push([]);
  isRows.push(['=== OPERATING & LIVING EXPENSES ===', 'Amount (MYR)', '% of Total Expense']);

  for (const row of data.incomeStatement.expenseRows) {
    isRows.push([row.categoryLabel, row.amount, `${row.percentage}%`]);
  }
  isRows.push(['TOTAL EXPENSES', data.incomeStatement.totalExpense, '100.0%']);
  isRows.push([]);
  isRows.push(['=== NET FINANCIAL SUMMARY ===', 'Value']);
  isRows.push(['NET INCOME / SAVINGS (Revenue - Expenses)', data.incomeStatement.netIncome]);
  isRows.push(['SAVINGS RATE (%)', `${data.incomeStatement.savingsRate}%`]);
  isRows.push(['RECORDED TRANSACTIONS COUNT', data.incomeStatement.transactionCount]);

  const wsIS = XLSX.utils.aoa_to_sheet(isRows);
  wsIS['!cols'] = [{ wch: 42 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsIS, 'Income Statement');

  // --- SHEET 2: Balance Sheet ---
  const bsRows: (string | number)[][] = [
    ['FINANCIAL REPORT: BALANCE SHEET'],
    ['Name:', data.userName],
    ['As of Date:', data.balanceSheet.asOfDate],
    ['Generated At:', data.generatedAt.slice(0, 19).replace('T', ' ')],
    ['Currency:', 'MYR (Malaysian Ringgit)'],
    [],
    ['=== ASSETS ===', 'Class', 'Value (MYR)'],
  ];

  for (const g of data.balanceSheet.assetGroups) {
    for (const item of g.items) {
      const detail = item.symbol ? ` (${item.quantity ?? ''} ${item.symbol})` : '';
      bsRows.push([`  ${item.name}${detail}`, g.clsLabel, item.value]);
    }
    bsRows.push([`SUBTOTAL ${g.clsLabel.toUpperCase()}`, '', g.total]);
  }
  bsRows.push(['TOTAL ASSETS', '', data.balanceSheet.totalAssets]);
  bsRows.push([]);
  bsRows.push(['=== LIABILITIES ===', 'Class', 'Value (MYR)']);

  for (const g of data.balanceSheet.liabilityGroups) {
    for (const item of g.items) {
      bsRows.push([`  ${item.name}`, g.clsLabel, item.value]);
    }
    bsRows.push([`SUBTOTAL ${g.clsLabel.toUpperCase()}`, '', g.total]);
  }
  bsRows.push(['TOTAL LIABILITIES', '', data.balanceSheet.totalLiabilities]);
  bsRows.push([]);
  bsRows.push(['=== OWNER EQUITY / NET POSITION ===', '', 'Value (MYR)']);
  bsRows.push(['TOTAL NET WORTH (Assets - Liabilities)', '', data.balanceSheet.netWorth]);
  bsRows.push(['RETAINED FINANCIAL VALUE', '', data.balanceSheet.retainedEarnings]);
  bsRows.push(['BALANCE CHECK', '', data.balanceSheet.balanced ? 'BALANCED (Assets = Liabilities + Equity)' : 'UNBALANCED']);

  const wsBS = XLSX.utils.aoa_to_sheet(bsRows);
  wsBS['!cols'] = [{ wch: 42 }, { wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsBS, 'Balance Sheet');

  // --- SHEET 3: Transaction Ledger ---
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  const ledgerRows: (string | number)[][] = [
    ['Date', 'Type', 'Category', 'Merchant / Payee', 'Amount (MYR)', 'Direction', 'Source', 'Remark'],
  ];

  for (const t of data.transactions) {
    const catName = (t.categoryId ? catMap.get(t.categoryId) : null) || (t.type === 'income' ? 'Income' : 'Expense');
    ledgerRows.push([
      t.date || 'N/A',
      t.type.toUpperCase(),
      catName,
      t.merchantRaw || t.merchantKey || 'N/A',
      Math.abs(t.amount),
      t.type === 'income' ? 'IN (+)' : 'OUT (-)',
      t.source,
      t.remark || '',
    ]);
  }

  const wsLedger = XLSX.utils.aoa_to_sheet(ledgerRows);
  wsLedger['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 32 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Transaction Ledger');

  // --- SHEET 4: Monthly Trends & Statistics ---
  const statsRows: (string | number)[][] = [
    ['FINANCIAL STATISTICAL ANALYSIS & MONTHLY TRENDS'],
    ['Period:', data.period.label],
    [],
    ['=== STATISTICAL METRICS ===', 'Metric Value'],
    ['Mean (Average) Monthly Income', data.statistics.meanMonthlyIncome],
    ['Median Monthly Income', data.statistics.medianMonthlyIncome],
    ['Standard Deviation (Income Volatility)', data.statistics.stdDevMonthlyIncome],
    ['Income Coefficient of Variation (CV)', data.statistics.cvMonthlyIncome],
    ['Mean (Average) Monthly Expenses', data.statistics.meanMonthlyExpense],
    ['Median Monthly Expenses', data.statistics.medianMonthlyExpense],
    ['Standard Deviation (Expense)', data.statistics.stdDevMonthlyExpense],
    ['Minimum Monthly Income', data.statistics.minMonthlyIncome],
    ['Maximum Monthly Income', data.statistics.maxMonthlyIncome],
    ['Total Income Across Period', data.statistics.totalIncome],
    ['Total Expenses Across Period', data.statistics.totalExpense],
    ['Net Period Savings', data.statistics.netSavings],
    ['Overall Period Savings Rate (%)', `${data.statistics.overallSavingsRate}%`],
    [],
    ['=== MONTHLY TIME-SERIES BREAKDOWN ==='],
    ['Month', 'Income (MYR)', 'Expenses (MYR)', 'Net Savings (MYR)', 'Savings Rate (%)', 'Month-End Net Worth (MYR)'],
  ];

  for (const m of data.statistics.monthlyTrends) {
    statsRows.push([
      m.monthKey,
      m.income,
      m.expense,
      m.netSavings,
      `${m.savingsRate}%`,
      m.netWorth,
    ]);
  }

  const wsStats = XLSX.utils.aoa_to_sheet(statsRows);
  wsStats['!cols'] = [
    { wch: 35 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStats, 'Trends & Statistics');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// 2. CSV EXPORT GENERATION
// ---------------------------------------------------------------------------

export function generateCSV(data: FinancialReportData): string {
  const lines: string[] = [];
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  // Metadata
  lines.push(`${csvEscape('FINANCIAL REPORT & BOOKKEEPING EXPORT')}`);
  lines.push(`${csvEscape('Name')},${csvEscape(data.userName)}`);
  lines.push(`${csvEscape('Period')},${csvEscape(data.period.label)}`);
  lines.push(`${csvEscape('Generated At')},${csvEscape(data.generatedAt)}`);
  lines.push(`${csvEscape('Currency')},${csvEscape('MYR')}`);
  lines.push('');

  // Summary Section
  lines.push(`${csvEscape('=== FINANCIAL SUMMARY ===')}`);
  lines.push(`${csvEscape('Total Revenue')},${data.incomeStatement.totalIncome}`);
  lines.push(`${csvEscape('Total Expenses')},${data.incomeStatement.totalExpense}`);
  lines.push(`${csvEscape('Net Income / Savings')},${data.incomeStatement.netIncome}`);
  lines.push(`${csvEscape('Savings Rate')},${csvEscape(`${data.incomeStatement.savingsRate}%`)}`);
  lines.push(`${csvEscape('Total Assets')},${data.balanceSheet.totalAssets}`);
  lines.push(`${csvEscape('Total Liabilities')},${data.balanceSheet.totalLiabilities}`);
  lines.push(`${csvEscape('Net Worth')},${data.balanceSheet.netWorth}`);
  lines.push('');

  // Statistics Section
  lines.push(`${csvEscape('=== STATISTICAL INDICATORS ===')}`);
  lines.push(`${csvEscape('Mean Monthly Income')},${data.statistics.meanMonthlyIncome}`);
  lines.push(`${csvEscape('Median Monthly Income')},${data.statistics.medianMonthlyIncome}`);
  lines.push(`${csvEscape('Income Standard Deviation')},${data.statistics.stdDevMonthlyIncome}`);
  lines.push(`${csvEscape('Mean Monthly Expenses')},${data.statistics.meanMonthlyExpense}`);
  lines.push(`${csvEscape('Median Monthly Expenses')},${data.statistics.medianMonthlyExpense}`);
  lines.push(`${csvEscape('Expense Standard Deviation')},${data.statistics.stdDevMonthlyExpense}`);
  lines.push('');

  // Income Statement
  lines.push(`${csvEscape('=== INCOME STATEMENT ===')}`);
  lines.push(`${csvEscape('Category')},${csvEscape('Type')},${csvEscape('Amount (MYR)')},${csvEscape('Share (%)')}`);
  for (const r of data.incomeStatement.incomeRows) {
    lines.push(`${csvEscape(r.categoryLabel)},${csvEscape('Revenue')},${r.amount},${csvEscape(`${r.percentage}%`)}`);
  }
  for (const r of data.incomeStatement.expenseRows) {
    lines.push(`${csvEscape(r.categoryLabel)},${csvEscape('Expense')},${r.amount},${csvEscape(`${r.percentage}%`)}`);
  }
  lines.push('');

  // Balance Sheet
  lines.push(`${csvEscape('=== BALANCE SHEET AS OF ' + data.balanceSheet.asOfDate + ' ===')}`);
  lines.push(`${csvEscape('Account')},${csvEscape('Class')},${csvEscape('Kind')},${csvEscape('Value (MYR)')}`);
  for (const g of data.balanceSheet.assetGroups) {
    for (const i of g.items) {
      lines.push(`${csvEscape(i.name)},${csvEscape(g.clsLabel)},${csvEscape('Asset')},${i.value}`);
    }
  }
  for (const g of data.balanceSheet.liabilityGroups) {
    for (const i of g.items) {
      lines.push(`${csvEscape(i.name)},${csvEscape(g.clsLabel)},${csvEscape('Liability')},${i.value}`);
    }
  }
  lines.push('');

  // Ledger Table
  lines.push(`${csvEscape('=== TRANSACTION LEDGER ===')}`);
  lines.push(`${csvEscape('Date')},${csvEscape('Type')},${csvEscape('Category')},${csvEscape('Merchant')},${csvEscape('Amount')},${csvEscape('Direction')},${csvEscape('Source')},${csvEscape('Remark')}`);

  for (const t of data.transactions) {
    const cat = (t.categoryId ? catMap.get(t.categoryId) : null) || t.type;
    lines.push([
      csvEscape(t.date || ''),
      csvEscape(t.type),
      csvEscape(cat),
      csvEscape(t.merchantRaw || t.merchantKey),
      Math.abs(t.amount),
      csvEscape(t.type === 'income' ? 'IN' : 'OUT'),
      csvEscape(t.source),
      csvEscape(t.remark || ''),
    ].join(','));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. STANDALONE INTERACTIVE HTML REPORT GENERATION WITH SVG CHARTS
// ---------------------------------------------------------------------------

export function generateHTMLReport(data: FinancialReportData): string {
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  // Generate SVG Bar Chart: Monthly Income vs Expenses
  const barChartSvg = renderMonthlyBarChartSvg(data.statistics.monthlyTrends);

  // Generate SVG Donut Chart: Expense Breakdown
  const donutChartSvg = renderExpenseDonutSvg(data.statistics.expenseCategoryBreakdown);

  // Generate SVG Area/Line Chart: Net Worth Trend
  const netWorthChartSvg = renderNetWorthTrendSvg(data.statistics.monthlyTrends);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Financial Report & Analytics - ${escapeHtml(data.userName)} - ${escapeHtml(data.period.label)}</title>
  <style>
    :root {
      --bg: #0d1310;
      --card-bg: #141c17;
      --card-border: rgba(255,255,255,0.08);
      --ink: #f0f4f1;
      --ink-dim: #8fa094;
      --ink-sub: #5c6c60;
      --accent: #22c55e;
      --accent-tint: rgba(34,197,94,0.12);
      --danger: #ef4444;
      --danger-tint: rgba(239,68,68,0.12);
      --warning: #f59e0b;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f5f7f5;
        --card-bg: #ffffff;
        --card-border: rgba(0,0,0,0.08);
        --ink: #141c17;
        --ink-dim: #5c6c60;
        --ink-sub: #8fa094;
        --accent: #15803d;
        --accent-tint: rgba(21,128,61,0.08);
        --danger: #dc2626;
        --danger-tint: rgba(220,38,38,0.08);
        --warning: #d97706;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--ink);
      line-height: 1.5;
      padding: 24px 16px;
    }
    .container { max-width: 1040px; margin: 0 auto; }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }
    .title-group h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
    .title-group p { font-size: 14px; color: var(--ink-dim); margin-top: 4px; }
    .btn-group { display: flex; gap: 8px; }
    .btn {
      background-color: var(--accent);
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .btn.secondary {
      background-color: var(--card-bg);
      color: var(--ink);
      border: 1px solid var(--card-border);
    }
    .btn:hover { opacity: 0.9; }
    .grid { display: grid; gap: 16px; margin-bottom: 24px; }
    .grid-4 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
    .kpi-title { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--ink-dim); letter-spacing: 0.05em; }
    .kpi-val { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .kpi-sub { font-size: 12px; color: var(--ink-dim); margin-top: 4px; }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--accent-tint);
      color: var(--accent);
    }
    .badge.danger { background: var(--danger-tint); color: var(--danger); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--card-border); color: var(--ink-dim); font-weight: 600; font-size: 11px; text-transform: uppercase; }
    td { padding: 9px 10px; border-bottom: 1px solid var(--card-border); }
    tr:last-child td { border-bottom: none; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
    .total-row { font-weight: 700; background: var(--accent-tint); }
    .chart-container { width: 100%; overflow-x: auto; margin-top: 10px; }
    .search-box {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--card-border);
      background: var(--bg);
      color: var(--ink);
      font-size: 13px;
      margin-bottom: 12px;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .btn-group, .search-box { display: none !important; }
      .card { border: 1px solid #ddd; break-inside: avoid; }
      :root { --card-border: #ddd; --ink: #000; --ink-dim: #555; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-group">
        <h1>Financial Statement & Bookkeeping Report</h1>
        <p>Name: <strong>${escapeHtml(data.userName)}</strong> &bull; Period: <strong>${escapeHtml(data.period.label)}</strong> &bull; As of: <strong>${escapeHtml(data.balanceSheet.asOfDate)}</strong></p>
      </div>
      <div class="btn-group">
        <button class="btn secondary" onclick="window.print()">Print / Save PDF</button>
      </div>
    </header>

    <!-- KPI STATS CARDS -->
    <div class="grid grid-4">
      <div class="card">
        <div class="kpi-title">Total Revenue</div>
        <div class="kpi-val" style="color: var(--accent);">${formatCurrency(data.incomeStatement.totalIncome)}</div>
        <div class="kpi-sub">Mean: ${formatCurrency(data.statistics.meanMonthlyIncome)}/mo</div>
      </div>
      <div class="card">
        <div class="kpi-title">Total Expenses</div>
        <div class="kpi-val" style="color: var(--danger);">${formatCurrency(data.incomeStatement.totalExpense)}</div>
        <div class="kpi-sub">Mean: ${formatCurrency(data.statistics.meanMonthlyExpense)}/mo</div>
      </div>
      <div class="card">
        <div class="kpi-title">Net Savings & Margin</div>
        <div class="kpi-val">${formatCurrency(data.incomeStatement.netIncome)}</div>
        <div class="kpi-sub">Savings Rate: <span class="badge">${data.incomeStatement.savingsRate}%</span></div>
      </div>
      <div class="card">
        <div class="kpi-title">Net Worth (Balance Sheet)</div>
        <div class="kpi-val">${formatCurrency(data.balanceSheet.netWorth)}</div>
        <div class="kpi-sub">Assets: ${formatCurrency(data.balanceSheet.totalAssets)} &bull; Liab: ${formatCurrency(data.balanceSheet.totalLiabilities)}</div>
      </div>
    </div>

    <!-- STATISTICAL DISTRIBUTION METRICS -->
    <div class="card" style="margin-bottom: 24px;">
      <h2>Statistical Indicators & Income Regularity</h2>
      <div class="grid grid-4" style="margin-top: 12px; margin-bottom: 0;">
        <div>
          <div class="kpi-sub">Income Median</div>
          <div style="font-size: 16px; font-weight: 600;">${formatCurrency(data.statistics.medianMonthlyIncome)}</div>
        </div>
        <div>
          <div class="kpi-sub">Income Std Deviation</div>
          <div style="font-size: 16px; font-weight: 600;">${formatCurrency(data.statistics.stdDevMonthlyIncome)}</div>
        </div>
        <div>
          <div class="kpi-sub">Income Volatility (CV)</div>
          <div style="font-size: 16px; font-weight: 600;">${data.statistics.cvMonthlyIncome.toFixed(2)} ${data.statistics.cvMonthlyIncome > 0.2 ? '<span class="badge danger">Irregular</span>' : '<span class="badge">Stable</span>'}</div>
        </div>
        <div>
          <div class="kpi-sub">Min / Max Monthly Income</div>
          <div style="font-size: 14px; font-weight: 600;">${formatCurrency(data.statistics.minMonthlyIncome)} &ndash; ${formatCurrency(data.statistics.maxMonthlyIncome)}</div>
        </div>
      </div>
    </div>

    <!-- CHARTS ROW -->
    <div class="grid grid-2">
      <div class="card">
        <h2>Monthly Cash Flow (Income vs Expenses)</h2>
        <div class="chart-container">${barChartSvg}</div>
      </div>
      <div class="card">
        <h2>Expense Category Distribution</h2>
        <div class="chart-container">${donutChartSvg}</div>
      </div>
    </div>

    <!-- NET WORTH TRAJECTORY -->
    <div class="card" style="margin-bottom: 24px;">
      <h2>Net Worth & Cumulative Savings Trajectory</h2>
      <div class="chart-container">${netWorthChartSvg}</div>
    </div>

    <!-- TRADITIONAL BOOKKEEPING: INCOME STATEMENT & BALANCE SHEET -->
    <div class="grid grid-2">
      <!-- INCOME STATEMENT -->
      <div class="card">
        <h2>Income Statement (P&amp;L) <span class="kpi-sub">Period Total</span></h2>
        <table>
          <thead>
            <tr><th>Revenues &amp; Inflows</th><th class="amount">Share</th><th class="amount">Amount</th></tr>
          </thead>
          <tbody>
            ${data.incomeStatement.incomeRows.map((r) => `
              <tr>
                <td>${escapeHtml(r.categoryLabel)}</td>
                <td class="amount">${r.percentage}%</td>
                <td class="amount" style="color: var(--accent);">${formatCurrency(r.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Revenue</td>
              <td class="amount">100%</td>
              <td class="amount">${formatCurrency(data.incomeStatement.totalIncome)}</td>
            </tr>
          </tbody>
        </table>

        <table style="margin-top: 18px;">
          <thead>
            <tr><th>Operating Expenses</th><th class="amount">Share</th><th class="amount">Amount</th></tr>
          </thead>
          <tbody>
            ${data.incomeStatement.expenseRows.map((r) => `
              <tr>
                <td>${escapeHtml(r.categoryLabel)}</td>
                <td class="amount">${r.percentage}%</td>
                <td class="amount" style="color: var(--danger);">${formatCurrency(r.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Expenses</td>
              <td class="amount">100%</td>
              <td class="amount">${formatCurrency(data.incomeStatement.totalExpense)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 14px; padding: 10px; background: var(--bg); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700;">Net Surplus / Profit</span>
          <span style="font-weight: 700; font-size: 16px; color: ${data.incomeStatement.netIncome >= 0 ? 'var(--accent)' : 'var(--danger)'};">${formatCurrency(data.incomeStatement.netIncome)}</span>
        </div>
      </div>

      <!-- BALANCE SHEET -->
      <div class="card">
        <h2>Balance Sheet <span class="kpi-sub">As of ${escapeHtml(data.balanceSheet.asOfDate)}</span></h2>
        <table>
          <thead>
            <tr><th>Asset Account</th><th class="amount">Class</th><th class="amount">Value</th></tr>
          </thead>
          <tbody>
            ${data.balanceSheet.assetGroups.flatMap((g) => g.items.map((i) => `
              <tr>
                <td>${escapeHtml(i.name)}</td>
                <td class="amount" style="color: var(--ink-dim);">${escapeHtml(g.clsLabel)}</td>
                <td class="amount">${formatCurrency(i.value)}</td>
              </tr>
            `)).join('')}
            <tr class="total-row">
              <td>Total Assets</td>
              <td></td>
              <td class="amount">${formatCurrency(data.balanceSheet.totalAssets)}</td>
            </tr>
          </tbody>
        </table>

        <table style="margin-top: 18px;">
          <thead>
            <tr><th>Liability Account</th><th class="amount">Class</th><th class="amount">Value</th></tr>
          </thead>
          <tbody>
            ${data.balanceSheet.liabilityGroups.flatMap((g) => g.items.map((i) => `
              <tr>
                <td>${escapeHtml(i.name)}</td>
                <td class="amount" style="color: var(--ink-dim);">${escapeHtml(g.clsLabel)}</td>
                <td class="amount">${formatCurrency(i.value)}</td>
              </tr>
            `)).join('')}
            <tr class="total-row">
              <td>Total Liabilities</td>
              <td></td>
              <td class="amount">${formatCurrency(data.balanceSheet.totalLiabilities)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 14px; padding: 10px; background: var(--bg); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700;">Owner Equity (Net Worth)</span>
          <span style="font-weight: 700; font-size: 16px;">${formatCurrency(data.balanceSheet.netWorth)}</span>
        </div>
      </div>
    </div>

    <!-- ITEMIZED TRANSACTION LEDGER -->
    <div class="card" style="margin-top: 24px;">
      <h2>Itemized Transaction Ledger <span class="badge">${data.transactions.length} Records</span></h2>
      <input type="text" id="ledgerFilter" class="search-box" placeholder="Search merchant, category, remark, or amount..." oninput="filterLedger()" />
      <table id="ledgerTable">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Merchant / Payee</th>
            <th>Remark</th>
            <th class="amount">Amount (MYR)</th>
          </tr>
        </thead>
        <tbody>
          ${data.transactions.map((t) => {
            const catLabel = (t.categoryId ? catMap.get(t.categoryId) : null) || t.type;
            return `
              <tr>
                <td>${escapeHtml(t.date || 'N/A')}</td>
                <td><span class="badge ${t.type === 'expense' ? 'danger' : ''}">${t.type.toUpperCase()}</span></td>
                <td>${escapeHtml(catLabel)}</td>
                <td><strong>${escapeHtml(t.merchantRaw || t.merchantKey || 'N/A')}</strong></td>
                <td style="color: var(--ink-dim); font-size: 12px;">${escapeHtml(t.remark || '')}</td>
                <td class="amount" style="color: ${t.type === 'income' ? 'var(--accent)' : 'var(--ink)'}; font-weight: 600;">
                  ${t.type === 'income' ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    function filterLedger() {
      const q = document.getElementById('ledgerFilter').value.toLowerCase();
      const rows = document.querySelectorAll('#ledgerTable tbody tr');
      rows.forEach(r => {
        const txt = r.textContent.toLowerCase();
        r.style.display = txt.includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 4. PRINTABLE FORMAL PDF HTML TEMPLATE
// ---------------------------------------------------------------------------

export function generatePrintablePDFHtml(data: FinancialReportData): string {
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Financial Statement - ${escapeHtml(data.userName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    body {
      font-family: 'Times New Roman', Times, serif, system-ui;
      color: #111;
      background: #fff;
      font-size: 11pt;
      line-height: 1.4;
      margin: 0;
      padding: 0;
    }
    .header {
      text-align: center;
      border-bottom: 2pt solid #111;
      padding-bottom: 8pt;
      margin-bottom: 14pt;
    }
    .header h1 {
      font-size: 16pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 4pt 0;
    }
    .header .sub {
      font-size: 10pt;
      color: #444;
      margin: 2pt 0;
    }
    .meta-grid {
      display: flex;
      justify-content: space-between;
      font-size: 9.5pt;
      margin-bottom: 14pt;
      padding: 6pt 0;
      border-bottom: 1pt solid #ccc;
    }
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1.5pt solid #222;
      padding-bottom: 2pt;
      margin-top: 14pt;
      margin-bottom: 6pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 10pt;
    }
    th {
      border-bottom: 1pt solid #222;
      padding: 4pt 2pt;
      text-align: left;
      font-size: 8.5pt;
      text-transform: uppercase;
    }
    td {
      padding: 3.5pt 2pt;
      border-bottom: 0.5pt solid #eee;
    }
    .amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: 'Courier New', Courier, monospace;
    }
    .subtotal {
      font-weight: bold;
      border-top: 1pt solid #444;
    }
    .grand-total {
      font-weight: bold;
      border-top: 1pt solid #111;
      border-bottom: 2.5pt double #111;
      background-color: #f9f9f9;
    }
    .two-col {
      display: flex;
      gap: 16pt;
      page-break-inside: avoid;
    }
    .col {
      flex: 1;
    }
    .kpi-box {
      border: 1pt solid #ccc;
      padding: 8pt;
      margin-bottom: 12pt;
      background: #fafafa;
      display: flex;
      justify-content: space-around;
      text-align: center;
      page-break-inside: avoid;
    }
    .kpi-item .label { font-size: 8pt; text-transform: uppercase; color: #555; }
    .kpi-item .val { font-size: 11pt; font-weight: bold; font-family: 'Courier New', Courier, monospace; }
    .page-break { page-break-before: always; }
    .footer {
      margin-top: 20pt;
      border-top: 1pt solid #ccc;
      padding-top: 6pt;
      font-size: 8pt;
      color: #666;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Statement of Financial Condition &amp; Operations</h1>
    <div class="sub">Traditional Double-Entry Accounting Ledger &amp; Statistics</div>
  </div>

  <div class="meta-grid">
    <div><strong>Name:</strong> ${escapeHtml(data.userName)}</div>
    <div><strong>Period:</strong> ${escapeHtml(data.period.label)}</div>
    <div><strong>As of Date:</strong> ${escapeHtml(data.balanceSheet.asOfDate)}</div>
    <div><strong>Currency:</strong> MYR (Ringgit)</div>
  </div>

  <!-- EXECUTIVE SUMMARY KPIS -->
  <div class="kpi-box">
    <div class="kpi-item">
      <div class="label">Total Revenue</div>
      <div class="val">${formatCurrency(data.incomeStatement.totalIncome)}</div>
    </div>
    <div class="kpi-item">
      <div class="label">Total Expenses</div>
      <div class="val">${formatCurrency(data.incomeStatement.totalExpense)}</div>
    </div>
    <div class="kpi-item">
      <div class="label">Net Surplus / Savings</div>
      <div class="val">${formatCurrency(data.incomeStatement.netIncome)}</div>
    </div>
    <div class="kpi-item">
      <div class="label">Net Worth Position</div>
      <div class="val">${formatCurrency(data.balanceSheet.netWorth)}</div>
    </div>
    <div class="kpi-item">
      <div class="label">Savings Margin</div>
      <div class="val">${data.incomeStatement.savingsRate}%</div>
    </div>
  </div>

  <!-- INCOME STATEMENT -->
  <div class="section-title">I. Income Statement (Statement of Profit &amp; Loss)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 50%;">Account / Category Description</th>
        <th class="amount" style="width: 20%;">Share (%)</th>
        <th class="amount" style="width: 30%;">Amount (MYR)</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="3" style="font-weight: bold; background: #f0f0f0;">Revenues &amp; Inflows</td></tr>
      ${data.incomeStatement.incomeRows.map((r) => `
        <tr>
          <td style="padding-left: 12pt;">${escapeHtml(r.categoryLabel)}</td>
          <td class="amount">${r.percentage}%</td>
          <td class="amount">${formatCurrency(r.amount)}</td>
        </tr>
      `).join('')}
      <tr class="subtotal">
        <td>TOTAL REVENUES (A)</td>
        <td class="amount">100.0%</td>
        <td class="amount">${formatCurrency(data.incomeStatement.totalIncome)}</td>
      </tr>

      <tr><td colspan="3" style="font-weight: bold; background: #f0f0f0; margin-top: 6pt;">Operating &amp; Living Expenses</td></tr>
      ${data.incomeStatement.expenseRows.map((r) => `
        <tr>
          <td style="padding-left: 12pt;">${escapeHtml(r.categoryLabel)}</td>
          <td class="amount">${r.percentage}%</td>
          <td class="amount">${formatCurrency(r.amount)}</td>
        </tr>
      `).join('')}
      <tr class="subtotal">
        <td>TOTAL EXPENSES (B)</td>
        <td class="amount">100.0%</td>
        <td class="amount">${formatCurrency(data.incomeStatement.totalExpense)}</td>
      </tr>

      <tr class="grand-total">
        <td>NET INCOME / SURPLUS FOR PERIOD (A - B)</td>
        <td class="amount">${data.incomeStatement.savingsRate}%</td>
        <td class="amount">${formatCurrency(data.incomeStatement.netIncome)}</td>
      </tr>
    </tbody>
  </table>

  <!-- BALANCE SHEET -->
  <div class="section-title" style="margin-top: 18pt;">II. Balance Sheet (Statement of Financial Position)</div>
  <div class="two-col">
    <!-- ASSETS -->
    <div class="col">
      <table>
        <thead>
          <tr><th>Assets &amp; Holdings</th><th class="amount">Value (MYR)</th></tr>
        </thead>
        <tbody>
          ${data.balanceSheet.assetGroups.map((g) => `
            <tr><td colspan="2" style="font-weight: bold; background: #f5f5f5;">${escapeHtml(g.clsLabel)}</td></tr>
            ${g.items.map((i) => `
              <tr>
                <td style="padding-left: 8pt;">${escapeHtml(i.name)}</td>
                <td class="amount">${formatCurrency(i.value)}</td>
              </tr>
            `).join('')}
          `).join('')}
          <tr class="grand-total">
            <td>TOTAL ASSETS</td>
            <td class="amount">${formatCurrency(data.balanceSheet.totalAssets)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- LIABILITIES & EQUITY -->
    <div class="col">
      <table>
        <thead>
          <tr><th>Liabilities &amp; Obligations</th><th class="amount">Value (MYR)</th></tr>
        </thead>
        <tbody>
          ${data.balanceSheet.liabilityGroups.length === 0 ? '<tr><td colspan="2">No outstanding debt recorded</td></tr>' : ''}
          ${data.balanceSheet.liabilityGroups.map((g) => `
            <tr><td colspan="2" style="font-weight: bold; background: #f5f5f5;">${escapeHtml(g.clsLabel)}</td></tr>
            ${g.items.map((i) => `
              <tr>
                <td style="padding-left: 8pt;">${escapeHtml(i.name)}</td>
                <td class="amount">${formatCurrency(i.value)}</td>
              </tr>
            `).join('')}
          `).join('')}
          <tr class="subtotal">
            <td>TOTAL LIABILITIES</td>
            <td class="amount">${formatCurrency(data.balanceSheet.totalLiabilities)}</td>
          </tr>
          <tr><td colspan="2" style="font-weight: bold; background: #f5f5f5;">Owner Equity</td></tr>
          <tr>
            <td style="padding-left: 8pt;">Net Worth Position</td>
            <td class="amount">${formatCurrency(data.balanceSheet.netWorth)}</td>
          </tr>
          <tr class="grand-total">
            <td>TOTAL LIABILITIES &amp; EQUITY</td>
            <td class="amount">${formatCurrency(data.balanceSheet.totalLiabilities + data.balanceSheet.netWorth)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- STATISTICAL ANALYSIS -->
  <div class="section-title" style="margin-top: 18pt;">III. Key Financial Statistics &amp; Regularity</div>
  <table>
    <thead>
      <tr><th>Statistical Metric</th><th class="amount">Calculated Value</th><th>Interpretation</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Mean (Average) Monthly Income</td>
        <td class="amount">${formatCurrency(data.statistics.meanMonthlyIncome)}</td>
        <td>Average monthly cash intake</td>
      </tr>
      <tr>
        <td>Median Monthly Income</td>
        <td class="amount">${formatCurrency(data.statistics.medianMonthlyIncome)}</td>
        <td>Central 50th percentile floor</td>
      </tr>
      <tr>
        <td>Income Standard Deviation</td>
        <td class="amount">${formatCurrency(data.statistics.stdDevMonthlyIncome)}</td>
        <td>Monthly earnings volatility measure</td>
      </tr>
      <tr>
        <td>Coefficient of Variation (CV)</td>
        <td class="amount">${data.statistics.cvMonthlyIncome.toFixed(2)}</td>
        <td>${data.statistics.cvMonthlyIncome > 0.2 ? 'Irregular / Gig earnings profile' : 'Highly consistent income stream'}</td>
      </tr>
      <tr>
        <td>Mean Monthly Expense</td>
        <td class="amount">${formatCurrency(data.statistics.meanMonthlyExpense)}</td>
        <td>Average living cost run-rate</td>
      </tr>
    </tbody>
  </table>

  <!-- ITEMIZED LEDGER (PAGE BREAK) -->
  <div class="page-break"></div>
  <div class="section-title">IV. Itemized Transaction Ledger (${data.transactions.length} Entries)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 14%;">Date</th>
        <th style="width: 10%;">Type</th>
        <th style="width: 22%;">Category</th>
        <th style="width: 32%;">Merchant / Counterparty</th>
        <th class="amount" style="width: 22%;">Amount (MYR)</th>
      </tr>
    </thead>
    <tbody>
      ${data.transactions.slice(0, 150).map((t) => {
        const cat = (t.categoryId ? catMap.get(t.categoryId) : null) || t.type;
        return `
          <tr>
            <td>${escapeHtml(t.date || 'N/A')}</td>
            <td>${t.type.toUpperCase()}</td>
            <td>${escapeHtml(cat)}</td>
            <td>${escapeHtml(t.merchantRaw || t.merchantKey || 'N/A')}</td>
            <td class="amount">${t.type === 'income' ? '+' : '-'}${formatCurrency(Math.abs(t.amount))}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
  ${data.transactions.length > 150 ? `<p style="font-size: 8pt; color: #777; font-style: italic;">* Displaying first 150 transactions. Complete ledger available in Excel/CSV exports.</p>` : ''}

  <div class="footer">
    <div>Generated by Pip Financial OS &bull; Confidential Personal Financial Statement</div>
    <div>Document Date: ${escapeHtml(data.generatedAt.slice(0, 10))}</div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 5. SVG CHART RENDERERS (SELF-CONTAINED, ZERO EXTERNAL DEPENDENCIES)
// ---------------------------------------------------------------------------

function renderMonthlyBarChartSvg(trends: MonthlyTrendItem[]): string {
  if (trends.length === 0) {
    return `<div style="padding: 20px; text-align: center; color: var(--ink-dim);">No monthly data in this period.</div>`;
  }
  const W = 460;
  const H = 200;
  const padL = 50;
  const padR = 15;
  const padT = 20;
  const padB = 30;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(100, ...trends.map((t) => Math.max(t.income, t.expense))) * 1.15;
  const barGroupWidth = innerW / trends.length;
  const barWidth = Math.max(4, Math.min(14, (barGroupWidth - 8) / 2));

  let barsHtml = '';
  trends.forEach((t, i) => {
    const xCenter = padL + i * barGroupWidth + barGroupWidth / 2;
    const hInc = (t.income / maxVal) * innerH;
    const yInc = padT + innerH - hInc;
    const xInc = xCenter - barWidth - 1;

    const hExp = (t.expense / maxVal) * innerH;
    const yExp = padT + innerH - hExp;
    const xExp = xCenter + 1;

    barsHtml += `
      <rect x="${xInc.toFixed(1)}" y="${yInc.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${hInc.toFixed(1)}" rx="3" fill="#22c55e" opacity="0.9">
        <title>${t.monthLabel} Income: ${formatCurrency(t.income)}</title>
      </rect>
      <rect x="${xExp.toFixed(1)}" y="${yExp.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${hExp.toFixed(1)}" rx="3" fill="#ef4444" opacity="0.85">
        <title>${t.monthLabel} Expense: ${formatCurrency(t.expense)}</title>
      </rect>
      <text x="${xCenter.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">${t.monthLabel}</text>
    `;
  });

  // Y-axis gridlines
  let gridHtml = '';
  for (let step = 0; step <= 3; step++) {
    const frac = step / 3;
    const y = padT + innerH * (1 - frac);
    const val = maxVal * frac;
    gridHtml += `
      <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3,3" />
      <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="currentColor" opacity="0.5">${Math.round(val)}</text>
    `;
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="overflow: visible;">
      ${gridHtml}
      ${barsHtml}
      <!-- Legend -->
      <circle cx="${W - 120}" cy="10" r="4" fill="#22c55e" />
      <text x="${W - 110}" y="13" font-size="9" fill="currentColor" opacity="0.8">Income</text>
      <circle cx="${W - 55}" cy="10" r="4" fill="#ef4444" />
      <text x="${W - 45}" y="13" font-size="9" fill="currentColor" opacity="0.8">Expense</text>
    </svg>
  `;
}

function renderExpenseDonutSvg(categories: { label: string; amount: number; percentage: number; hue: number }[]): string {
  if (categories.length === 0) {
    return `<div style="padding: 20px; text-align: center; color: var(--ink-dim);">No expenses in this period.</div>`;
  }
  const size = 200;
  const radius = 70;
  const strokeWidth = 24;
  const cx = 100;
  const cy = 100;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;
  const topCategories = categories.slice(0, 6);
  const total = categories.reduce((sum, c) => sum + c.amount, 0);

  let pathsHtml = '';
  let legendHtml = '';

  topCategories.forEach((c, idx) => {
    const fraction = total > 0 ? c.amount / total : 0;
    const strokeDasharray = `${(fraction * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
    const strokeDashoffset = (-accumulated * circumference).toFixed(2);
    accumulated += fraction;
    const color = `hsl(${c.hue}, 70%, 50%)`;

    pathsHtml += `
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"
        transform="rotate(-90 ${cx} ${cy})">
        <title>${c.label}: ${formatCurrency(c.amount)} (${c.percentage}%)</title>
      </circle>
    `;

    legendHtml += `
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 4px;">
        <span style="width: 10px; height: 10px; border-radius: 2px; background: ${color}; display: inline-block;"></span>
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(c.label)}</span>
        <span style="font-weight: 600;">${c.percentage}%</span>
      </div>
    `;
  });

  return `
    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
      <svg viewBox="0 0 ${size} ${size}" width="160" height="160" style="flex-shrink: 0;">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="currentColor" stroke-opacity="0.08" stroke-width="${strokeWidth}" />
        ${pathsHtml}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">Total Spent</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${formatCurrency(total)}</text>
      </svg>
      <div style="flex: 1; min-width: 160px;">${legendHtml}</div>
    </div>
  `;
}

function renderNetWorthTrendSvg(trends: MonthlyTrendItem[]): string {
  if (trends.length <= 1) {
    return `<div style="padding: 20px; text-align: center; color: var(--ink-dim);">Requires at least 2 monthly data points for trajectory.</div>`;
  }
  const W = 600;
  const H = 160;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 30;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = trends.map((t) => t.netWorth);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(100, ...values) * 1.1;
  const range = maxVal - minVal || 1;

  const points = trends.map((t, i) => {
    const x = padL + (i / (trends.length - 1)) * innerW;
    const y = padT + innerH - ((t.netWorth - minVal) / range) * innerH;
    return { x, y, val: t.netWorth, label: t.monthLabel };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  let dotsHtml = '';
  points.forEach((p) => {
    dotsHtml += `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#22c55e" stroke="var(--bg)" stroke-width="2">
        <title>${p.label}: ${formatCurrency(p.val)}</title>
      </circle>
      <text x="${p.x.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">${p.label}</text>
    `;
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
      <defs>
        <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#22c55e" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#nwGrad)" />
      <path d="${pathD}" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" />
      ${dotsHtml}
    </svg>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// 6. CROSS-PLATFORM FILE SAVE / DOWNLOAD DISPATCHER
// ---------------------------------------------------------------------------

export async function saveOrDownloadExport(
  fileName: string,
  content: string | Uint8Array,
  mimeType: string
): Promise<{ success: boolean; uri?: string; error?: string }> {
  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([content as any], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { success: true };
    } else {
      // Mobile / Native using expo-file-system modern File API
      const file = new File(Paths.cache, fileName);
      if (typeof content === 'string') {
        file.write(content);
      } else {
        file.write(content);
      }
      return { success: true, uri: file.uri };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save export file' };
  }
}
