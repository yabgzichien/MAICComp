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

export const SAMPLE_CODE = `v1.7f3a9c2b:eyJhbGciOiJFZERTQSJ9
.eyJzdWIiOiJhaXN5YWhfbTQ3MiIsInNj
b3JlIjo2NzIsImJhbmQiOiJHb29kIiwi
Y29uZmlkZW5jZSI6MC42NSwiZXZpZGVu
Y2VIYXNoIjoiN2EzYjljMmQ0ZTVmNjc4
OWFiY2RlZjEyMzQ1NjcifQ.mK7xNqBp
WvZrCsYtHnUoFdgXiQjKwPb8Rf2Sy4Ez`;

export const SUSPECT_CODE = `v1.4d8f1b3e:eyJhbGciOiJFZERTQSJ9
.eyJzdWIiOiJ1c2VyX3Vua25vd24iLCJz
Y29yZSI6NzEwLCJiYW5kIjoiR29vZCIs
ImNvbmZpZGVuY2UiOjAuMjgsInNvdXJj
ZSI6Im1hbnVhbF9vbmx5IiwiZmxhZ3Mi
OlsiYmVuZm9yZF9mYWlsIiwicm91bmRf
bnVtYmVycyJdfQ.INVALID_SIG_MISMATCH`;

export const FACTORS = [
  { label: 'Cash-flow surplus', score: 70 },
  { label: 'Income regularity', score: 82 },
  { label: 'Savings rate', score: 45 },
  { label: 'Debt burden (DSR)', score: 60 },
  { label: 'Budgeting discipline', score: 75 },
  { label: 'Net-worth trajectory', score: 55 },
  { label: 'Track record', score: 50 },
];

export const ALERT_FACTORS = [
  { label: 'Cash-flow surplus', score: 22 },
  { label: 'Income regularity', score: 18 },
  { label: 'Savings rate', score: 31 },
  { label: 'Debt burden (DSR)', score: 15 },
  { label: 'Budgeting discipline', score: 28 },
  { label: 'Net-worth trajectory', score: 20 },
  { label: 'Track record', score: 12 },
];

export const AUDIT_APPROVE = [
  'Qualifies for "Growth Capital" tier (score 672 ≥ 620).',
  'Installment capped to 35% of surplus + DSR ≤ 40%.',
  'Offered RM8,000 vs RM10,000 requested (affordability).',
  'Auto-approved: score, affordability & 65% data confidence clear policy.',
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
