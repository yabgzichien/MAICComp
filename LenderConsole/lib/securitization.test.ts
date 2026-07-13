// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Securitization engine — structures a loan pool into Senior/Mezzanine/Subordinated
// tranches. The core promise this suite guards: a poor pool is honestly downgraded
// (never rubber-stamped AAA), because rating responds to the pool's actual expected
// loss, not a fixed assumption.
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, loanPD, rateTranche, structurePool, summarizePool, type PoolLoan } from './securitization';

const loan = (over: Partial<PoolLoan> = {}): PoolLoan => ({
  id: 'l1',
  principal: 5000,
  apr: 0.22,
  tenorMonths: 18,
  score: 672,
  band: 'Good',
  fraudProb: 0,
  ...over,
});

// ── loanPD ─────────────────────────────────────────────────────────────────────

describe('loanPD', () => {
  it('equals the band base rate at zero fraud probability', () => {
    expect(loanPD('Good', 0)).toBe(DEFAULT_ASSUMPTIONS.bandPD.Good);
    expect(loanPD('Excellent', 0)).toBe(DEFAULT_ASSUMPTIONS.bandPD.Excellent);
  });

  it('a higher fraud probability always increases PD (monotonic)', () => {
    const low = loanPD('Good', 0.1);
    const high = loanPD('Good', 0.5);
    expect(high).toBeGreaterThan(low);
  });

  it('fraud probability of 1 drives PD to 1 regardless of band', () => {
    expect(loanPD('Excellent', 1)).toBe(1);
    expect(loanPD('Building', 1)).toBe(1);
  });

  it('clamps an out-of-range fraud probability into 0..1', () => {
    expect(loanPD('Good', -5)).toBe(loanPD('Good', 0));
    expect(loanPD('Good', 5)).toBe(loanPD('Good', 1));
  });

  it('an unrecognised band fails safe to the weakest (0.25) base PD', () => {
    expect(loanPD('Unknown' as never, 0)).toBe(0.25);
  });

  it('weaker bands have strictly higher base PD than stronger ones', () => {
    const order: Array<'Building' | 'Fair' | 'Good' | 'Strong' | 'Excellent'> = ['Building', 'Fair', 'Good', 'Strong', 'Excellent'];
    for (let i = 1; i < order.length; i++) {
      expect(loanPD(order[i], 0)).toBeLessThan(loanPD(order[i - 1], 0));
    }
  });
});

// ── summarizePool ──────────────────────────────────────────────────────────────

describe('summarizePool', () => {
  it('an empty pool summarizes to all zeros', () => {
    const s = summarizePool([]);
    expect(s).toEqual({ totalPrincipal: 0, loanCount: 0, weightedAvgScore: 0, weightedAvgPD: 0, expectedLossRate: 0 });
  });

  it('a single loan\'s weighted averages equal its own values', () => {
    const s = summarizePool([loan({ principal: 10000, score: 700, band: 'Good', fraudProb: 0 })]);
    expect(s.totalPrincipal).toBe(10000);
    expect(s.loanCount).toBe(1);
    expect(s.weightedAvgScore).toBe(700);
    expect(s.weightedAvgPD).toBeCloseTo(DEFAULT_ASSUMPTIONS.bandPD.Good, 9);
    expect(s.expectedLossRate).toBeCloseTo(DEFAULT_ASSUMPTIONS.bandPD.Good * DEFAULT_ASSUMPTIONS.lgd, 9);
  });

  it('weights by principal, not by loan count — a large weak loan dominates many small strong ones', () => {
    const s = summarizePool([
      loan({ principal: 100, score: 900, band: 'Excellent' }),
      loan({ principal: 100, score: 900, band: 'Excellent' }),
      loan({ principal: 10000, score: 400, band: 'Building' }),
    ]);
    // The Building loan is 10000/10200 ≈ 98% of principal, so the pool skews heavily toward it.
    expect(s.weightedAvgScore).toBeLessThan(500);
    expect(s.weightedAvgPD).toBeGreaterThan(0.2);
  });

  it('loanCount reflects the number of loans regardless of principal size', () => {
    expect(summarizePool([loan(), loan(), loan()]).loanCount).toBe(3);
  });
});

// ── rateTranche ────────────────────────────────────────────────────────────────

describe('rateTranche', () => {
  it('rates exactly at each threshold boundary (inclusive)', () => {
    expect(rateTranche(6)).toBe('AAA');
    expect(rateTranche(4)).toBe('AA');
    expect(rateTranche(3)).toBe('A');
    expect(rateTranche(2)).toBe('BBB');
    expect(rateTranche(1)).toBe('BB');
  });

  it('falls to the next rating down just below a boundary', () => {
    expect(rateTranche(5.99)).toBe('AA');
    expect(rateTranche(3.99)).toBe('A');
    expect(rateTranche(0.99)).toBe('Equity');
  });

  it('rates 0 (or negative) coverage as Equity — no protection at all', () => {
    expect(rateTranche(0)).toBe('Equity');
  });

  it('infinite coverage (zero expected loss) rates AAA', () => {
    expect(rateTranche(Infinity)).toBe('AAA');
  });
});

