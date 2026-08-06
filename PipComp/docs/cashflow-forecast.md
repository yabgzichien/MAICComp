# Forecasting Next-Month Cash Flow: A Negative Result

*Investigation of `src/lib/cashflowForecast.ts` and `tools/cashflowForecast/evaluate.ts`. Pip Credit, Track T3. The headline finding is negative and the feature was **not** wired into the decision engine  this document records why, because the result is more useful than the feature would have been.*

---

## 1. The proposal

Enhance the lending decision with a forward-looking affordability test: predict the borrower's **next-month net cash flow**, compute a **95% confidence interval**, and require the lower bound to exceed the repayment amount before lending.

Two refinements were made before any code was written:

- **It is not the confidence score.** `dataConfidence.ts` scores *data authenticity*  "is this evidence real?" A prediction interval scores *forecast uncertainty*. They share a word and nothing else; a beautifully calibrated band over fabricated data is still worthless. The forecast was therefore scoped as a separate affordability layer, leaving all three authenticity gates untouched.
- **Size, don't gate.** A hard "lower bound > repayment" rule is ~97.5% one-sided certainty, stricter than a bank, applied to thin-file gig workers with 4-6 months of history. It would decline precisely the borrowers the product exists to serve. The design instead fed the lower bound into `affordablePrincipal` as a conservative surplus, shrinking offers rather than refusing them.

Both refinements were correct and neither saved the idea.

## 2. Method

No trained weights. With 4-6 monthly observations you cannot identify an ARIMA order or fit a tree ensemble, and a fitted model in the decision path would breach this project's rule that the consequential math stays auditable (see `rubric-scorecard.md`). What 4-6 points *can* support is a textbook one-sided prediction bound:

```
point  = linear-recency weighted mean of the monthly nets   (weight i+1, oldest → newest)
bound  = x̄ − t·s·√(1 + 1/n)      t = one-sided 95% Student-t, df = n−1
```

Hardcoded multipliers (2.353 / 2.132 / 2.015 for n = 4 / 5 / 6), no stats dependency, pure and deterministic. `src/lib/cashflowForecast.ts` implements exactly this and is unit-tested.

## 3. Validation protocol

