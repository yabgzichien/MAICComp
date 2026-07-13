# Hardening Data Confidence Against Asymmetric Fraud

*Research + structural engineering plan for `src/lib/dataConfidence.ts` and `src/lib/fraudFeatures.ts`. Pip Credit, Track T3. Deterministic, on-device, unit-testable. No heavy code, per project style.*

---

## 1. The vulnerability in one sentence

Every authenticity signal we compute today is a **global aggregate over the whole transaction set**  Benford conformity, round-ratio, duplicate-ratio, merchant entropy, amount mean, amount CV, provenance trust. A fraudster who leaves 90% of genuine transactions intact and injects a handful of fabricated high-income rows barely moves any of those aggregates, so confidence stays high. This is **asymmetric fraud**, and it is the single most important gap before the competition.

The academic literature confirms this is not a tuning problem but a structural one: Benford's Law "will not detect a one-off ... or very few entries" and degrades badly on small or floor/ceiling-constrained samples ([NIH simulation study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9307211/), [ACFE](https://www.acfe.com/-/media/images/acfe/products/publication/self-study-cpe/workbook/using-benfords-law/using_benfords_law_sample.pdf)). You cannot catch a few injected rows with a statistic computed over hundreds of rows. The fix is to stop looking only at the whole and start looking at **the income stream by itself, row by row, and at how each row entered the system.**

---

## 2. Research  has someone already built this?

**Short answer: the ingredients all exist separately; the specific combination Pip ships does not.** Pip's whitespace is a borrower-held, on-device, cryptographically-signed *cashflow credit passport* with built-in authenticity scoring for B2B micro-lending. The market splits into four camps, none of which occupies that exact square:

