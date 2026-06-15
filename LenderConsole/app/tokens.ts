// Design tokens for the Pip Credit lender console, ported from the approved
// Claude Design mockups. Two palettes: the normal green console and the red
// "data integrity alert" console shown when the ML fraud model flags input.

export const FONT = {
  ui: 'var(--font-ui), sans-serif',
  num: 'var(--font-num), sans-serif',
  mono: 'var(--font-mono), monospace',
};

export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  primary: string;
  accentInk: string;
  accentSoft: string;
  accentTint: string;
  ink1: string;
  ink2: string;
  ink3: string;
  hairline: string;
  amber: string;
  red: string;
  green: string;
  shadow: string;
};

const CLEAN: Palette = {
  bg: '#eef1ee',
  surface: '#ffffff',
  surface2: '#f6f8f6',
  primary: '#1f8a5b',
  accentInk: '#1c6b48',
  accentSoft: '#dbece5',
  accentTint: '#eff7f4',
  ink1: '#16201b',
  ink2: '#5d6b63',
  ink3: '#9aa7a0',
  hairline: 'rgba(20,40,30,0.08)',
  amber: '#d98a00',
  red: '#c0392b',
  green: '#1f8a5b',
  shadow: '0 2px 10px rgba(16,32,24,0.09)',
};

const ALERT: Palette = {
  bg: '#fdf0f0',
  surface: '#ffffff',
  surface2: '#fdf6f6',
  primary: '#c0392b',
  accentInk: '#922b21',
  accentSoft: '#f5c6c2',
  accentTint: '#fff0ef',
  ink1: '#1e1210',
  ink2: '#6b4f4a',
  ink3: '#a8908d',
  hairline: 'rgba(192,57,43,0.12)',
  amber: '#d98a00',
  red: '#c0392b',
  green: '#1f8a5b',
  shadow: '0 2px 10px rgba(120,20,10,0.10)',
};

export const palette = (alert: boolean): Palette => (alert ? ALERT : CLEAN);

// ── Sample data (mirrors the borrower app's sample passport / pool) ───────────

// A real, pre-signed sample passport (mirrors PipComp/src/data/samplePassport.ts) —
// it verifies against the pinned issuer key so "Load sample" exercises the real path.
export const SAMPLE_CODE =
  '{"passport":{"subject":"1e503a132a9cf38bf42dbbc170166ab3ba8a476daee6a77bde67793d31785759","score":672,"band":"Good","factorSummary":[{"key":"cashflow","subScore":72},{"key":"income","subScore":65},{"key":"savings","subScore":55},{"key":"debt","subScore":88},{"key":"discipline","subScore":70},{"key":"networth","subScore":52},{"key":"track_record","subScore":40}],"provenanceSummary":"source trust 70%; Benford conformity 83%; 2% round amounts; 0% duplicates; coverage 70% of last 90 days; expenses 82% of income","evidenceHash":"abc123def456abc123def456abc123def456abc123def456abc123def456ab12","repaymentRecord":{"onTime":0,"total":0},"issuedAt":"2026-06-09T08:00:00.000Z","validUntil":"2026-07-09T08:00:00.000Z","assessment":{"confidence":0.62,"coverageRatio":0.7,"coverageDays":90,"avgIncome":2540,"avgMonthlySurplus":520,"monthlyDebtService":120},"holder":{"name":"Aisyah binti Rahman","nricMasked":"••••••-••-5678","verified":true,"provider":"Demo verification (mock)"}},"signature":"b5dbaa98aef9ba92a3787f89a795a6682a7891a2313f76b1300559aa427917c38448e57b78c232e76e128a3284b418091e13370554ac7eeddd226f2acadabe09","issuerSignature":"feef569d8948f7945f6102cf08ef3bc1d578f84f98a5ebddea905ec9182c9905f2aef47dd46b034e7e6682f8b536c11acf63f445f780d958d7d4b1ceceaee801"}';

/** Map passport factor keys → human labels for the breakdown table. */
export const FACTOR_LABELS: Record<string, string> = {
  cashflow: 'Cash-flow surplus',
  income: 'Income regularity',
  savings: 'Savings rate',
  debt: 'Debt burden (DSR)',
  discipline: 'Budgeting discipline',
  networth: 'Net-worth trajectory',
  track_record: 'Track record',
};

/** Score-band order (low → high) for the 5-segment band bar. */
export const BAND_ORDER = ['Building', 'Fair', 'Good', 'Strong', 'Excellent'];

export const SUSPECT_CODE = `v1.4d8f1b3e:eyJhbGciOiJFZERTQSJ9
.eyJzdWIiOiJ1c2VyX3Vua25vd24iLCJz
Y29yZSI6NzEwLCJiYW5kIjoiR29vZCIs
ImNvbmZpZGVuY2UiOjAuMjgsInNvdXJj
ZSI6Im1hbnVhbF9vbmx5IiwiZmxhZ3Mi
OlsiYmVuZm9yZF9mYWlsIiwicm91bmRf
bnVtYmVycyJdfQ.INVALID_SIG_MISMATCH`;

export const ALERT_FACTORS = [
  { label: 'Cash-flow surplus', score: 22 },
  { label: 'Income regularity', score: 18 },
  { label: 'Savings rate', score: 31 },
  { label: 'Debt burden (DSR)', score: 15 },
  { label: 'Budgeting discipline', score: 28 },
  { label: 'Net-worth trajectory', score: 20 },
  { label: 'Track record', score: 12 },
];

export const AUDIT_REFER = [
  'Data confidence 28% is below the 50% auto-approval threshold → routed to manual review.',
  'Forensic flags attached for the reviewer.',
];

export const FORENSIC_FLAGS = [
  { label: 'ML fraud probability', value: '95%', sev: 'Critical', critical: true },
  { label: 'Round-number ratio', value: '95% of amounts', sev: 'Critical', critical: true },
  { label: "Benford's Law deviation", value: 'χ² = 48.3 · p < 0.001', sev: 'Critical', critical: true },
  { label: 'Top ML signal', value: 'amount uniformity', sev: 'Fraud signal', critical: false },
];

export const POOL_STATS = [
  { label: 'Total Principal', value: 'RM 6.54M' },
  { label: 'Loans Pooled', value: '1,000' },
  { label: 'Wtd-Avg Score', value: '667' },
  { label: 'Wtd-Avg PD', value: '14.2%' },
  { label: 'Expected Loss', value: '8.51%' },
];

export const TRANCHES = [
  {
    name: 'SENIOR',
    rating: 'A',
    ratingColor: '#1f8a5b',
    ratingBg: '#dbece5',
    color: '#1f8a5b',
    tint: '#eff7f4',
    border: '#dbece5',
    pct: 72,
    size: 'RM 4.71M',
    profit: '8.5%',
    reason: '3.3× expected-loss coverage beneath it → A.',
  },
  {
    name: 'MEZZANINE',
    rating: 'BB',
    ratingColor: '#d98a00',
    ratingBg: '#fdf3dc',
    color: '#d98a00',
    tint: '#fffcf2',
    border: '#f5d990',
    pct: 16,
    size: 'RM 1.05M',
    profit: '13.5%',
    reason: '1.4× coverage → BB.',
  },
  {
    name: 'SUBORDINATED',
    rating: 'Equity',
    ratingColor: '#c0392b',
    ratingBg: '#fde8e8',
    color: '#c0392b',
    tint: '#fff8f8',
    border: '#f5c6c6',
    pct: 12,
    size: 'RM 784K',
    profit: '19.0%',
    reason: 'First-loss equity.',
  },
];
