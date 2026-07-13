import { extractFraudFeatures, toFeatureVector, type FraudFeatures } from '../src/lib/fraudFeatures';
import type { ConfidenceTxn } from '../src/lib/dataConfidence';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a ConfidenceTxn quickly. */
function txn(
  amount: number,
  source: ConfidenceTxn['source'],
  merchantKey?: string,
  date?: string | null,
): ConfidenceTxn {
  return { amount, source, merchantKey, date };
}

// ── 1. Genuine fixture ────────────────────────────────────────────────────────

describe('genuine-like fixture', () => {
  // Varied amounts (non-round), mixed verified/extracted sources,
  // diverse merchants, irregular dates.
  const genuineTxns: ConfidenceTxn[] = [
    txn(123.45, 'verified', 'grab', '2026-01-03'),
    txn(67.80, 'extracted', 'tesco', '2026-01-07'),
    txn(234.10, 'verified', 'zalora', '2026-01-12'),
    txn(45.60, 'extracted', 'mcd', '2026-01-19'),
    txn(312.99, 'verified', 'shell', '2026-01-28'),
    txn(89.50, 'extracted', 'parkson', '2026-02-04'),
    txn(176.30, 'verified', 'airasia', '2026-02-14'),
    txn(52.10, 'extracted', 'lotus', '2026-02-22'),
    txn(98.75, 'verified', 'uniqlo', '2026-03-01'),
    txn(410.20, 'extracted', 'ikea', '2026-03-15'),
    txn(33.90, 'verified', 'grab', '2026-03-25'),
    txn(154.60, 'extracted', 'mydin', '2026-04-03'),
    txn(271.80, 'verified', 'petronas', '2026-04-14'),
    txn(77.40, 'extracted', 'subway', '2026-04-24'),
    txn(188.55, 'verified', 'kfc', '2026-05-05'),
  ];

  let features: FraudFeatures;

  beforeAll(() => {
    features = extractFraudFeatures(genuineTxns);
  });

  it('provenance_trust >= 0.65', () => {
    expect(features.provenance_trust).toBeGreaterThanOrEqual(0.65);
  });

  it('round_ratio <= 0.1', () => {
    expect(features.round_ratio).toBeLessThanOrEqual(0.1);
  });

  it('merchant_entropy >= 0.7', () => {
    expect(features.merchant_entropy).toBeGreaterThanOrEqual(0.7);
  });

  it('amount_cv >= 0.3', () => {
    expect(features.amount_cv).toBeGreaterThanOrEqual(0.3);
  });
});

// ── 2. Fabricated fixture ─────────────────────────────────────────────────────

describe('fabricated-like fixture', () => {
  // Round amounts (divisible by 100), manual sources,
  // heavily repetitive merchants (one dominant + one rare = low entropy),
  // very regular dates (every 7 days).
  const fabricatedTxns: ConfidenceTxn[] = Array.from({ length: 12 }, (_, i) => {
    const day = 1 + i * 7;
    const month = Math.floor(day / 31) + 1;
    const d = ((day - 1) % 30) + 1;
    const dateStr = `2026-0${month}-${String(d).padStart(2, '0')}`;
    // 11 of 12 use the same merchant → very low entropy
    const merchant = i === 11 ? 'shopB' : 'shopA';
    return txn(500, 'manual', merchant, dateStr);
  });

  let features: FraudFeatures;

  beforeAll(() => {
    features = extractFraudFeatures(fabricatedTxns);
  });

  it('provenance_trust <= 0.5', () => {
    expect(features.provenance_trust).toBeLessThanOrEqual(0.5);
  });

  it('round_ratio >= 0.4', () => {
    expect(features.round_ratio).toBeGreaterThanOrEqual(0.4);
  });

  it('merchant_entropy <= 0.5', () => {
    expect(features.merchant_entropy).toBeLessThanOrEqual(0.5);
  });

  it('amount_cv <= 0.2', () => {
    expect(features.amount_cv).toBeLessThanOrEqual(0.2);
  });
});

// ── 3. Vector length is stable ────────────────────────────────────────────────

describe('toFeatureVector', () => {
  it('always returns length 9', () => {
    const empty = toFeatureVector(extractFraudFeatures([]));
    expect(empty).toHaveLength(9);

    const single: ConfidenceTxn[] = [txn(100, 'verified', 'x', '2026-01-01')];
    expect(toFeatureVector(extractFraudFeatures(single))).toHaveLength(9);
  });

  it('elements are in FEATURES.md index order (spot-check index 0 = provenance_trust)', () => {
    const t: ConfidenceTxn[] = [txn(250, 'verified', 'shop', '2026-01-01')];
    const f = extractFraudFeatures(t);
    const vec = toFeatureVector(f);
    expect(vec[0]).toBe(f.provenance_trust);
    expect(vec[1]).toBe(f.benford_conformity);
    expect(vec[8]).toBe(f.amount_cv);
  });
});

// ── 4. All values in [0, 1] ───────────────────────────────────────────────────

describe('value bounds', () => {
  it('every element of the feature vector is in [0, 1]', () => {
    const txns: ConfidenceTxn[] = [
      txn(0, 'manual', undefined, null),
      txn(9999999, 'verified', 'mega', '2026-06-01'),
      txn(1, 'imported', 'tiny', '2026-06-15'),
    ];
    const vec = toFeatureVector(extractFraudFeatures(txns));
    for (const v of vec) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ── 5. Empty input ────────────────────────────────────────────────────────────

describe('empty input', () => {
  it('returns all-zero FraudFeatures without crash or NaN', () => {
    const f = extractFraudFeatures([]);
    const vec = toFeatureVector(f);
    for (const v of vec) {
      expect(v).toBe(0);
    }
  });
});

// ── 6. Gap computation ────────────────────────────────────────────────────────

describe('gap computation', () => {
  it('gap_mean ≈ 10/30 for two txns exactly 10 days apart', () => {
    const txns: ConfidenceTxn[] = [
      txn(100, 'verified', 'a', '2026-01-01'),
      txn(200, 'verified', 'b', '2026-01-11'),
    ];
    const f = extractFraudFeatures(txns);
    // gap_mean = 10 days / 30 ≈ 0.333
    expect(f.gap_mean).toBeCloseTo(10 / 30, 5);
  });

  it('gap_mean and gap_variance are 0 with fewer than 2 dated transactions', () => {
    const txns: ConfidenceTxn[] = [
      txn(100, 'verified', 'a', '2026-01-01'),
      txn(200, 'manual', 'b', null), // no date
    ];
    const f = extractFraudFeatures(txns);
    expect(f.gap_mean).toBe(0);
    expect(f.gap_variance).toBe(0);
  });

  it('gap_variance ≈ 0 for perfectly even gaps', () => {
    // 4 txns, each 7 days apart → gaps = [7, 7, 7], variance = 0
    const txns: ConfidenceTxn[] = [
      txn(100, 'verified', 'a', '2026-01-01'),
      txn(100, 'verified', 'b', '2026-01-08'),
      txn(100, 'verified', 'c', '2026-01-15'),
      txn(100, 'verified', 'd', '2026-01-22'),
    ];
    const f = extractFraudFeatures(txns);
    expect(f.gap_variance).toBeCloseTo(0, 5);
  });
});
