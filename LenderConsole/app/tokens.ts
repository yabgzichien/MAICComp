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
  ink3: '#6a776f', // AA on white (4.69:1) — was #9aa7a0 (2.50:1, sub-AA)
  hairline: 'rgba(20,40,30,0.08)',
  amber: '#9c6300', // AA on white (5.00:1) — was #d98a00 (2.77:1, sub-AA)
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
  ink3: '#84706b', // AA on white (4.66:1) — was #a8908d (2.98:1, sub-AA)
  hairline: 'rgba(192,57,43,0.12)',
  amber: '#9c6300', // AA on white (5.00:1) — was #d98a00 (2.77:1, sub-AA)
  red: '#c0392b',
  green: '#1f8a5b',
  shadow: '0 2px 10px rgba(120,20,10,0.10)',
};

export const palette = (alert: boolean): Palette => (alert ? ALERT : CLEAN);

// ── Sample data (mirrors the borrower app's sample passport / pool) ───────────

// A real, pre-signed sample passport. Regenerate with PipComp's
// tools/demoPassport/generate.js, which prints this line paste-ready
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
  { label: "Benford's Law deviation", value: "Doesn't match natural patterns (χ² 48.3, p<0.001)", sev: 'Critical', critical: true },
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
    body: 'Pooling works because the borrowers are independent of one another. With 1,000 of them, any single default barely moves the pool, and realised losses cluster tightly around the statistical expected loss instead of swinging wildly. The more loans in the pool, the more predictable the losses, and the more confidently each tranche can be rated and priced.',
  },
  wtd_avg_score: {
    term: 'Weighted-Average Score',
    short: "The pool's average Pip credit score, weighted by loan size.",
    body: 'Each borrower carries a deterministic 300–900 Pip score. Weighting by principal (not by headcount) reflects where the money actually sits, so a few large loans cannot hide behind many tiny high-scoring ones. A 667 average sits in the "Good" band, thin-file by traditional bank standards, which is the informal-economy segment Pip is built for.',
  },
  wtd_avg_pd: {
    term: 'Weighted-Average PD (Probability of Default)',
    short: 'The size-weighted chance a borrower fails to repay over the loan term.',
    body: "PD is derived from each borrower's credit band and the ML fraud / data-confidence layer, then weighted by principal. It is one of the two inputs to expected loss (the other being loss-given-default). This pool puts its risk at 14.2% and prices against that figure, instead of treating credit-invisible borrowers as unlendable by default.",
  },
  expected_loss: {
    term: 'Expected Loss',
    short: 'The share of the pool statistically expected to be lost to defaults.',
    body: 'Expected Loss ≈ PD × loss-given-default, aggregated across the pool. It is the number that sizes the protection: the tranches beneath the senior must be thick enough to absorb this loss (and a stress multiple of it) before the senior is ever touched. Here 8.51% expected loss is covered several times over by the 28% of the stack sitting below the senior tranche.',
  },
  senior: {
    term: 'Senior Tranche',
    short: 'Paid first, loses last. The safest slice, lowest yield, highest rating.',
    body: 'In the loss waterfall, cash flows fill the senior tranche first and losses reach it last, only after every junior tranche beneath it is wiped out. That subordination (28% of the pool here) is what earns it an investment-grade "A" and its lower profit rate, because you pay for the safety in yield. This is the slice a pension fund or bank treasury would hold.',
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
    body: 'To stay Shariah-compliant, returns are structured as profit-sharing on the underlying financing rather than riba (interest). Rates rise as you move down the stack (8.5% → 13.5% → 19%) because investors are paid more for standing closer to the first loss. The gap between tranches is what that extra exposure costs.',
  },
  rating: {
    term: 'Tranche Rating',
    short: "A creditworthiness grade computed deterministically from the pool's expected loss.",
    body: 'Each rating is calculated from the tranche\'s loss-coverage multiple: how many times over its subordination can absorb the pool\'s expected loss. A weaker pool comes out downgraded rather than stamped AAA. Mispriced ratings did enormous damage in 2008, so the arithmetic here is fixed and auditable.',
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
  repayment_share: {
    term: 'Repayment ÷ Net Cash Flow',
    short: 'The monthly repayment as a share of what is actually left over each month after expenses.',
    body: "Net cash flow (surplus) is income minus everything the applicant already spends, so this ratio asks the question a debt-service ratio can't: of the money genuinely free at month end, how much would the new installment take? An installment can sit comfortably inside a DSR limit and still swallow most of a thin surplus, which is how a borrower ends up current on paper and one bad week from missing a payment. The cap marked on the track is the lender's own ceiling on this ratio, editable on the Policy tab. On a declined file the figure shown is what the tier's smallest loan would have demanded, since no installment was offered.",
  },
  affordability_check: {
    term: 'Affordability Check',
    short: 'Whether this file can service any installment large enough to reach the tier it qualifies for.',
    body: "Two independent caps limit the installment: it can't exceed a set share of average monthly surplus, and total debt service (existing obligations plus the new installment) can't exceed a set share of income. The tighter of the two decides the room. That room is then converted into a principal at the tier's rate and tenor: if the result falls below the tier's minimum loan amount, there is no amount in that tier the applicant can afford, and the engine declines rather than offering something unaffordable. Both caps are lender-owned and editable on the Policy tab.",
  },
  benford: {
    term: "Benford's Law Check",
    short: 'Compares the leading digits of reported amounts to the distribution real transaction data naturally follows.',
    body: "Genuine transaction amounts follow a predictable curve of leading digits (about 30% start with 1, only ~5% with 9). Fabricated figures, typed or rounded by a person, cluster unnaturally instead. The chart runs on the passport's signed aggregate digit counts, not on raw transactions.",
  },

  // ── Portfolio repayment performance (2026-07-18 design) ─────────────────────
  collection_rate: {
    term: 'Collection Rate',
    short: 'Of everything due so far, the share actually collected.',
    body: "Collection rate = amount collected ÷ amount due to date, across every instalment that has come due on the approved book. It is the closest thing to ground truth on whether the score's affordability call was right: a score that only looks good on paper but collects poorly would show up here first.",
  },
  on_time_rate: {
    term: 'On-Time Rate',
    short: 'Of instalments actually paid, the share paid on their due date.',
    body: 'On-time rate looks only at recorded repayment events (not instalments still pending), so it measures payment behaviour directly rather than mixing in loans that simply have not come due yet. A band with a high score but a low on-time rate is an early signal the score is not weighting something it should.',
  },
  realized_loss: {
    term: 'Realized Loss (vs Expected)',
    short: 'What has actually been missed so far, compared with what the risk model predicted upfront.',
    body: "Expected loss (PD × loss-given-default) is a prediction made at underwriting. Realized loss is what has actually failed to collect since. Comparing the two, band by band, is the validation loop: it is how a lender checks whether the credit score actually predicts anything.",
  },
  interest_collected: {
    term: 'Interest Collected',
    short: 'Of everything collected so far, the portion that is profit rather than principal returning.',
    body: 'Each instalment repays a slice of principal and a slice of interest. This figure nets out the principal share (assumed to reduce in a straight line with instalments paid) from total collections, leaving the interest actually earned to date. That is the portfolio economics behind the risk numbers.',
  },
  cohort: {
    term: 'Cohort (by Credit Band)',
    short: 'Every approved loan in the same credit band, grouped for comparison.',
    body: "Performance is reported per band, not per borrower: a single borrower's repayment story says little, but a band-level pattern across many loans is statistically meaningful and is the honest unit for judging whether the score is calibrated. A cohort under 3 loans is marked as a small sample rather than shown as an authoritative rate.",
  },
  delinquent: {
    term: 'Current / Late / Delinquent',
    short: 'How far behind schedule a loan is, if at all.',
    body: 'Current: paid up to date. Late: exactly one instalment behind. Delinquent: two or more instalments behind, or any instalment missed outright. A missed payment marks a loan delinquent even if the borrower catches up on later instalments, since a default event does not un-happen.',
  },
  fully_repaid: {
    term: 'Fully Repaid',
    short: 'Loans that finished their entire repayment schedule, and what came back.',
    body: 'A loan settles once every instalment on its schedule has been paid. Because a single missed instalment permanently blocks a loan from ever reaching that state, a settled loan’s realized loss is always zero. That is the strongest evidence the validation loop can offer, because it is principal that has actually come back rather than a forecast about it. Settled loans stop counting toward live exposure elsewhere on this tab (the money is no longer at risk) but stay in this figure, since it is exactly where they matter most.',
  },
  median: {
    term: 'Median',
    short: 'The middle value once every loan is sorted low to high.',
    body: "Unlike the mean, the median is not pulled around by one or two outlier loans. A single RM20,000 Scale-tier loan barely moves it, but can drag the mean well above what a typical borrower actually received. Reporting both side by side, with the gap between them, is itself informative: a mean far above the median means a few large loans are driving the average rather than the book's typical borrower.",
  },
  standard_deviation: {
    term: 'Standard Deviation (σ)',
    short: 'How spread out the values are around the mean, in the same units as the figure itself.',
    body: "A small σ means the book is homogeneous (every borrower looks similar); a large σ means the book spans very different borrowers. Reported here rather than variance, which squares the units (RM² for loan amounts is not a readable number), so the spread can be compared directly against the mean it sits beside.",
  },
  distribution_strip: {
    term: 'Distribution Strip',
    short: "A compact min-to-max bar for each figure, marking where the median and mean fall.",
    body: 'The bar itself spans the smallest to the largest value in the book. The thin tick marks the median; the filled dot marks the mean. When the two markers sit close together the book is evenly spread; when they diverge, a few loans at one end are pulling the mean away from what is typical.',
  },
  repayment_standing: {
    term: 'Repayment Standing',
    short: "The applicant's current arrears state and repayment history, re-derived from the ledger.",
    body: "Standing is computed from the same repayment schedule this console tracks for every disbursed loan, not reported by the applicant. Access follows progressive-lending practice: one month behind still refers for review, two months loses the loyalty discount and caps the eligible tier, three or more declines new applications until cleared. Paying down arrears restores access the same day, though the event itself stays visible for 12 months. That mirrors how Malaysia's CCRIS (Bank Negara's credit reference system) reports a borrower's payment conduct. This console doesn't integrate with CCRIS, but a licensed lender using it in production would report through it, which is what CTOS-type scores actually read from.",
  },

  // ── Console declutter pass (2026-08-03): explanatory text moved off the working screens ──
  stacking_registry: {
    term: 'Stacking Check Scope',
    short: "This console's stacking check only sees its own presentment log.",
    body: 'A production deployment shares presentment history across lenders via a registry, so a borrower presenting the same passport to several lenders would be caught everywhere. Here the check is local to this console: it catches repeat presentments to this lender only.',
  },
  occupation_self_declared: {
    term: 'Self-Declared Occupation',
    short: 'Occupation is self-declared, not verified against any registry.',
    body: "This is Tier 1 context the applicant typed in, not a figure the passport's aggregates prove. Weigh it alongside the verified score and factor figures rather than as fact on its own.",
  },
  evidenced_debt_service: {
    term: 'Evidenced Debt Service',
    short: 'The evidenced monthly debt-service figure sums these detected recurring outflows.',
    body: 'Each row above is a recurring obligation the spending-profile analysis found in the transaction pattern itself, not one the applicant reported. Their total is what feeds the DSR (debt-service ratio) figure elsewhere in the decision.',
  },
  ai_panel_advisory: {
    term: 'AI Assessment Panel Scope',
    short: "The panel is advisory only. It can flag caution but can't approve, decline, or change the amount.",
    body: 'Every verdict and confidence score the panel shows is computed deterministically from the same passport aggregates the policy engine itself reads. An LLM may narrate a verdict into a sentence, but never sets the verdict, and nothing here writes back to the decision.',
  },
  dsr_cap: {
    term: 'DSR Cap',
    short: "Total debt service (existing obligations plus the new installment) over income can't exceed this.",
    body: "This is the debt-service ratio ceiling the engine checks every application against. Raising it lets more applicants qualify for a given amount; lowering it tightens affordability across the whole book.",
  },
  surplus_share_cap: {
    term: 'Installment Share of Surplus Cap',
    short: "An installment can't consume more than this share of the applicant's average monthly surplus.",
    body: "Surplus is income left over after expenses. This cap keeps a new installment from eating too far into that buffer, independent of the DSR cap above (both are checked; the tighter one binds).",
  },
  target_return: {
    term: 'Target Net Return',
    short: 'Net margin above break-even the pricing assistant aims for when discounting a strong file.',
    body: 'The assistant only ever discounts toward this target on files it judges strong; it never prices below your cost of funds and never surcharges past the tier ladder\'s published rate.',
  },
  policy_thresholds_scope: {
    term: 'What These Thresholds Control',
    short: 'Every decision on the Verify tab, the audit trail, and the criteria borrowers are coached toward.',
    body: 'These numbers are read live by the decision engine (Verify tab), cited in every audit trail entry, and published at GET /api/lenders: the same feed the borrower app\'s Coach reads to tell an applicant what would move them into a better tier. Editing here changes all three at once.',
  },
  pricing_assistant_behavior: {
    term: 'Pricing Assistant Behavior',
    short: 'Suggests a rate toward your target return, clamped to the tier ladder as a ceiling.',
    body: 'The assistant discounts strong files toward the target net return above, but never surcharges past the published ladder rate for that tier. The ladder is always a ceiling, never something the assistant can exceed.',
  },
  published_criteria_panel: {
    term: 'Published Criteria Panel',
    short: "Live copy of what the borrower app's Coach actually reads right now.",
    body: "This panel fetches fresh from GET /api/lenders (the published directory) rather than reading this form's local, possibly unsaved state. It's how you confirm a save actually reached borrowers, not just this screen.",
  },
  advisor_disclaimer: {
    term: 'Policy Advisor Scope',
    short: 'Advisory only, computed from the same realized-vs-expected performance the Portfolio tab shows.',
    body: 'Every suggestion here is deterministic, not a model guess. It comes from the same performance aggregates as the Portfolio tab. Nothing here writes to policy automatically; applying a suggestion is always a manual edit above.',
  },
  portfolio_pipeline: {
    term: 'Approve → Book → Securitize',
    short: 'How a loan moves from a decision on the Verify tab to a rated pool.',
    body: 'Every loan approved in the pipeline books onto this tab automatically. One click on "Structure this pool" then takes the live book and structures it into rated tranches on the Capital Markets tab.',
  },
  pool_risk_methodology: {
    term: 'Pool Risk Methodology',
    short: 'Risk here comes only from verified credit bands on loans that already cleared the fraud/confidence gates.',
    body: 'Confidence is shown for context, not folded into the risk figures. Declared purpose stands in for sector in the concentration breakdown until verified occupation data ships.',
  },
  memo_advisory_boilerplate: {
    term: 'Credit Memo Scope',
    short: "This memo restates the policy engine's figures and verdicts. It can't change them.",
    body: 'Every figure, verdict, and compliance flag in this memo is computed by the deterministic policy engine. Any narration is advisory drafting over that decision, never a second opinion that could alter it.',
  },
  letter_advisory_boilerplate: {
    term: 'Adverse-Action Letter Scope',
    short: "This letter restates the policy engine's decision. It doesn't decide anything itself.",
    body: 'Every figure and reason in this letter traces back to the deterministic decision already made. Any narration only smooths the opening/closing prose; it cannot change a reason or a figure.',
  },
};
