# Spec: Income & Expense Structure (dependable vs variable, committed vs flexible)

Status: **Phases 1–2 shipped** (engine + borrower UI). Phase 3 (coach) and Phase 4 (scoring) are
not built. §5.4 (passport/consent plumbing) and §9 (LenderConsole tiles) were deliberately cut
from the first pass — see "First cut" below.

## First cut: what shipped, and what was cut on purpose

Built:
- [incomeFloor.ts](../src/lib/incomeFloor.ts) — `computeIncomeFloor`, `dependableSurplus`,
  `serviceableCapacity`. Pure, 30 unit tests.
- `computeExpenseStructure` in [spendingProfile.ts](../src/lib/spendingProfile.ts).
- Wiring in [useCreditProfile.ts](../src/state/useCreditProfile.ts) (local composition only).
- [CashflowStructure.tsx](../src/components/CashflowStructure.tsx) — the two borrower cards, on
  CreditScreen above Score Factors.
- **Monthly Recap**: `MonthVsNormalCard` on [RecapScreen.tsx](../src/screens/RecapScreen.tsx),
  between the income hero and the spending breakdown. Deliberately a *different* card from the
  credit-screen pair: the recap already reports this month's totals, so what it adds is the
  comparison the screen previously could not make — was this a good month *for this person*
  ("RM494, ▼RM1,521 below your usual RM2,015"), and how much of it was ever theirs to move.
  The floor comes from all history; the spend split is scoped to the selected month. Obligations
  are detected across the full ledger and then applied to the month, which works only because
  `computeExpenseStructure` takes them as an argument rather than detecting internally.
- Glossary entries `income_floor` and `committed_spend`.

Cut, so the first pass carries **zero** risk to signed credentials or to any pinned outcome:
- **No passport/consent changes.** `buildPassport` takes explicit named args, so not passing the
  new fields leaves minted passports byte-identical. Verification, old credentials, the Attack
  Gallery and the pinned persona outcomes are all untouched.
- **No score or affordability changes** (Phase 4 stays deferred — see §8).
- **No LenderConsole changes**, so the lender does not yet see the floor. This is the one thing
  given up: the "borrower is coached toward the number the underwriter decides on" half of the
  flywheel. Adding §5.4 + §9 later needs no rework of the UI built here.

### Three findings from building it

1. **The floor can legitimately exceed the average.** Ravi's floor is RM5,070 against a RM4,714
   average, because one RM963 month drags the mean below every other month. This is not clamped —
   it is the sharpest demonstration of why averaging misdescribes an uneven earner, and the card
   has dedicated copy for it.
2. **`dependableSurplus` had to be split in two.** The original single definition (floor minus
   *unavoidable* outflows) is not universally more conservative than `avgMonthlySurplus`, because
   it silently excludes flexible spend. It is now `dependableSurplus` (floor − *all* spending, the
   honest headline, always ≤ avg-minus-avg) and `serviceableCapacity` (floor − unavoidable, the
   "if you redirected the flexible part" figure). The card shows both.
3. **`detectObligations` is liberal.** Any merchant recurring 3+ months at a near-constant amount
   counts, so unusually steady groceries would register as committed. Real ledgers vary enough
   that this rarely fires — Aina gets 3 sensible obligations, Ravi and Faizal get none — but test
   fixtures must use realistic variance or they test nothing.
4. **Bucket colours must separate by LIGHTNESS, not hue.** Two attempts failed here and both
   needed measuring to catch: `ink2`/`ink3` are near-identical grey-greens, and the replacement
   pair `ink3` vs `accent` measured a **1.08:1** luminance ratio — clearly different in hue, but
   identical in weight, so adjacent segments still blurred together (and would be invisible to a
   colour-blind reader). The shipped ramp is one hue family running dark→light
   (`ink` → `accentInk` → `#3ab07a`) at roughly 2.6:1 and 2.4:1 between neighbours. Verify any
   future change by measuring rendered luminance, not by eye.
