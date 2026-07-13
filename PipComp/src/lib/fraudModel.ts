// src/lib/fraudModel.ts
// Pure-JS logistic regression inference for fraud/fabrication detection.
// Loads exported model weights and produces a probability + per-feature contributions.
// No API key, fully offline, deterministic  same input always yields same output.

import weights from './fraudModelWeights.json';
import { type FraudFeatures, toFeatureVector } from './fraudFeatures';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FraudContribution {
  /** Feature name (e.g. 'round_ratio') */
  feature: string;
  /** Signed contribution = standardized_value * weight_coeff.
   *  Positive → pushes toward fabricated; negative → toward genuine. */
  weight: number;
}

export interface FraudScore {
  /** Probability in [0, 1] that the profile is fabricated. */
  probability: number;
  /** All 9 feature contributions, sorted by |weight| descending. */
  contributions: FraudContribution[];
}

// ── Inference ─────────────────────────────────────────────────────────────────

/**
 * Scores a FraudFeatures record using the exported logistic regression model.
 * Pure function  no side effects, no I/O.
 */
export function scoreFraud(features: FraudFeatures): FraudScore {
  const { featureNames, weights: coefs, bias, featureMeans, featureStds } = weights;

  // 1. Raw feature vector (length 9, canonical order)
  const x = toFeatureVector(features);

  // 2. Standardize each feature: z[i] = (x[i] - mean[i]) / (std[i] + ε)
  const z = x.map((xi, i) => (xi - featureMeans[i]) / (featureStds[i] + 1e-8));

  // 3. Linear score (logit)
  const logit = z.reduce((sum, zi, i) => sum + zi * coefs[i], bias);

  // 4. Sigmoid → probability
  const probability = 1 / (1 + Math.exp(-logit));

  // 5. Per-feature contributions (signed) and sort by |contribution| descending
  const contributions: FraudContribution[] = featureNames
    .map((feature, i) => ({ feature, weight: z[i] * coefs[i] }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return { probability, contributions };
}
