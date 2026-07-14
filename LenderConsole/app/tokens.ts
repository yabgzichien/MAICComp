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

// A real, pre-signed sample passport (mirrors PipComp/src/data/samplePassport.ts) 
// it verifies against the pinned issuer key so "Load sample" exercises the real path.
export const SAMPLE_CODE =
  '{"passport":{"subject":"df82e6634bd02ce7dcdb944ccd0387c855fe304e9448f90b3a73b305d314297d","score":672,"band":"Good","factorSummary":[{"key":"cashflow","subScore":72},{"key":"income","subScore":65},{"key":"savings","subScore":55},{"key":"debt","subScore":88},{"key":"discipline","subScore":70},{"key":"networth","subScore":52},{"key":"track_record","subScore":40}],"provenanceSummary":"source trust 70%; Benford conformity 84%; 2% round amounts; 0% duplicates; coverage 70% of last 90 days; expenses 82% of income","evidenceHash":"abc123def456abc123def456abc123def456abc123def456abc123def456ab12","repaymentRecord":{"onTime":0,"total":0},"issuedAt":"2026-06-01T08:00:00.000Z","validUntil":"2027-06-01T08:00:00.000Z","assessment":{"confidence":0.62,"coverageRatio":0.7,"coverageDays":90,"avgIncome":2540,"avgMonthlySurplus":520,"monthlyDebtService":120},"holder":{"name":"Aisyah binti Rahman","nricMasked":"••••••-••-5678","verified":true,"provider":"Demo verification (mock)"},"incomeQuality":{"variationCoefficient":0.18,"sourceCount":1,"regularityRatio":0.83,"seasonal":false},"occupation":{"occupation":"Ride-hailing driver","sector":"Transport","employmentType":"gig","tenureMonths":22,"selfDeclared":true},"spendingProfile":{"essentialsRatio":0.68,"expenseVolatility":0.15,"bufferDays":9,"savingsRate":0.2,"obligations":[{"label":"TNB Electric","kind":"utilities","monthlyAmount":70,"monthsObserved":3},{"label":"Unifi Fibre","kind":"utilities","monthlyAmount":50,"monthsObserved":3}]},"momentum":{"lookbackDays":90,"scoreFrom":631,"scoreTo":672,"coverageDaysFrom":41,"coverageDaysTo":90,"direction":"rising"},"provenanceMeta":{"engineVersion":"1.1.0","policyVersion":"1.0.0","modelWeightsVersion":"1.0.0-berka9"},"digitHistogram":[71,22,18,13,20,9,8,10,7],"consent":[{"tier":0,"scope":["score","factors","confidence","coverage","income","surplus","debtService","repayment","momentum","digitHistogram","provenance","evidence","versions","incomeQuality"],"grantedAt":"2026-06-01T08:00:00.000Z","expiresAt":"2027-06-01T08:00:00.000Z"},{"tier":1,"scope":["holderName","holderNric","holderProvider","occupation","employment"],"grantedAt":"2026-06-01T08:00:00.000Z","expiresAt":"2027-06-01T08:00:00.000Z"},{"tier":2,"scope":["essentialsRatio","expenseVolatility","bufferDays","savingsRate","obligations"],"grantedAt":"2026-06-01T08:00:00.000Z","expiresAt":"2027-06-01T08:00:00.000Z"}]},"signature":"7da904d22e6df7ce706ddd1e2bf3294238cc8e94124d1b31dc7b16caa7603462ad1c7b279a97ff6ffef617064a0a09d25d02eda670b54480709453e0be883d0b","issuerSignature":"54fc69b31ba75916b9c5a347320b776d4f409ffd94eb8b99a258876dc6385b64f56cfdc6246e198f22654c0246fd20c163046e746091ae69052efefaaf5dbf09"}';

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

/** Leading-digit counts for the staged fraud-demo screen (Brief K): round-number
 *  fabrication clusters on 5s and 8s (RM500/RM800-style amounts), so the observed
 *  bars visibly break Benford's curve. Illustrative, like the rest of the alert demo. */
export const SUSPECT_HISTOGRAM = [4, 2, 2, 1, 34, 2, 1, 38, 3];