5. **The recap card is deliberately terser than the credit-screen pair.** It carries the kicker,
   the month's income against the floor, the bar, and a compact figure-only legend — no per-bucket
   notes and no closing paragraph. An earlier draft's narrative line also had to handle empty
   buckets (it once read "so the flexible RM0 is where the pressure lands"); trimming the card
   removed that copy, and the now-dead `monthNarrative()` helper and its tests were deleted with
   it. The fuller reading lives on CreditScreen.

### Verified against the real seed

| Persona | Floor | Average | Weak-month surplus | Case exercised |
|---|---|---|---|---|
| Aina | RM2,015 (5/6 cleared) | RM2,173 | +RM581 | 3 obligations, 26% committed |
| Ravi | RM5,070 (7/8 cleared) | RM4,714 | +RM3,317 | **floor > average**; zero obligations |
| Faizal | RM500 (4/4) | RM4,625 | **−RM507** | negative surplus; zero obligations |

Faizal is the sharpest demo beat: Score Factors reports "avg surplus RM3,618/mo" while the new
card reports "RM507 short in a weak month" — and he is the declined persona. The average says he
is comfortable; the floor says he is not.

---

Audience: an implementing agent with no prior conversation context.
Repo area: `PipComp/` (Expo / React Native), with one additive change in `LenderConsole/`.
Run tests with `npm test` from `PipComp/`; typecheck with `npx tsc --noEmit`.

---

## 1. Verdict first

**Build it — but almost none of the work is computation, and it must not be a user-declared
toggle.**

Three findings drive this spec:

1. **The engine already computes both sides.** Income variability
   ([incomeQuality.ts](../src/lib/incomeQuality.ts)) and expense structure
   ([spendingProfile.ts](../src/lib/spendingProfile.ts), [obligations.ts](../src/lib/obligations.ts))
   already exist, are pure, and are unit-tested.
2. **The lender already sees all of it.** [Console.tsx:632-655](../../LenderConsole/app/Console.tsx)
   renders eight stat tiles plus an itemised obligations list.
3. **The borrower sees none of it.** Grep every screen and component in `PipComp/src`: zero
   references to `variationCoefficient`, `regularityRatio`, `seasonal`, `essentialsRatio`,
   `expenseVolatility`, or `bufferDays` outside the passport pass-through.

So the product measures how someone earns and spends, ships that analysis to the underwriter, and
never tells the person it describes. **The deliverable is the borrower-facing surface plus one
genuinely missing number — not a new analysis engine.**

### Do NOT build a self-declared income-type toggle

A "is your income fixed or variable?" question contradicts the product's entire thesis. The app's
positioning is *trust scored, not assumed*, and the Attack Gallery exists specifically to
demonstrate that unverifiable claims are not taken on faith. A declared income-type field is such a
claim, and a fraudster selects "fixed" every time. The existing `occupation` field gets away with
`selfDeclared: true` because it is **context**; this would be a **risk parameter**. Derive it from
the ledger or don't ship it.

### Do NOT frame it as a verdict on the user

"Variable income" as a label sorts the app's own target market into the losing bucket. All three
demo personas — Ravi (delivery driver), Aina (online seller), Faizal (small trader) — are
variable-income earners. That *is* the market. Naming and copy guidance is in §4.

---

## 2. What already exists (do not rebuild)

| Signal | Module | Computed | Lender sees | Borrower sees | Feeds score |
|---|---|---|---|---|---|
| `variationCoefficient` — income amount swing | `incomeQuality.ts` | ✅ | ✅ "Variance" | ❌ | ❌ |
| `sourceCount` — recurring inflow count | `incomeQuality.ts` | ✅ | ✅ "Sources" | ❌ | ❌ |
| `regularityRatio` — months with income | `incomeQuality.ts` | ✅ | ✅ "Regularity" | ❌ | ✅ 60% of income factor |
| `seasonal` — lumpy timing flag | `incomeQuality.ts` | ✅ | ✅ "Pattern" | ❌ | ❌ |
| `essentialsRatio` — essential ÷ total spend | `spendingProfile.ts` | ✅ | ✅ "Essentials" | ❌ | ❌ |
| `expenseVolatility` — expense swing | `spendingProfile.ts` | ✅ | ✅ "Volatility" | ❌ | ❌ |
| `bufferDays` — runway | `spendingProfile.ts` | ✅ | ✅ "Buffer" | ❌ | ❌ |
| `obligations[]` — recurring committed outflows | `obligations.ts` | ✅ | ✅ itemised | ❌ | ✅ via debt service |
| **income floor** — what they can count on | — | ❌ | ❌ | ❌ | ❌ |
| **committed-vs-flexible split** of expenses | — | ❌ | ❌ | ❌ | ❌ |