// ── structurePool ──────────────────────────────────────────────────────────────

describe('structurePool', () => {
  it('an empty pool structures to empty tranches with a zeroed summary', () => {
    const r = structurePool([]);
    expect(r.tranches).toEqual([]);
    expect(r.summary.totalPrincipal).toBe(0);
  });

  it('a concrete pool produces the exact attach/detach/thickness/rating/profit math', () => {
    // principal 100,000, band Good (PD 0.08), fraudProb 0, default LGD 0.6 → EL = 0.048.
    const r = structurePool([loan({ principal: 100000, band: 'Good', fraudProb: 0 })]);
    expect(r.summary.expectedLossRate).toBeCloseTo(0.048, 9);

    const sub = r.tranches.find((t) => t.name === 'Subordinated')!;
    const mez = r.tranches.find((t) => t.name === 'Mezzanine')!;
    const sen = r.tranches.find((t) => t.name === 'Senior')!;

    // Fixed structural thicknesses: Subordinated 12%, Mezzanine 16%, Senior 72% (remainder).
    expect(sub.thicknessPct).toBeCloseTo(0.12, 9);
    expect(mez.thicknessPct).toBeCloseTo(0.16, 9);
    expect(sen.thicknessPct).toBeCloseTo(0.72, 9);
    expect(sub.thicknessRM).toBeCloseTo(12000, 6);
    expect(mez.thicknessRM).toBeCloseTo(16000, 6);
    expect(sen.thicknessRM).toBeCloseTo(72000, 6);

    // Attachment points: Subordinated absorbs first losses (attach 0), Senior absorbs last (detach 1).
    expect(sub.attachmentPct).toBe(0);
    expect(sub.detachmentPct).toBeCloseTo(0.12, 9);
    expect(mez.attachmentPct).toBeCloseTo(0.12, 9);
    expect(mez.detachmentPct).toBeCloseTo(0.28, 9);
    expect(sen.attachmentPct).toBeCloseTo(0.28, 9);
    expect(sen.detachmentPct).toBe(1);

    // Coverage multiples: attachment ÷ expected loss rate.
    expect(sub.coverageMultiple).toBe(0); // first-loss: nothing beneath it
    expect(mez.coverageMultiple).toBeCloseTo(0.12 / 0.048, 6); // 2.5×
    expect(sen.coverageMultiple).toBeCloseTo(0.28 / 0.048, 6); // ~5.83×

    // Ratings follow directly from those coverage multiples against DEFAULT_ASSUMPTIONS' thresholds.
    expect(sub.rating).toBe('Equity'); // 0× coverage
    expect(mez.rating).toBe('BBB'); // 2.5× → >=2 but <3
    expect(sen.rating).toBe('AA'); // 5.83× → >=4 but <6

    // Profit rate = base (5%) + the rating's spread.
    expect(sub.profitRate).toBeCloseTo(0.05 + DEFAULT_ASSUMPTIONS.ratingSpreads.Equity, 9);
    expect(mez.profitRate).toBeCloseTo(0.05 + DEFAULT_ASSUMPTIONS.ratingSpreads.BBB, 9);
    expect(sen.profitRate).toBeCloseTo(0.05 + DEFAULT_ASSUMPTIONS.ratingSpreads.AA, 9);
  });

  it('a poor pool (high expected loss) is honestly downgraded — never rubber-stamped AAA', () => {
    // All Building-band, high fraud probability → very high expected loss.
    const r = structurePool([loan({ principal: 100000, band: 'Building', fraudProb: 0.8 })]);
    const senior = r.tranches.find((t) => t.name === 'Senior')!;
    expect(senior.rating).not.toBe('AAA');
  });

  it('an excellent, thin pool (near-zero expected loss) earns the Senior tranche a top rating', () => {
    const r = structurePool([loan({ principal: 100000, band: 'Excellent', fraudProb: 0 })]);
    const senior = r.tranches.find((t) => t.name === 'Senior')!;
    // PD 0.02 × LGD 0.6 = 0.012 EL; senior attach 0.28 / 0.012 ≈ 23.3× → comfortably AAA.
    expect(senior.rating).toBe('AAA');
  });

  it('the Subordinated tranche\'s reason cites the first-loss share; others cite coverage', () => {
    const r = structurePool([loan({ principal: 100000, band: 'Good' })]);
    const sub = r.tranches.find((t) => t.name === 'Subordinated')!;
    const sen = r.tranches.find((t) => t.name === 'Senior')!;
    expect(sub.reason).toMatch(/First-loss equity/);
    expect(sen.reason).toMatch(/coverage beneath it/);
  });

  it('tranches always sum their thickness to the whole pool (100%)', () => {
    const r = structurePool([loan({ principal: 50000, band: 'Fair' })]);
    const total = r.tranches.reduce((s, t) => s + t.thicknessPct, 0);
    expect(total).toBeCloseTo(1, 9);
  });
});