// The Capital Markets pool summary + tranche cards are computed live from structurePool
// (Brief Q) via lib/poolView.ts  the old static POOL_STATS / TRANCHES constants were
// removed. The glossary below still backs the "i" info buttons on that tab.

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
    body: 'Securitisation pools many small, illiquid loans into one instrument large enough for institutional money to buy. A single RM3,000 hawker loan is too small and too risky to interest a bank treasury desk; bundled into a RM6.54M pool of 1,000 such loans, the law of large numbers makes the aggregate loss rate predictable, and therefore investable.',
  },
  loans_pooled: {
    term: 'Loans Pooled',
    short: 'How many individual micro-loans back this instrument.',
    body: 'Diversification is the engine of securitisation. With 1,000 independent borrowers, any single default barely moves the pool; realised losses cluster tightly around the statistical expected loss instead of swinging wildly. More loans → more predictable losses → tranches that can be rated and priced with confidence.',
  },
  wtd_avg_score: {
    term: 'Weighted-Average Score',
    short: "The pool's average Pip credit score, weighted by loan size.",
    body: 'Each borrower carries a deterministic 300–900 Pip score. Weighting by principal (not by headcount) reflects where the money actually sits, so a few large loans cannot hide behind many tiny high-scoring ones. A 667 average sits in the "Good" band, thin-file by traditional bank standards, which is exactly the informal-economy segment Pip is built to fund safely.',
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
    short: 'Paid first, loses last. The safest slice, lowest yield, highest rating.',
    body: 'In the loss waterfall, cash flows fill the senior tranche first and losses reach it last, only after every junior tranche beneath it is wiped out. That subordination (28% of the pool here) is what earns it an investment-grade "A" and its lower profit rate: safety is bought with yield. This is the slice a pension fund or bank treasury would hold.',
  },
  mezzanine: {
    term: 'Mezzanine Tranche',
    short: 'The middle slice: takes losses after the equity, before the senior.',
    body: 'Mezzanine sits between the first-loss equity and the protected senior. It only absorbs losses once the subordinated tranche is exhausted, so it carries more risk than senior and less than equity, reflected in its "BB" rating and a higher 13.5% profit rate. It is the classic risk/return middle ground for yield-seeking credit investors.',
  },
  subordinated: {
    term: 'Subordinated (First-Loss) Tranche',
    short: 'Absorbs losses first: highest risk, highest return, protects everyone above.',
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
    body: 'The stack is cut 72% senior / 16% mezzanine / 12% subordinated. The 28% sitting below the senior is its loss-absorbing buffer. Every point of it must be consumed before a senior investor loses a single ringgit.',
  },
  profit_rate: {
    term: 'Profit Rate p.a.',
    short: 'The annual return to investors in this tranche. Profit-sharing, not interest.',
    body: 'To stay Shariah-compliant, returns are structured as profit-sharing on the underlying financing rather than riba (interest). Rates rise as you move down the stack (8.5% → 13.5% → 19%) because investors are paid more for standing closer to the first loss. The spread between tranches is the price of risk.',
  },
  rating: {
    term: 'Tranche Rating',
    short: "A creditworthiness grade computed deterministically from the pool's expected loss.",
    body: 'These ratings are not marketing labels. Each is calculated from the tranche\'s loss-coverage multiple (how many times over its subordination can absorb the pool\'s expected loss). A weaker pool is honestly downgraded, not rubber-stamped AAA. That is the discipline whose absence made mispriced ratings so damaging in 2008, here applied deterministically and auditably.',
  },
  waterfall: {
    term: 'Loss Waterfall',
    short: 'The fixed priority order in which losses flow through the tranches.',
    body: 'Losses cascade bottom-up (subordinated first, then mezzanine, then senior last) while cash flows fill top-down in the reverse order. This strict priority is what lets one pool serve very different investors from the same underlying micro-loans: safety-seekers buy the senior, yield-seekers buy the first-loss equity.',
  },
  headroom: {
    term: 'Affordability Headroom',
    short: 'One month of income, split into debt service, the proposed installment, and what is left over.',
    body: "The bar is the borrower's monthly income. Two dashed caps mark the policy limits: total debt service can't cross one line, and surplus after all obligations can't cross the other. The installment segment must land inside both, or the engine won't offer it.",
  },
  benford: {
    term: "Benford's Law Check",
    short: 'Compares the leading digits of reported amounts to the distribution real transaction data naturally follows.',
    body: "Genuine transaction amounts follow a predictable curve of leading digits (about 30% start with 1, only ~5% with 9). Fabricated figures, typed or rounded by a person, don't  they cluster unnaturally. The chart runs on the passport's signed aggregate digit counts, never raw transactions.",
  },
};