The bottom two rows are the only new computation in this spec.

### The one real engine gap

The score's income factor ([creditScore.ts:91](../src/lib/creditScore.ts), weight 0.20) is:

```
subScore = regularity × 60 + level × 40      where level = avgIncome / 2000
```

`regularity` asks *did money arrive each month*. **Amount volatility is invisible to the score.**
An earner taking RM500 then RM4,500 scores identically to one taking RM2,500 twice — same
regularity, same average, wildly different risk. Likewise `avgMonthlySurplus` is
`meanIncome − meanExpense`, which is the least honest figure available for a volatile earner: it
silently assumes a weak income month arrives alongside a shrunken expense month, when committed
outflows do not shrink at all.

---

## 3. Research: what the established methods actually say

### Two schools on the income baseline, and they conflict

| Method | Baseline | Source |
|---|---|---|
| Averaging | mean monthly income | YNAB's own irregular-income *guide* |
| **Anti-averaging** | last month's *actual* income, never a forecast | YNAB's variable-income *blog* |
| Lowest-month | the weakest month in the last year | Ramsey / Jade Warshaw school |
| Lender practice | average bonus/commission over 2–3 years | cash-flow underwriting practice |

YNAB is internally inconsistent here, so this spec does not cite it as a single authority. Their
blog is blunt about the failure mode, and it is the one that matters for lending:

> "If you plan against a $5,000/month average and you happen to be on the 'dip' end of that average
> for a few months in a row… it doesn't work."

**Design conclusion.** The purpose decides the baseline:
- **Underwriting** (what may be lent) → a conservative **floor**. Downside of being wrong is a
  default and a harmed borrower. This also matches Bank Negara Malaysia's Guidelines on Responsible
  Financing, which require affordability assessed on a *prudent* debt service ratio.
- **Coaching** (what to plan against) → floor for commitments **plus a buffer category** that
  absorbs the good months. This is the one thing every source agrees on.

### Fixed vs variable expenses: the standard is a 2×2, not a list

Mainstream guidance converges on: budget fixed/committed costs first from guaranteed income or
reserves, then flex the variable categories, having first measured a few months of actual variable
spend. Frameworks: 50/30/20 and zero-based budgeting.

Critically, two axes get conflated and **the app currently models only one**:

|  | **Essential** (can't cut) | **Discretionary** (can cut) |
|---|---|---|
| **Committed** (amount fixed) | rent, utilities, loan instalments | subscriptions |
| **Variable** (amount moves) | groceries, fuel | dining, shopping |

`essentialsRatio` captures the columns. `obligations.ts` captures the top row. **Nothing combines
them**, and the combination is exactly what answers "what is the smallest this person's month can
be?" — the number an underwriter needs and the borrower has never been shown.

### Malaysian market context (useful for the pitch, not just the code)

- ~**1.2 million gig workers** in Malaysia; banks flag them high-risk regardless of actual earnings.
- CGC Digital's CEO Yushida Husin: pay slips were the proxy for income, and **"In the gig world,
  this proxy is broken."** That is this product's thesis, stated by a BNM-owned entity.
- The **Gig Workers Act 2025** mandates pay slips for gig work — relevant to the roadmap, since it
  partially closes the very gap this app fills via screenshots.
- BNM's Guidelines on Responsible Financing (2012) require prudent DSR-based affordability.

Sources are listed in §11.

### UX research applied

- Establish visual hierarchy: concise summary first, details on expansion.
- Group related indicators to cut cognitive load; don't scatter income/expense/savings.
- Explicitly: *designing for irregular income means skipping jargon and removing assumptions about
  9–5 jobs or fixed monthly budgets.*
- Line/bar charts for trend over time. (Corollary: **no pie chart** for the 2×2 — see §6.)

---

## 4. Naming and copy

The framing is the feature. Get this wrong and it reads as a credit rejection.

| Concept | ✅ Use | ❌ Avoid | Why |
|---|---|---|---|
| Income floor | "You can count on" / "Dependable" | "Guaranteed", "Minimum wage" | Guaranteed is a promise the data can't make |
| Income above floor | "Upside" / "Good months add" | "Unreliable", "Unstable" | Upside is real earnings, not a defect |
| Income pattern | "Steady" / "Uneven" / "Seasonal" | "Variable income" as a *verdict* | Describe the shape, don't grade the person |
| Fixed outflows | "Committed" | "Fixed" | Committed says *why* it can't move |
| Flexible outflows | "Flexible" | "Discretionary", "Wants" | Discretionary is jargon; "wants" is moralising |
| The safe surplus | "Dependable surplus" | "Disposable income" | Term of art, and untrue for this user |

Copy register, per the documented convention in
[tourSteps.ts](../src/lib/tourSteps.ts) ("UI/UX C5: one idea, ~12 words, verdict first"): lead with
the number or the verdict, one idea per line, no jargon.

**Never** state or imply that uneven income is bad. The honest and differentiating claim is the
opposite, and `sourceCount` backs it: three inflows of RM700 are more resilient than one of
RM2,100, because the single-employer earner is one layoff from zero. Traditional scoring rates that
earner *safer*. This app can show why that's wrong.

---

## 5. Phase 1 — Engine (pure, low risk)

### 5.1 New module: `src/lib/incomeFloor.ts`

Follow the discipline of the existing sibling modules: pure, `import type { Transaction }` only, no
UI/DB imports, no `Date.now()`.

```ts
export interface IncomeFloor {
  /** RM/month that held in at least `floorConfidence` of observed months. */
  floor: number;
  /** Mean monthly income, for the gap the UI shows against the floor. */
  average: number;
  /** Best observed month — the "upside" figure. */
  best: number;
  /** Months at or above `floor` ÷ months with income. */
  monthsAtOrAboveFloor: number;
  monthsObserved: number;
  /** Which percentile produced `floor` (see METHOD below). */
  percentile: number;
  /** False when history is too thin to claim a floor at all (< MIN_MONTHS). */
  reliable: boolean;
}

export function computeIncomeFloor(transactions: Transaction[]): IncomeFloor;
```

**METHOD.** Take monthly income totals over months that had income. Sort ascending. Use the
**20th percentile** (nearest-rank, no interpolation — simpler to explain and to test) as `floor`.

Rationale, and state it in the module comment: the 20th percentile is deliberately between the
lowest-month school (too pessimistic — one catastrophic month permanently defines the borrower) and
averaging (demonstrably wrong for volatile earners, per §3). It reads naturally in copy: *"you
cleared this in 4 of your last 5 months."*

- `MIN_MONTHS = 3`. Below that, `reliable: false` and `floor: 0` — the UI must then show a
  "keep recording" state, never a fabricated floor. Mirrors `obligations.ts`'s `MIN_MONTHS` idea.
- Empty income → all zeros, `reliable: false`.
- Single month → `floor = 0`, `reliable: false`, but `average`/`best` still populated.

### 5.2 Extend `src/lib/spendingProfile.ts`

Add the committed/flexible split. It needs the detected obligations, so accept them rather than
re-detecting (keeps one source of truth):

```ts
export interface ExpenseStructure {
  /** Σ detected recurring obligations — contractually fixed, cannot be cut this month. */
  committed: number;
  /** Essential-category spend that is NOT a detected obligation (groceries, fuel). Compressible. */
  essentialVariable: number;
  /** Everything else — the flex. */
  flexible: number;
  /** committed ÷ total expense. The share of the month that is already spoken for. */
  committedRatio: number;
}

export function computeExpenseStructure(
  transactions: Transaction[],
  obligations: DetectedObligation[],
): ExpenseStructure;
```

Reuse the existing `ESSENTIAL_CATEGORY_IDS` set. Match obligations to transactions by
`merchantKey || merchantRaw` (same key `obligations.ts` groups on) — do **not** re-run pattern
detection.

### 5.3 The number that ties both halves together

Add to `src/lib/incomeFloor.ts` (or a small `dependableSurplus.ts`):

```ts
/** floor − committed − essentialVariable. What survives even a weak month. */
export function dependableSurplus(floor: number, s: ExpenseStructure): number;
```

This is the spec's centrepiece. Illustrative, using the figures in
[samplePassport.ts](../src/data/samplePassport.ts) (avg income RM2,540, CoV 0.18, obligations
RM120, essentials 68%):

| Figure | Value | Meaning |
|---|---|---|
| Average income | RM2,540 | what `avgMonthlySurplus` is built on today |
| Income floor (p20) | ~RM2,080 | what actually held up |
| Committed | RM120 | TNB + Unifi, contractually fixed |
| Essential variable | ~RM1,250 | groceries/fuel — compressible, not removable |
| **Dependable surplus** | **~RM710** | survives a weak month |
| Flexible spend | ~RM650 | could be redirected if needed |

Compare with today's `avgMonthlySurplus` of RM520 — note it is **not** simply lower or higher, it is
*differently derived*, and it comes with a statement of what it survives. That is the story.

### 5.4 Passport & consent plumbing

- `incomeQuality?` and `spendingProfile` already flow to the passport. Extend
  `PassportIncomeQuality` ([passport.ts:111](../src/lib/passport.ts)) and the **explicit** field
  mapping in [consentScopes.ts](../src/lib/consentScopes.ts) — it enumerates fields, so new ones are
  dropped silently if you forget.
- Keep every new field **optional** so previously signed passports still verify. The validators at
  `passport.ts:342/373` must not start rejecting old credentials.
- Tier placement: income floor is a **Tier 0** aggregate (it is income, already Tier 0). The
  committed/flexible split belongs in **Tier 2** alongside `essentialsRatio`, since it is
  behavioural detail.
- Bump `provenanceMeta.engineVersion`.

---

## 6. Phase 2 — Borrower UI (the actual deliverable)

Two new cards on **CreditScreen**, placed directly above the existing "Score Factors" card so the
narrative runs *how you earn → how you spend → what that scores*.

### 6.1 Card A — "What you can count on"

```
┌──────────────────────────────────────────────────┐
│ HOW YOU EARN                                 (i) │
│                                                  │
│ RM2,080  you can count on                        │
│ Cleared in 10 of your last 12 months             │
│                                                  │
│  RM3.2k ┤                    ▓                   │
│         ┤        ▓     ▓     ▓        ▓          │
│  floor ─┼──▓──▓──▓──▓──▓──▓──▓──▓──▓──▓──  2,080 │
│         ┤  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓         │
│      0  └──────────────────────────────────       │
│           Aug         Jan         Jun            │
│                                                  │
│ Average RM2,540  ·  Best RM3,180  ·  1 source    │
│                                                  │
│ Your income moves month to month. Lenders can    │
│ still underwrite the floor — that is the number   │
│ that held up.                                     │
└──────────────────────────────────────────────────┘
```

**Design rules.**
- **The floor line is the hero**, not the bars. It is drawn *across* the whole chart, labelled, in
  `colors.accent`. Bars are muted (`colors.surface2` / `ink3`); months **below** the floor take
  `colors.amber` so the exceptions are visible rather than hidden.
- Bars are monthly income totals, most recent last, 6–12 months. This is the trend-over-time case
  the UX literature assigns to bar/line charts.
- Reuse `useEasedFrom` from [Motion.tsx](../src/components/Motion.tsx) to sweep bar heights on
  mount; it already has an rAF-stall backstop.
- One `InfoButton`-style badge opening a short explainer: what a floor is, why it beats an average.
  The app already has this pattern (`src/components/InfoButton.tsx` + `GLOSSARY`) — **add glossary
  entries** `income_floor` and `committed_spend` rather than inventing new modal chrome.
- Thin-history state (`reliable: false`): suppress the floor line and the headline number entirely.
  Show *"Two months recorded. One more and we can show the income you can count on."* **Never
  render a floor the data cannot support** — that is the same honesty rule the Attack Gallery
  enforces.

### 6.2 Card B — "What your month already owes"

```
┌──────────────────────────────────────────────────┐
│ HOW YOU SPEND                                (i) │
│                                                  │
│ RM710 left over, even in a weak month            │
│                                                  │
│ ├────────────┼──────────────────┼──────────────┤ │
│ │ Committed  │ Essential, varies│   Flexible    │ │
│ │   RM120    │     RM1,250      │    RM650      │ │
│ └────────────┴──────────────────┴──────────────┘ │
│   fixed        can compress       could redirect  │
│                                                  │
│ ▸ The RM120 you're committed to    (2 items)     │
│                                                  │
│ 6% of your spending is locked in — low, which     │
│ means most of your month can flex if income dips. │
└──────────────────────────────────────────────────┘
```

**Design rules.**
- **A single stacked horizontal bar, not a pie.** Three ordered segments read left→right as
  *least escapable → most escapable*. Pie charts lose the ordering, which is the entire point.
- Widths are proportional; each segment carries its own RM label. If a segment is too narrow for
  text, move that label beneath the bar — never truncate a number.
- The expander reuses the disclosure pattern already built in
  [AttackGalleryScreen.tsx](../src/screens/AttackGalleryScreen.tsx) (`chevronRight`/`chevronDown` +
  `FadeIn`), listing each obligation from `obligations[]` with label, kind, and `monthsObserved` —
  i.e. the evidence, not a claim.
- Colour: committed `ink2`, essential-variable `ink3`, flexible `accent`. **Flexible is the
  positive colour** — it is the user's freedom, not their vice. Do not colour any segment red.
- The closing line is computed from `committedRatio`, with both directions written honestly (a high
  ratio says the month is tightly spoken for; it must not read as an accusation).

### 6.3 Accessibility & responsiveness

- Charts are decorative-plus-data: give the chart container an
  `accessibilityLabel` carrying the same facts in words (e.g. *"Income floor RM2,080, cleared in 10
  of 12 months, average RM2,540"*). A screen-reader user must not need the bars.
- Never encode meaning in colour alone — every segment and the floor line carry text labels.
- Segment/bar hit targets that are tappable need ≥44px; if a 3-segment bar can't honour that, make
  the whole bar one target that expands the breakdown.
- Long-form copy must wrap, not truncate, at 320px width.

---

## 7. Phase 3 — Coach (make it actionable)

The insight is worthless if the user can't act on it. Add levers to
[coachPlan.ts](../src/lib/coachPlan.ts), which already has an income-dip stress test at line ~276:

1. **"Add a second income source"** — quantify it from `sourceCount`: a second recurring inflow
   raises the floor and cuts single-source concentration. This is the resilience argument from §4.
2. **"Record N more months"** — a thin history *widens* the gap between floor and average; more
   months tighten it. Directly ties to the existing coverage mechanic.
3. **"Redirect RM X of flexible spend"** — reuse the existing `Free up RM/mo of spending` lever
   (coachPlan.ts:503) but target it at the **flexible** bucket specifically, so the advice names
   money the user can actually move.
4. **Buffer category** — the one thing every budgeting source agrees on: a "good months absorb bad
   months" fund. If the budget feature can seed a category, seed it at
   `average − floor` (~RM460 here), which is precisely the swing that needs absorbing.

---

## 8. Phase 4 — Scoring (DEFERRED; do not ship before the competition)

The principled fix is to feed the floor into the income factor's `level` term instead of
`avgIncome`, so volatility is priced through a **better number** rather than a bolted-on penalty:

```ts
const level = clamp(incomeFloor.floor / 2000, 0, 1);   // was avgIncome / 2000
```

…and to use `dependableSurplus` instead of `avgMonthlySurplus` in the affordability input.

**Why this is deferred, explicitly:**
- It moves **every** score, which moves loan decisions.
- `__tests__/demoPersonaOutcomes.test.ts` pins Ravi/Aina/Faizal to approve/refer/decline. Those
  outcomes are advertised on the onboarding front door.
- The Attack Gallery's control is pinned at approve/71% and its corpus at 6/6 caught
  ([attackGallery.test.ts](../__tests__/attackGallery.test.ts)).
- `avgMonthlySurplus` is a **signed passport field**; changing its derivation changes what
  previously issued credentials mean.

Phases 1–3 deliver the entire narrative with none of that risk. If Phase 4 is attempted, it needs
its own branch, a re-pinning pass over all three test suites, and a `policyVersion` bump.

---

## 9. Lender Console (small, high-leverage)

Add two tiles to the existing income/spending panels in
[Console.tsx:632-645](../../LenderConsole/app/Console.tsx): **"Floor RM2,080 · p20"** and
**"Committed 6% · of spend"**. Also surface `dependableSurplus` next to the DSR figure.

This closes the two-sided loop the pitch claims: the borrower is coached toward the number, and the
underwriter decides on the same number. Guard both tiles on the fields being present, since older
passports won't carry them.

---

## 10. Acceptance criteria

1. `computeIncomeFloor` is pure and deterministic; `reliable: false` whenever `monthsObserved < 3`,
   and the UI shows no floor in that state.
2. `computeExpenseStructure` partitions total expense exactly:
   `committed + essentialVariable + flexible === totalExpense` (within float tolerance). **Test this
   as a property** — a partition that leaks money is the bug that will happen.
3. Obligations are matched, never re-detected: `committed === evidencedMonthlyDebtService` for the
   same input.
4. No new field breaks passport verification: a passport minted before this change still verifies,
   and `validatePassport` accepts payloads lacking every new field.
5. Borrower CreditScreen renders both cards; both degrade to an honest empty/thin state with no
   transactions.
6. Chart containers carry `accessibilityLabel`s conveying the same facts as the visuals.
7. Score outputs are **unchanged**: `demoPersonaOutcomes`, `attackGallery`, and `creditScore` suites
   pass untouched. (Phase 4 is the only thing permitted to change them, on its own branch.)
8. `npx tsc --noEmit` clean; `npx jest` shows no new failures. Note there is a **pre-existing**
   failure in `copyDoubleSpaceScars.test.ts` for `AdvancedImportScreen.tsx`, unrelated to this work.
9. New copy must not trip `copyDoubleSpaceScars` — no `"X  Y"` double-space-after-stripped-em-dash
   patterns in any string literal or JSX text.

## 11. Rules this feature must keep

- **Nothing self-declared.** Every number derives from the ledger.
- **No floor without evidence.** Thin history says so plainly.
- **No moralising copy.** Flexible spend is freedom, not vice; uneven income is a shape, not a fault.
- **Engine modules stay pure** — no UI/DB imports, no `Date.now()`, no `Math.random()`.
- **Additive to the passport only** — optional fields, old credentials keep verifying.

## 12. Out of scope

- Any change to `creditScore.ts` or the affordability inputs (Phase 4, deferred).
- Per-category forecasting or predicted future income.
- Open-banking / MyInvois source-of-truth income — already the documented residual on the Attack
  Gallery roadmap, and the thing the Gig Workers Act 2025 partially addresses.
- A "constant vs variable" user-facing toggle, at any point, for the reasons in §1.

---

## Sources

Budgeting methodology — fixed vs variable expenses:
- [Fixed Expenses vs. Variable Expenses for Budgeting — SmartAsset](https://smartasset.com/financial-advisor/fixed-expenses)
- [Fixed vs. Variable Expenses: A Comparison — Capital One](https://www.capitalone.com/learn-grow/money-management/fixed-vs-variable-expenses/)
- [How to Budget for Fixed and Variable Expenses — Experian](https://www.experian.com/blogs/ask-experian/how-to-budget-for-fixed-and-variable-expenses/)
- [Fixed vs. Variable Expenses — PNC Insights](https://www.pnc.com/insights/personal-finance/spend/fixed-vs-variable-expenses.html)
- [How to Budget for Fixed and Variable Expenses — Ramp](https://ramp.com/blog/how-to-budget-for-fixed-and-variable-expenses)

Irregular / variable income baselines (note the internal conflict discussed in §3):
- [Irregular Income guide — YNAB](https://www.ynab.com/guide/irregular-income) (recommends averaging + roll-forward)
- [How to Manage Money With Variable Income — YNAB blog](https://www.ynab.com/blog/slaying-the-variable-income-dragon) (rejects averaging; use last month's actual)
- [How To Budget With an Irregular Income, According to Jade Warshaw](https://www.aol.com/budget-irregular-income-according-jade-160247097.html) (lowest-month baseline)
- [How to Budget for Irregular Income — Monefy](https://www.monefy.com/guide/how-to-budget-for-irregular-income)

Gig-worker income verification & cash-flow underwriting:
- [Verifying the gig economy — Burnt](https://burnt.com/blog-gig-economy-verification)
- [Gig Worker Income Verification Using Automated Bank Statement Analysis — Ocrolus](https://www.ocrolus.com/blog/mortgage-lenders-tap-technology-to-address-the-burgeoning-gig-economy/)
- [Ensuring Accurate Underwriting for Gig Workers — Argyle](https://argyle.com/blog/ensuring-accurate-underwriting-for-gig-workers/)
- [Cash flow underwriting: 5 ways lenders can drive growth — Plaid](https://plaid.com/resources/lending/cash-flow-underwriting/)
- [Cash Flow Underwriting for Lenders — Carrington Labs](https://www.carringtonlabs.com/blog-topics/cash-flow-underwriting)
- [How Lenders Calculate Affordability in 2025 — Willow Private Finance](https://www.willowprivatefinance.co.uk/how-lenders-calculate-what-you-can-borrow-mortgage-affordability-explained)

Malaysian market & regulatory context:
- [Financing: Solving the gig credit conundrum — The Edge Malaysia](https://theedgemalaysia.com/node/802856) (1.2M gig workers; "in the gig world, this proxy is broken"; Gig Workers Act 2025)
- [Improving the Financial Health of Gig Workers with Innovative Financial Solutions — Bank Negara Malaysia](https://www.bnm.gov.my/-/improving-the-financial-health-of-gig-workers-with-innovative-financial-solutions)
- [Responsible lending guidelines ensures borrowers' affordability — Bank Negara Malaysia](https://www.bnm.gov.my/-/responsible-lending-guidelines-ensures-borrowers-affordability)
- [Measures to Promote Responsible Financing Practices — Bank Negara Malaysia](https://www.bnm.gov.my/-/measures-to-promote-responsible-financing-practices)

Fintech UI/UX:
- [Fintech UX Design: 10 Best Practices for Dashboards — Wildnet Edge](https://www.wildnetedge.com/blogs/fintech-ux-design-best-practices-for-financial-dashboards)
- [How to Start With Budget App Design: 8 Tips From Fintech UI/UX Experts — Eleken](https://www.eleken.co/blog-posts/budget-app-design)
- [UX design best practices for Fintech apps — Merge Rocks](https://merge.rocks/blog/ux-design-best-practices-for-fintech-apps)
- [Designing for Financial Behavior — Eleven Space](https://www.elevenspace.co/blog/designing-for-financial-behavior-ux-that-builds-better-money-habits)
