// __tests__/fraudModel.test.ts
// TDD tests for the pure-JS logistic regression fraud scorer.

import { scoreFraud, type FraudScore, type FraudContribution } from '../src/lib/fraudModel';
import { type FraudFeatures } from '../src/lib/fraudFeatures';
import weights from '../src/lib/fraudModelWeights.json';
import dataset from '../tools/fraudData/dataset.json';

function vecToFeatures(v: number[]): FraudFeatures {
  const names = weights.featureNames as (keyof FraudFeatures)[];
  return Object.fromEntries(names.map((name, i) => [name, v[i]])) as unknown as FraudFeatures;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const genuineFeatures: FraudFeatures = {
  provenance_trust: 0.70,
  benford_conformity: 0.85,
  round_ratio: 0.01,
  duplicate_ratio: 0.02,
  gap_mean: 0.13,
  gap_variance: 0.09,
  merchant_entropy: 0.92,
  amount_mean_norm: 0.02,
  amount_cv: 0.99,
};

const fabricatedFeatures: FraudFeatures = {
  provenance_trust: 0.46,
  benford_conformity: 0.55,
  round_ratio: 0.55,
  duplicate_ratio: 0.16,
  gap_mean: 0.55,
  gap_variance: 0.55,
  merchant_entropy: 0.45,
  amount_mean_norm: 0.04,
  amount_cv: 0.05,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

// The model is trained on a semi-real dataset (real Berka transactions for the genuine class,
// perturbed-real for the fraud class), so it is intentionally NOT perfectly separable. We test
// its real behaviour on that dataset's own distribution rather than on hand-crafted fixtures.
describe('scoreFraud  separates genuine from fabricated on the real dataset', () => {
  const rows = dataset as { features: number[]; label: number }[];
  const meanProb = (label: number) => {
    const ps = rows.filter((r) => r.label === label).map((r) => scoreFraud(vecToFeatures(r.features)).probability);
    return ps.reduce((s, p) => s + p, 0) / ps.length;
  };
  const genuineMean = meanProb(0);
  const fraudMean = meanProb(1);

  it('genuine transactions score low on average', () => {
    expect(genuineMean).toBeLessThan(0.4);
  });
  it('fabricated transactions score high on average', () => {
    expect(fraudMean).toBeGreaterThan(0.6);
  });
  it('fabricated scores materially higher than genuine (the model discriminates)', () => {
    expect(fraudMean - genuineMean).toBeGreaterThan(0.3);
  });
});

describe('scoreFraud  contributions ordering', () => {
  it('contributions[0] has the highest |weight| (sorted descending)', () => {
    const result: FraudScore = scoreFraud(genuineFeatures);
    const { contributions } = result;
    expect(Math.abs(contributions[0].weight)).toBeGreaterThanOrEqual(
      Math.abs(contributions[1].weight),
    );
  });

  it('contributions are sorted by |weight| descending throughout the array', () => {
    const result: FraudScore = scoreFraud(fabricatedFeatures);
    const { contributions } = result;
    for (let i = 1; i < contributions.length; i++) {
      expect(Math.abs(contributions[i - 1].weight)).toBeGreaterThanOrEqual(
        Math.abs(contributions[i].weight),
      );
    }
  });
});

describe('scoreFraud  completeness', () => {
  it('all 9 contributions are present', () => {
    const result: FraudScore = scoreFraud(genuineFeatures);
    expect(result.contributions).toHaveLength(9);
  });

  it('feature names match the 9 names in fraudModelWeights.json', () => {
    const result: FraudScore = scoreFraud(genuineFeatures);
    const names = result.contributions.map((c: FraudContribution) => c.feature);
    for (const expected of weights.featureNames) {
      expect(names).toContain(expected);
    }
  });
});

describe('scoreFraud  output bounds', () => {
  it('probability is bounded in [0, 1] for genuine fixture', () => {
    const { probability } = scoreFraud(genuineFeatures);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
  });

  it('probability is bounded in [0, 1] for fabricated fixture', () => {
    const { probability } = scoreFraud(fabricatedFeatures);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
  });

  it('probability is bounded in [0, 1] for extreme all-zero input', () => {
    const zeros: FraudFeatures = {
      provenance_trust: 0,
      benford_conformity: 0,
      round_ratio: 0,
      duplicate_ratio: 0,
      gap_mean: 0,
      gap_variance: 0,
      merchant_entropy: 0,
      amount_mean_norm: 0,
      amount_cv: 0,
    };
    const { probability } = scoreFraud(zeros);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
  });

  it('probability is bounded in [0, 1] for extreme all-one input', () => {
    const ones: FraudFeatures = {
      provenance_trust: 1,
      benford_conformity: 1,
      round_ratio: 1,
      duplicate_ratio: 1,
      gap_mean: 1,
      gap_variance: 1,
      merchant_entropy: 1,
      amount_mean_norm: 1,
      amount_cv: 1,
    };
    const { probability } = scoreFraud(ones);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
  });
});

describe('scoreFraud  determinism', () => {
  it('same input always produces same output', () => {
    const r1 = scoreFraud(genuineFeatures);
    const r2 = scoreFraud(genuineFeatures);
    expect(r1.probability).toBe(r2.probability);
    expect(r1.contributions).toEqual(r2.contributions);
  });
});
