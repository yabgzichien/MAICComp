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
  '{"passport":{"subject":"57f76abca6cc4e5c6065a681dba53f651a63a2ef71ce964837b33c80e53f1300","score":672,"band":"Good","factorSummary":[{"key":"cashflow","subScore":72},{"key":"income","subScore":65},{"key":"savings","subScore":55},{"key":"debt","subScore":88},{"key":"discipline","subScore":70},{"key":"networth","subScore":52},{"key":"track_record","subScore":40}],"provenanceSummary":"source trust 70%; Benford conformity 84%; 2% round amounts; 0% duplicates; coverage 70% of last 90 days; expenses 82% of income","evidenceHash":"abc123def456abc123def456abc123def456abc123def456abc123def456ab12","repaymentRecord":{"onTime":0,"total":0},"issuedAt":"2026-06-01T08:00:00.000Z","validUntil":"2027-06-01T08:00:00.000Z","assessment":{"confidence":0.62,"coverageRatio":0.7,"coverageDays":90,"avgIncome":2540,"avgMonthlySurplus":520,"monthlyDebtService":120},"holder":{"name":"Aisyah binti Rahman","nricMasked":"••••••-••-5678","verified":true,"provider":"Demo verification (mock)"},"momentum":{"lookbackDays":90,"scoreFrom":631,"scoreTo":672,"coverageDaysFrom":41,"coverageDaysTo":90,"direction":"rising"},"provenanceMeta":{"engineVersion":"1.1.0","policyVersion":"1.0.0","modelWeightsVersion":"1.0.0-berka9"},"digitHistogram":[71,22,18,13,20,9,8,10,7]},"signature":"aafafe5fbd3c09279789c8d98e5099dfb84d901a7d26cac2939de4f34fe9420f038fd169a93c495ef930fce4a16ee0bf641484955e1b8a47ea81651328c4fa00","issuerSignature":"b4df96e314dc4f868609cc5484ea39ff5321128db3f92bf95184766beb6448c3a2028dc5ff291bbdd7c9cfb756fa40b5f9d76ec048d2d81c883b7c8b2b05be0e"}';

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
  { label: 'Total Principal', value: 'RM 6.54M', info: 'total_principal' },
  { label: 'Loans Pooled', value: '1,000', info: 'loans_pooled' },
  { label: 'Wtd-Avg Score', value: '667', info: 'wtd_avg_score' },
  { label: 'Wtd-Avg PD', value: '14.2%', info: 'wtd_avg_pd' },
  { label: 'Expected Loss', value: '8.51%', info: 'expected_loss' },
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

// ── Capital-markets glossary ──────────────────────────────────────────────────
// Plain-language definitions plus deeper "why it matters" knowledge for each figure
// and term on the Capital Markets tab, surfaced by the "i" info buttons. Written for
// judges: every explanation ties the securitisation concept back to Pip's thesis
// (funding the informal economy safely, with deterministic, auditable structure).

export type GlossaryEntry = { term: string; short: string; body: string };

