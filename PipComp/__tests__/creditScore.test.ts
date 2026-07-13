import { computeCreditScore, bandFor, type CreditProfile } from '../src/lib/creditScore';

const strong: CreditProfile = {
  months: 6, avgIncome: 3000, incomeMonths: 6, avgSurplus: 900, positiveMonths: 6,
  savingsRate: 0.3, monthlyDebtService: 150, adherenceWithinRatio: 1, netWorthSlope: 300,
  repaymentOnTime: 3, repaymentTotal: 3, confidence: 1,
};
const weak: CreditProfile = {
  months: 2, avgIncome: 400, incomeMonths: 1, avgSurplus: -50, positiveMonths: 0,
  savingsRate: -0.125, monthlyDebtService: 200, adherenceWithinRatio: 0, netWorthSlope: -200,
  repaymentOnTime: 0, repaymentTotal: 0, confidence: 0.5,
};

describe('computeCreditScore', () => {
  it('rates a strong profile highly', () => {
    const r = computeCreditScore(strong);
    expect(r.score).toBeGreaterThanOrEqual(740);
    expect(['Strong', 'Excellent']).toContain(r.band);
  });
  it('rates a weak profile low', () => {
    const r = computeCreditScore(weak);
    expect(r.score).toBeLessThan(500);
    expect(r.band).toBe('Building');
  });
  it('returns all seven factors with weights summing to 1', () => {
    const r = computeCreditScore(strong);
    expect(r.factors).toHaveLength(7);
    expect(r.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 6);
  });
  it('sets contribution = subScore * weight', () => {
    for (const f of computeCreditScore(strong).factors) {
      expect(f.contribution).toBeCloseTo(f.subScore * f.weight, 6);
    }
  });
  it('dampens the score when data confidence is low', () => {
    const high = computeCreditScore({ ...strong, confidence: 1 }).score;
    const low = computeCreditScore({ ...strong, confidence: 0.5 }).score;
    expect(low).toBeLessThan(high);
  });
});

describe('bandFor', () => {
  it('maps scores to bands', () => {
    expect(bandFor(860)).toBe('Excellent');
    expect(bandFor(760)).toBe('Strong');
    expect(bandFor(660)).toBe('Good');
    expect(bandFor(520)).toBe('Fair');
    expect(bandFor(400)).toBe('Building');
  });
});

describe('confidence band cap', () => {
  // A profile whose raw score is high  only confidence should hold it back.
  const elite: CreditProfile = {
    months: 6, avgIncome: 5000, incomeMonths: 6, avgSurplus: 1800, positiveMonths: 6,
    savingsRate: 0.36, monthlyDebtService: 100, adherenceWithinRatio: 1, netWorthSlope: 600,
    repaymentOnTime: 6, repaymentTotal: 6, confidence: 1,
  };

  it('does not cap when confidence is high (>=0.60): Excellent stays reachable', () => {
    const r = computeCreditScore({ ...elite, confidence: 0.95 });
    expect(r.confidenceCapped).toBe(false);
    expect(['Strong', 'Excellent']).toContain(r.band);
  });

  it('caps the band to Strong below 0.60 confidence', () => {
    const r = computeCreditScore({ ...elite, confidence: 0.5 });
    expect(r.band).not.toBe('Excellent');
    expect(r.score).toBeLessThanOrEqual(819);
  });

  it('caps the band to Fair below 0.40 confidence', () => {
    const r = computeCreditScore({ ...elite, confidence: 0.35 });
    expect(r.score).toBeLessThanOrEqual(619);
    expect(r.confidenceCapped).toBe(true);
  });

  it('caps the band to Building below 0.30 confidence', () => {
    const r = computeCreditScore({ ...elite, confidence: 0.2 });
    expect(r.score).toBeLessThanOrEqual(499);
    expect(r.band).toBe('Building');
    expect(r.confidenceCapped).toBe(true);
  });

  it('confidenceCapped is false when the raw score is already below the cap', () => {
    // weak raw score, low confidence  the cap is not the binding constraint
    const r = computeCreditScore({
      months: 2, avgIncome: 400, incomeMonths: 1, avgSurplus: -50, positiveMonths: 0,
      savingsRate: -0.1, monthlyDebtService: 200, adherenceWithinRatio: 0, netWorthSlope: -200,
      repaymentOnTime: 0, repaymentTotal: 0, confidence: 0.2,
    });
    expect(r.confidenceCapped).toBe(false);
  });
});