| Camp | Who | What they do | How they beat fake income |
|---|---|---|---|
| **Cashflow scoring** | [Plaid LendScore / Income](https://plaid.com/resources/lending/alternative-credit-data/), [Experian Credit + Cashflow](https://www.experianplc.com/newsroom/press-releases/2025/experian-announces-first-combined-credit--cash-flow-and-alternat), [Nova Credit](https://www.novacredit.com/corporate-blog/introducing-the-novascore-cash-flow-the-future-of-consumer-credit-risk), Petal, Prism Data | Turn bank cashflow into a score | Data is pulled from the bank API, so income is **source-verified, not self-asserted** |
| **Statement fraud forensics** | [Ocrolus Detect](https://www.ocrolus.com/video/fraud-detection-in-lending-learn-how-to-streamline-your-processes-with-ocrolus-detect/), [Inscribe](https://www.inscribe.ai/), [Resistant.ai](https://resistant.ai/bank-statement-fraud), [Heron Data](https://www.herondata.io/blog/fraud-document-detection) | Detect altered/fabricated statements | **Running-balance arithmetic checks**, metadata/font forensics, cross-document and transaction-flow consistency |
| **Income verification** | [Argyle](https://www.cbinsights.com/compare/argyle-systems-vs-pinwheel), [Pinwheel](https://www.prnewswire.com/news-releases/pinwheel-becomes-plaids-preferred-provider-for-direct-deposit-switching-and-helps-power-additional-payroll-data-for-income-verification-301903256.html), Truework, Atomic | Verify income at the payroll source | Connect **directly to the employer/payroll**, so income can't be invented |
| **Self-sovereign credit** | [Kiva Protocol](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2019.00028/full) (Sierra Leone DID), ONTO OScore, [W3C Verifiable Credentials](https://en.wikipedia.org/wiki/Verifiable_credentials) | Borrower-held, portable, signed credit attestations | Issuer signs the claim; borrower controls disclosure |

**The strategic lesson is the most important research finding:** the serious players do *not* primarily defeat fake income with cleverer statistics. **They defeat it with source-of-truth**  the income data is pulled from the bank or payroll, so it is verified before it is ever scored. Ocrolus/Inscribe's statistical forensics (the closest analogue to what we do) are explicitly positioned as a *second line* behind connected data, and their headline statistical weapon is exactly the one we are missing: **running-balance reconciliation**.

So Pip is differentiated (no one ships a signed, offline, ML-and-Benford-scored cashflow passport for emerging-market micro-lending), but Pip is also fighting with one hand tied: we currently rely on self-reported / OCR'd data with no source-of-truth. That makes the three rings below the *minimum* bar, and open-banking / e-invoice source verification the strategic endgame (Section 8).

---

## 3. Why our current score is fakeable (grounded in the code)

Walking the attack through `computeDataConfidence`:

- **`provenanceTrust`** averages per-row source weights. A few manual income rows among many extracted expense rows averages out high  the average hides the asymmetry.
- **`benfordConformity`** is computed over *all* amounts and needs ≥30 to even fire; a few injected rows do not shift the first-digit histogram.
- **`roundRatio` / `duplicateRatio`**  the fake rows are a tiny fraction, so both stay low.
- **ML model (`scoreFraud`)** consumes 9 features that are *all* whole-set aggregates (`fraudFeatures.ts`). None is income-specific, so the injected income is invisible to it.
- **The one existing defense that helps** is the `expenseRatio` plausibility penalty  inflating income lowers the expense/income ratio, which does bite. But it is one-sided (only fires when expenses look *too low*), capped at 0.25, and trivially defeated by keeping expenses proportional.

Net: the attacker's fabricated income flows almost untouched into `avgIncome` → credit score → `decideLoan`. The score looks confident because we never inspected the income stream on its own.

**The enabling gap to fix first:** `ConfidenceTxn` carries only `{amount, source, merchantKey, date}`  it does **not carry `type`** (income vs expense). Every rule below needs to know which rows are income. The single highest-leverage change is to thread `type` (and `merchantRaw`, and an optional `balance`) from the call site in `useCreditProfile.ts` (which already holds the full `Transaction`) into `ConfidenceTxn`. Nothing else works without this.

---

## 4. The fix  three structural validation rings

All three rings are pure, deterministic, O(n log n) or better, and run on-device. They attack the income stream specifically, row-by-row, and by provenance  the three axes the global aggregates ignore.

### Ring 1  Structural ledger & running-balance reconciliation

**Rule 1.1  Asset-chain verification.** *Only active when the source document yields a running-balance column* (bank-statement OCR). Sort the reconcilable rows by (date, original sequence). For each consecutive pair the ledger must satisfy:

`balance[t] = balance[t-1] + signedAmount[t]` where income is `+amount`, expense is `−amount`.

Allow a rounding tolerance `ε = max(RM0.01, 0.001 × |balance[t]|)`. A pair that violates this is a **reconciliation break**  a *discontinuous step-function* in the balance line, which is the literal fingerprint of a row pasted into a statement without recomputing the surrounding balances. Define `balanceBreakRatio = breaks / reconcilablePairs`. Severity multiplier: any break **coinciding with an income row** is graded critical (this is the injected-salary signature), an expense-only break is graded minor.

**Rule 1.2  Mismatched variance (robust point-anomaly).** Within each source pipeline, *separately for income and for expense*, compute the **median** and **MAD** (median absolute deviation) of `|amount|`. Flag any single row whose Iglewicz–Hoaglin modified z-score exceeds 3.5:

`modZ = 0.6745 × (amount − median) / MAD`, flag when `modZ > 3.5`.

**Use MAD, not standard deviation, deliberately:** σ is inflated by the very outlier we are hunting, so a single huge fake income row hides itself by raising the threshold it must clear. The median/MAD pair is robust to exactly that. An isolated income amount that is a 3.5-MAD outlier *within the income stream's own distribution* is the prime asymmetric-injection signal, and it fires even when the global CV looks normal.

### Ring 2  Plausibility & macro-economic ratios

**Rule 2.1  Income-to-Expense Skew Penalty.** Generalize today's one-sided plausibility check into a two-sided velocity check. Establish a categorized-outflow baseline (trailing-median monthly expense). Real income growth is accompanied by *some* spending response; fabricated income is not. Trigger a mandatory dampening penalty when, in any month, income outpaces its own trailing-median income by a multiplier `M > 2.5×` **while** expenses stay flat (no corresponding outflow lift)  or when cumulative `totalIncome / totalExpense` exceeds a plausibility ceiling for a working borrower. Penalty scales up to ~0.25 and stacks multiplicatively, exactly like the current `plausibilityPenalty`, so a healthy borrower is untouched.

**Rule 2.2  Merchant-to-Income Entity Alignment.** Maintain a small, static, normalized **allow-list of validated income payers**: payroll/employer markers, payment gateways (Stripe, iPay88, Billplz), recognizable platform payouts (Grab, Shopee, Foodpanda, Lazada), and government transfers. For each income row, normalize `merchantRaw` and classify it as *verified-payer* vs *generic/undocumented P2P* (e.g. "DuitNow transfer", "fund transfer", a bare personal name, or blank). Compute `p2pIncomeValueRatio = Σ income value from generic payers / Σ all income value`. A **high-value** income line sourced from a generic P2P string is flagged  this is the deterministic, offline approximation of what Plaid/Argyle/Pinwheel do by connecting to payroll: a real salary names a real payer; a fabricated one usually cannot. Dampen when this ratio is high *and* absolute income is material.

### Ring 3  Pipeline & metadata isolation

**Rule 3.1  Source Isolation Anomaly.** Compute the provenance mix *separately by value* for income vs expense. Let `expenseVerifiedRatio` = share of **expense value** captured via OCR/extracted/verified pipelines, and `incomeVerifiedRatio` = the same for income. Define `isolationGap = expenseVerifiedRatio − incomeVerifiedRatio`. When the cheap-to-fake healthy points (expenses, which only exist to pass Benford) are ≥80% authentically captured **but** the valuable income leans on the weakest manual/self-reported pipeline, `isolationGap` is large  flag a Source Isolation Anomaly when `isolationGap > 0.4`. The *asymmetry in how income vs expense entered the system* is itself the signal, independent of the amounts.

**Rule 3.2  Trust Dampener cap (hard gate).** Define an **absolute income-anomaly trigger** = any of: a critical Ring-1 income-coincident reconciliation break · a Ring-1 income MAD-outlier above threshold · a Ring-2 entity-alignment flag on a high-value line · a Ring-3 isolation anomaly. When the trigger fires, **hard-cap** the returned `confidence` at `min(confidence, 0.39)`.

This is intentionally below the existing `MIN_CONFIDENCE_TO_APPROVE = 0.5` in `loans.ts`, so the cap **routes the application to REFER through machinery that already exists**  `decideLoan` already flips any confidence < 0.5 to a referral with no change to that file. For the most severe case (multiple triggers, or a critical reconciliation break), surface an explicit `integrityFloorBreached` flag that `decideLoan` treats as an outright **DECLINE**, mirroring the existing hard-adverse-record short-circuit. Either way the high nominal score is overridden, which is the whole point.

---

## 5. ML feature extraction additions (`fraudFeatures.ts`)

The rings above are deterministic penalties and need no model. But to give the learned model a *second* shot at the same vector, append income-segmented features so it can learn the asymmetry on the next training cycle:

- `income_max_modified_z`  strength of the worst income point-anomaly (Ring 1.2).
- `income_p2p_value_ratio`  share of income value from generic payers (Ring 2.2).
- `income_source_isolation_gap`  the Ring 3.1 gap.
- `income_concentration_hhi`  Herfindahl index `Σ (income_i / totalIncome)²`; one dominant fabricated line spikes it.
- `balance_break_ratio`  Ring 1.1 (0 when no balance column exists).

**Hard dependency to call out:** extending the vector from 9 → 14 means the current `fraudModelWeights.json` no longer matches the feature length, so the model **must be retrained and re-exported** (via `tools/fraudData`) before these features can be scored. Until that retrain lands, ship the rings purely as deterministic penalties/caps in `dataConfidence.ts`  they need no model, are immediately unit-testable, and are the part that actually closes the hole. Add the ML features as defense-in-depth on the next training pass, not on the critical path.

---

## 6. Determinism, performance, and where the code changes

- **Determinism / cost:** every rule is a sort (O(n log n)) plus linear passes; median/MAD, ratios, and a small static allow-list lookup are O(n). Fully on-device, pure functions, identical input → identical output, each rule trivially unit-testable in isolation  satisfies all stated constraints.
- **Files touched, in dependency order:**
  1. `src/lib/types.ts` / `ConfidenceTxn`  add `type`, `merchantRaw`, optional `balance`.
  2. `src/state/useCreditProfile.ts`  thread those fields at the call site (it already has the full `Transaction`).
  3. `src/llm/extractPrompt.ts` + `ExtractedTxn`  capture the running-balance column when the document has one (today the prompt explicitly *skips* balance rows). Ring 1 is inert without this; Rings 2–3 carry the load when balances are absent (screenshots, manual entry).
  4. `src/lib/dataConfidence.ts`  implement Rings 1–3 as `ConfidenceReason` rows + penalties + the hard cap; return an `integrityFloorBreached` flag.
  5. `src/lib/loans.ts`  honor `integrityFloorBreached` as a DECLINE short-circuit (REFER already happens for free via the 0.5 gate).
  6. `src/lib/fraudFeatures.ts` + `tools/fraudData`  add the 5 features, retrain, re-export weights (off critical path).

---

## 7. How secure is "secure-proof"? (an honest limit)

The rings make **casual asymmetric injection expensive and loud**  to pass, an attacker must now fabricate a statement that is *internally consistent on every axis at once*: correct running balances, income amounts that sit inside the income stream's own MAD band, realistic named payers, and a provenance mix that matches expenses. That is a large jump in attacker effort, and the signed passport's `evidenceHash` already makes post-hoc tampering of a submitted passport detectable.

But statistics alone are never proof. A determined, well-resourced forger who builds a fully self-consistent fake can still slip through, because the data is still *self-asserted*. The only true defense  and the one every serious player in Section 2 actually relies on  is **source-of-truth verification**: income that is signed by the data source, not by the borrower.

---

## 8. Recommended roadmap

1. **Now (closes the demo hole):** Rings 1–3 as deterministic penalties + the Trust Dampener cap. No retrain, no new dependency, immediately testable. This is the competition-critical work.
2. **Next:** retrain the ML model with the 5 income-segmented features for defense-in-depth.
3. **Endgame (the real fix):** source-of-truth income. Open-banking connectivity (income pulled from the bank, not typed), and for Malaysia specifically, **LHDN e-invoice / MyInvois** and DuitNow payer metadata as a verified income oracle. At that point fabricated income becomes impossible rather than merely expensive  matching how Plaid, Argyle, and Pinwheel solve it  while Pip keeps its unique on-device, signed-passport, borrower-controlled posture.

---

## Sources

- [Plaid  alternative credit data](https://plaid.com/resources/lending/alternative-credit-data/)
- [Experian  combined credit, cashflow & alternative data score](https://www.experianplc.com/newsroom/press-releases/2025/experian-announces-first-combined-credit--cash-flow-and-alternat)
- [Nova Credit  NovaScore Cash Flow](https://www.novacredit.com/corporate-blog/introducing-the-novascore-cash-flow-the-future-of-consumer-credit-risk)
- [Ocrolus Detect  lending fraud detection](https://www.ocrolus.com/video/fraud-detection-in-lending-learn-how-to-streamline-your-processes-with-ocrolus-detect/)
- [Inscribe  document fraud detection](https://www.inscribe.ai/) · [12 red flags for loan fraud](https://www.inscribe.ai/blog/12-common-red-flags-for-loan-application-fraud) · [3 months of fake bank statements](https://www.inscribe.ai/document-processing/3-months-of-fake-bank-statements)
- [Resistant.ai  spot fake bank statements](https://resistant.ai/bank-statement-fraud) · [Heron Data  fraud document detection](https://www.herondata.io/blog/fraud-document-detection)
- [Argyle vs Pinwheel](https://www.cbinsights.com/compare/argyle-systems-vs-pinwheel) · [Pinwheel × Plaid income verification](https://www.prnewswire.com/news-releases/pinwheel-becomes-plaids-preferred-provider-for-direct-deposit-switching-and-helps-power-additional-payroll-data-for-income-verification-301903256.html)
- [Kiva Protocol / SSI for economic inclusion](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2019.00028/full) · [W3C Verifiable Credentials](https://en.wikipedia.org/wiki/Verifiable_credentials)
- [Benford's Law in very small samples (NIH)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9307211/) · [ACFE  using Benford's Law](https://www.acfe.com/-/media/images/acfe/products/publication/self-study-cpe/workbook/using-benfords-law/using_benfords_law_sample.pdf)