export const GLOSSARY: Record<string, GlossaryEntry> = {
  total_principal: {
    term: 'Total Principal',
    short: 'The combined face value of every micro-loan bundled into this pool.',
    body: 'Securitisation pools many small, illiquid loans into one instrument large enough for institutional money to buy. A single RM3,000 hawker loan is too small and too risky to interest a bank treasury desk; bundled into a RM6.54M pool of 1,000 such loans, the law of large numbers makes the aggregate loss rate predictable — and therefore investable.',
  },
  loans_pooled: {
    term: 'Loans Pooled',
    short: 'How many individual micro-loans back this instrument.',
    body: 'Diversification is the engine of securitisation. With 1,000 independent borrowers, any single default barely moves the pool; realised losses cluster tightly around the statistical expected loss instead of swinging wildly. More loans → more predictable losses → tranches that can be rated and priced with confidence.',
  },
  wtd_avg_score: {
    term: 'Weighted-Average Score',
    short: "The pool's average Pip credit score, weighted by loan size.",
    body: 'Each borrower carries a deterministic 300–900 Pip score. Weighting by principal (not by headcount) reflects where the money actually sits, so a few large loans cannot hide behind many tiny high-scoring ones. A 667 average sits in the "Good" band — thin-file by traditional bank standards, which is exactly the informal-economy segment Pip is built to fund safely.',
  },
  wtd_avg_pd: {
    term: 'Weighted-Average PD (Probability of Default)',
    short: 'The size-weighted chance a borrower fails to repay over the loan term.',
    body: "PD is derived from each borrower's credit band and the ML fraud / data-confidence layer, then weighted by principal. It is one of the two inputs to expected loss (the other being loss-given-default). At 14.2% this pool prices its risk openly, rather than assuming the credit-invisible are simply uncreditworthy.",
  },
  expected_loss: {
    term: 'Expected Loss',
    short: 'The share of the pool statistically expected to be lost to defaults.',
    body: 'Expected Loss ≈ PD × loss-given-default, aggregated across the pool. It is the number that sizes the protection: the tranches beneath the senior must be thick enough to absorb this loss (and a stress multiple of it) before the senior is ever touched. Here 8.51% expected loss is covered several times over by the 28% of the stack sitting below the senior tranche.',
  },
  senior: {
    term: 'Senior Tranche',
    short: 'Paid first, loses last — the safest slice, lowest yield, highest rating.',
    body: 'In the loss waterfall, cash flows fill the senior tranche first and losses reach it last, only after every junior tranche beneath it is wiped out. That subordination (28% of the pool here) is what earns it an investment-grade "A" and its lower profit rate: safety is bought with yield. This is the slice a pension fund or bank treasury would hold.',
  },
  mezzanine: {
    term: 'Mezzanine Tranche',
    short: 'The middle slice — takes losses after the equity, before the senior.',
    body: 'Mezzanine sits between the first-loss equity and the protected senior. It only absorbs losses once the subordinated tranche is exhausted, so it carries more risk than senior and less than equity — reflected in its "BB" rating and a higher 13.5% profit rate. It is the classic risk/return middle ground for yield-seeking credit investors.',
  },
  subordinated: {
    term: 'Subordinated (First-Loss) Tranche',
    short: 'Absorbs losses first — highest risk, highest return, protects everyone above.',
    body: "Also called the equity or first-loss piece, this tranche takes the very first ringgit of losses, shielding the mezzanine and senior above it. Because it is most exposed it earns the highest profit rate (19%) and carries no credit rating (\"Equity\"). Originators often retain this slice to keep \"skin in the game\", aligning their incentives with investors'.",
  },
  size: {
    term: 'Tranche Size',
    short: 'The ringgit principal allocated to this slice of the pool.',
    body: "Size = the tranche's percentage share × the pool's total principal. The relative thickness of each tranche is what creates the protection: the thicker the junior tranches beneath a slice, the more losses must occur before that slice is touched.",
  },
  slice: {
    term: 'Slice (%)',
    short: "This tranche's share of the total pool.",
    body: 'The stack is cut 72% senior / 16% mezzanine / 12% subordinated. The 28% sitting below the senior is its loss-absorbing buffer — every point of it must be consumed before a senior investor loses a single ringgit.',
  },
  profit_rate: {
    term: 'Profit Rate p.a.',
    short: 'The annual return to investors in this tranche — profit-sharing, not interest.',
    body: 'To stay Shariah-compliant, returns are structured as profit-sharing on the underlying financing rather than riba (interest). Rates rise as you move down the stack (8.5% → 13.5% → 19%) because investors are paid more for standing closer to the first loss. The spread between tranches is the price of risk.',
  },
  rating: {
    term: 'Tranche Rating',
    short: "A creditworthiness grade computed deterministically from the pool's expected loss.",
    body: 'These ratings are not marketing labels — each is calculated from the tranche\'s loss-coverage multiple (how many times over its subordination can absorb the pool\'s expected loss). A weaker pool is honestly downgraded, not rubber-stamped AAA. That is the discipline whose absence made mispriced ratings so damaging in 2008, here applied deterministically and auditably.',
  },
  waterfall: {
    term: 'Loss Waterfall',
    short: 'The fixed priority order in which losses flow through the tranches.',
    body: 'Losses cascade bottom-up — subordinated first, then mezzanine, then senior last — while cash flows fill top-down in the reverse order. This strict priority is what lets one pool serve very different investors from the same underlying micro-loans: safety-seekers buy the senior, yield-seekers buy the first-loss equity.',
  },
};
