# Fraud Feature Vector  Canonical Format

Used by: `tools/fraudData/generate.js` (generator) and `src/lib/fraudFeatures.ts` (Task A2, live extraction).

The feature vector is a **fixed-length array of 9 numbers**, all values in [0, 1].
The label is an integer: **0 = genuine, 1 = fabricated**.

## Feature order (index 0–8)

| Index | Name               | Description                                                          | Normalization                                         |
|-------|--------------------|----------------------------------------------------------------------|-------------------------------------------------------|
| 0     | `provenance_trust` | Weighted average trust of transaction sources (TxnSource enum)       | Native 0..1 (SOURCE_WEIGHT: verified=1.0, extracted/imported=0.7, manual=0.4) |
| 1     | `benford_conformity` | Benford's Law conformity of leading digits of amounts             | Native 0..1 (0.5 if <30 amounts); from `benfordConformity()` in dataConfidence.ts |
| 2     | `round_ratio`      | Fraction of amounts divisible by 100                                 | Native 0..1; from `roundRatio()` in dataConfidence.ts |
| 3     | `duplicate_ratio`  | Fraction of duplicate-looking rows (same merchant+amount+date)       | Native 0..1; from `duplicateRatio()` in dataConfidence.ts |
| 4     | `gap_mean`         | Mean number of days between consecutive transactions                 | Divide by 30, clamp 0..1                              |
| 5     | `gap_variance`     | Variance of inter-transaction gaps (in days)                         | Divide by 100, clamp 0..1                             |
| 6     | `merchant_entropy` | Shannon entropy of merchant frequency distribution                   | Divide by log2(n+1) where n = unique merchant count, clamp 0..1 |
| 7     | `amount_mean_norm` | Mean transaction amount                                              | Divide by 5000, clamp 0..1                            |
| 8     | `amount_cv`        | Coefficient of variation (std/mean) of amounts                      | Clamp 0..1 (raw value is std/mean)                    |

## Expected ranges by class

| Feature             | Genuine (label=0) | Fabricated (label=1) |
|---------------------|-------------------|----------------------|
| provenance_trust    | ~0.7 (extracted/imported mix) | ~0.46 (mostly manual) |
| benford_conformity  | ~0.7+             | ~0.3-                |
| round_ratio         | ~0.05             | ~0.4+                |
| duplicate_ratio     | ~0.02             | ~0.15–0.25           |
| gap_mean            | varied            | very regular (low normalized) |
| gap_variance        | high              | near 0               |
| merchant_entropy    | high diversity    | low (repetitive)     |
| amount_mean_norm    | varied            | uniform              |
| amount_cv           | high              | near 0               |

## Notes for Task A2

- Compute `gap_mean` and `gap_variance` from sorted ISO date strings; parse to timestamps, diff in ms, convert to days.
- For `merchant_entropy`: count occurrences per `merchantKey`, compute Shannon entropy, divide by `log2(uniqueMerchants + 1)`.
- For `amount_cv`: if mean is 0, return 0.
- All features must be clamped to [0, 1] before writing to the vector.
- Feature order is fixed  do not reorder.
