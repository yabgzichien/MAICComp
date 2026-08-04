# Cash-Flow Forecast  Validation Metrics

> **Headline: a 95% lower bound on next-month net cash flow is not achievable at any
> useful level on real data, and this harness is the evidence.** The method under test is
> textbook-correct and its conformal variant hits the target coverage exactly  but the
> bound it needs sits far below zero, so it can neither gate nor size a loan. The project
> therefore does **not** gate on a forecast interval. See
> `docs/cashflow-forecast.md` for what is done instead.

## 1. Coverage of the t-based 95% bound, by volatility regime

Stratified by the window's coefficient of variation (CV = sd/mean), because pooling hides
the failure: lumpy accounts get enormous bands that trivially cover.

| Regime | Origins | Coverage of 95% bound | Lower bound > 0 | Band width (× mean) |
|--------|---------|----------------------|-----------------|---------------------|
| CV < 0.5 (very steady) | 11053 | 41.9% | 72.5% | 0.7× |
| CV 0.5-1.0 (app regime) | 23232 | 68.0% | 0.0% | 1.9× |
| CV 1.0-2.0 (volatile) | 45283 | 80.7% | 0.0% | 3.5× |
| CV > 2.0 (lumpy) | 170090 | 94.0% | 0.0% | 1205291526128.7× |
| **Pooled** | 249658 | 86.9% | 3.2% | 821155483418.5× |

Target coverage **95.0%**; realised pooled **86.9%**  and *worst in the
steadiest regime*, which is the counter-intuitive core of the result. With only 4-6
observations the in-window standard deviation badly understates predictive spread, and
monthly cash flow is not i.i.d.: a quiet stretch is precisely what precedes a regime change
(a bonus, a big repair bill, a lost client). A tight recent history is not evidence of a
tight next month.

## 2. Conformal calibration (distribution-free, held-out accounts)

Calibrating a relative-shortfall quantile on one half of the accounts and evaluating on the
other half *does* achieve the target  which confirms the shortfall is in the data, not in
the arithmetic:

| Quantity | Value |
|----------|-------|
| Calibration origins | 124646 |
| Held-out origins | 125012 |
| Required 95th-pct relative shortfall | 17.07 |
| Resulting bound | mean × -16.07 |
| Held-out coverage | 95.2% |

A genuine 95% floor sits at **-16.1× the mean**  i.e. deeply negative for every
account. Nothing can be lent against it.

## 3. What an affordability cap actually asks

The engine never asks whether next month beats the *mean*; it asks whether the net covers an
installment capped at 35% of mean surplus. P(next-month net ≥ c × historical mean):

| Regime | c = 0 | c = 0.1 | c = 0.2 | c = 0.35 | c = 0.5 | c = 0.75 | c = 1 |
|--------|------|------|------|------|------|------|------|
| ALL | 50.6% | 49.2% | 47.9% | 45.9% | 43.8% | 40.6% | 37.7% |
| CV < 0.5 (very steady) | 55.7% | 52.1% | 48.9% | 42.9% | 34.6% | 27.4% | 21.8% |
| CV 0.5-1.0 (app regime) | 48.6% | 45.3% | 42.3% | 38.0% | 33.5% | 26.6% | 21.9% |
| CV 1.0-2.0 (volatile) | 46.3% | 44.0% | 42.0% | 38.9% | 35.9% | 30.9% | 26.4% |
| CV > 2.0 (lumpy) | 51.8% | 51.0% | 50.2% | 49.0% | 47.9% | 45.9% | 43.8% |

Real accounts run a negative month **49.4% of the time**, and the engine's own
35% cap is covered by next month's net only **45.9%** of the time. This is not a
defect in the cap: it shows the cap is a *buffer* policy, not a single-month solvency
guarantee. Repayment is made out of accumulated buffers and the multi-month mean, which is
exactly why the engine sizes on `avgMonthlySurplus` rather than on any one month.

## Method under test

`wma-linear+t95`  linear-recency weighted mean as the point forecast, plus the one-sided
prediction bound `x̄ − t·s·√(1 + 1/n)` with hardcoded 95% Student-t multipliers (df = n−1).
No learned parameters. The evaluator imports `forecastNextMonthNet` directly from
`src/lib/cashflowForecast.ts`, so the measured code is the library code.

Note the point estimate was also refuted on its own terms: the recency weighting loses to a
plain unweighted mean on held-out MAE, so there is no accuracy case for the extra machinery
either.

## Dataset source

**Real, and used for validation only  nothing here is trained.** The **Berka (PKDD'99)
Czech-bank dataset** (~5,300 accounts, ~1M transactions, CC0) is the only real longitudinal
cash-flow panel available to this project. Per-account calendar-month nets are built from
signed amounts (`PRIJEM` credit, `VYDAJ`/`VYBER` debit).

Because the method has no fitted coefficients, there is no transfer-learning risk from Czech
accounts to Malaysian ones  the arithmetic is identical in any currency.

**Limitation, stated plainly:** these are full-service current accounts, so the monthly net
includes lumpy savings and transfer flows that a curated income/expense ledger would not
carry. That inflates volatility relative to the app's own series. It does not rescue the
95% claim  P(net ≥ 0) of 50.6% is far too close to a coin flip for any plausible
correction to reach 95%  but a Malaysian gig-worker panel would be the right instrument for
setting a production haircut, and is named as future work in the paper.

## Protocol

- Rolling-origin (walk-forward): every valid origin in every account contributes one test.
- Window sizes n ∈ {4, 5, 6}, matching what the app can actually assemble.
- Windows must span n **consecutive** calendar months and be followed by a real month;
  gap-spanning windows are skipped, as the app never forecasts across missing history.
- Each account's first and last month are dropped (partial by account opening / dataset
  cutoff), mirroring the app's exclusion of the borrower's in-progress current month.
- Only positive-mean windows are scored: a borrower with no historical surplus never
  reaches the affordability stage of the engine.
- Accounts need ≥ 8 months of history; the first 6000 qualifying accounts are used,
  split by parity into conformal-calibration and held-out halves.

Reproduce with `npx tsx tools/cashflowForecast/evaluate.ts [path/to/trans.csv]`.