Berka (PKDD'99) Czech-bank panel  ~5,300 accounts, ~1.05M transactions, CC0  the only real longitudinal cash-flow data available to the project. Used **for validation only; nothing is trained on it**, which also means there is no Czech-to-Malaysian transfer risk: the arithmetic is identical in any currency.

Rolling-origin (walk-forward) evaluation. For every account and every window size n ∈ {4,5,6}, slide a window of n *consecutive* calendar months followed by a real month; forecast from the window, compare against what actually happened. Gap-spanning windows are skipped. Each account's first and last month are dropped as partial, mirroring the app's exclusion of the borrower's in-progress month. Only positive-mean windows are scored, since a borrower with no historical surplus never reaches the affordability stage. ~250k origins.

The evaluator imports `forecastNextMonthNet` directly from `src/lib`, so the measured code is the shipped code.

## 4. Result: the bound does not hold, and it fails worst where it matters most

Full tables in `tools/cashflowForecast/METRICS.md`. The shape of it:

| Regime | Coverage of the "95%" bound |
|---|---|
| CV < 0.5 (very steady) | 43% |
| CV 0.5-1.0 (the app's regime) | 68% |
| CV 1.0-2.0 (volatile) | 82% |
| CV > 2.0 (lumpy transfer accounts) | 92-97% |

**Coverage is worst for the steadiest borrowers.** That inversion is the core of the result, and pooling the numbers hides it  a pooled ~87% looks like a tuning problem when it is not one.

The cause is structural. With n = 4-6, the in-window standard deviation badly understates predictive spread, and monthly cash flow is not i.i.d.: **a quiet stretch is precisely what precedes a regime change**  a bonus, a repair bill, a lost client. A tight recent history is not evidence of a tight next month. Widening the multiplier does not fix it; it only inflates the lumpy accounts that were already covered.

## 5. The bound that *does* achieve 95%, and why it is useless

Conformal calibration settles whether this is an arithmetic failure or a data fact. Calibrating a relative-shortfall quantile on half the accounts and evaluating on the held-out half hits the target essentially exactly  **95.2% held-out coverage**. The method works.

The bound it requires is **mean × −16.07**.

A genuine 95% floor on next-month net sits at sixteen times the mean *below zero*, for every account. Under the variance-floor variant at comparable coverage, the lower bound was positive in **0.0% of 125,012 held-out origins**. There is no parameterisation under which "95% lower bound > repayment" admits a single borrower, and none under which it sizes an offer either  it floors everyone identically, which is not a signal.

## 6. What an affordability cap actually asks

The engine never asks whether next month beats the mean. It asks whether the net covers an installment capped at 35% of mean surplus (`policy.maxInstallmentShareOfSurplus`). Measured directly:

- **P(next-month net ≥ 0) = 50.6%.** Real accounts run a negative month about half the time.
- **P(next-month net ≥ 0.35 × mean) = 45.9%.**
- Reaching even 70% confidence would require a *negative* installment cap.

Next-month net cash flow is close to a coin flip around zero. It is not predictable at any confidence level useful for gating or sizing.

This is **not** a defect in the 35% cap. It reframes what the cap is: a **buffer policy, not a single-month solvency guarantee**. Repayment is made out of accumulated buffers and the multi-month mean, which is exactly why the engine sizes on `avgMonthlySurplus` rather than on any one month  and why adding a forecast interval on top would have been solving the wrong problem with false precision.

The point estimate was refuted on its own terms too: the recency weighting **loses to a plain unweighted mean** on held-out MAE (7982 vs 7686). There is no accuracy case for the extra machinery either.

## 7. A trap worth recording

On the demo personas the feature looks excellent. Ravi (CV 0.31) gets a lower bound of **+RM892**; Aina (CV 1.09, two negative months in five) gets **−RM1,389**  steady borrower passes, volatile borrower refers, exactly as designed.

That is an artifact of hand-authored seed data being far more regular than real accounts. The feature would have demoed beautifully and failed in production, and a reviewer asking "did you test this on real data?" would have found it. **The demo personas are not a validation set.** This is the strongest argument for keeping the Berka harness in the repo even though the feature it was built to validate was never shipped.

## 8. Status and what was kept

Not wired into the decision engine. `decideLoan`, the passport schema, and the consent scopes are untouched; there is no `forecast` block on the passport and no new gate.

Kept in the repo:

- `tools/cashflowForecast/METRICS.md`  the full result tables this document summarises.

Removed on 2026-08-04, in the dead-code sweep. The implementation had been retained as the
reference the negative result refers to, but nothing in either app imported it, so it was
carrying maintenance cost for a feature that was decided against. The evidence above and the
METRICS tables are the durable part; the code is recoverable from git history:

- `src/lib/cashflowForecast.ts`  the method, pure and unit-tested (13 tests).
- `__tests__/cashflowForecast.test.ts`
- `tools/cashflowForecast/evaluate.ts`  the harness that produced METRICS.md.

Recover with `git log --diff-filter=D -- PipComp/src/lib/cashflowForecast.ts` to find the
deleting commit, then `git checkout <commit>^ -- <path>`.

## 9. What the evidence does support

The **volatility signal is real** even though the interval is not. Ravi at CV 0.31 and Aina at CV 1.09 are genuinely different risks, and the passport already carries the raw material (`incomeQuality.variationCoefficient`, `spendingProfile.expenseVolatility`). A bounded, volatility-scaled haircut on the sizing surplus  a risk-based discount, making no probabilistic claim  would discriminate smoothly, never degenerate, and require no new passport field. That is a different feature from the one proposed here and would need its own justification; it is recorded as the open option, not as work done.

The honest endgame is unchanged from `confidence-hardening.md` §7: statistics alone are never proof. Better cash-flow prediction needs source-of-truth income (open banking, LHDN e-invoice) and a Malaysian gig-worker panel to calibrate against  not a cleverer interval over six noisy points.
