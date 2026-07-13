# Fraud Model  Training Metrics

## Results

| Metric    | Value    |
|-----------|----------|
| AUC-ROC   | 0.8972 |
| Precision | 0.9029 |
| Recall    | 0.7635 |

## Dataset

| Split         | Samples |
|---------------|---------|
| Training set  | 4800 |
| Test set      | 1200 |

## Dataset source

**Semi-real.** The *genuine* class is computed from real bank transactions  the **Berka
(PKDD'99) Czech-bank dataset** (~5,300 accounts, ~1M transactions, CC0)  so the genuine
behaviour (Benford distribution, inter-transaction gaps, amount dispersion) is real. The *fraud*
class is those same real accounts run through `tools/fraudRealData/perturb.ts` (partial, varied
fabrication). Rebuild with `npx tsx tools/fraudRealData/build.ts` then re-run this trainer.

The discriminating signals are currency- and country-agnostic (Benford, timing regularity,
dispersion), so the model generalises; production retrains/fine-tunes on real Malaysian e-wallet
data. `merchant_entropy`/`duplicate_ratio` use Berka's `k_symbol` codes as a merchant proxy
(real but low-cardinality).

## Hyperparameters

- Algorithm: Logistic Regression (gradient descent)
- Learning rate: 0.1
- Iterations: 1000
- L2 regularization lambda: 0.01
- Threshold: 0.5

## Features (in order)

0. `provenance_trust`
1. `benford_conformity`
2. `round_ratio`
3. `duplicate_ratio`
4. `gap_mean`
5. `gap_variance`
6. `merchant_entropy`
7. `amount_mean_norm`
8. `amount_cv`
