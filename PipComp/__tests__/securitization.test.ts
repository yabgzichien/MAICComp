import {
  loanPD,
  summarizePool,
  rateTranche,
  structurePool,
  DEFAULT_ASSUMPTIONS,
  type PoolLoan,
} from '../src/lib/securitization';
import type { CreditBand } from '../src/lib/creditScore';
import { SAMPLE_POOL } from '../src/data/samplePool';

function loan(over: Partial<PoolLoan>): PoolLoan {
  return {
    id: Math.random().toString(36).slice(2),
    principal: 5000,
    apr: 0.22,
    tenorMonths: 18,
    score: 680,
    band: 'Good',
    fraudProb: 0.05,
    ...over,
  };
}

const ALL_BANDS: CreditBand[] = ['Building', 'Fair', 'Good', 'Strong', 'Excellent'];

describe('loanPD', () => {
  it('decreases monotonically from weaker to stronger bands', () => {
    const pds = ALL_BANDS.map((b) => loanPD(b, 0));
    for (let i = 0; i < pds.length - 1; i++) {
      expect(pds[i]).toBeGreaterThan(pds[i + 1]);
    }
  });

  it('rises with fraud probability and stays clamped to 1', () => {
    expect(loanPD('Good', 0.5)).toBeGreaterThan(loanPD('Good', 0));
    expect(loanPD('Building', 1)).toBeLessThanOrEqual(1);
    expect(loanPD('Good', 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('summarizePool', () => {
  it('weights score and PD by principal and computes the expected-loss rate', () => {
    const loans = [
      loan({ principal: 1000, band: 'Good', score: 700, fraudProb: 0 }),
      loan({ principal: 3000, band: 'Fair', score: 540, fraudProb: 0 }),
    ];
    const s = summarizePool(loans);
    const pdGood = loanPD('Good', 0);
    const pdFair = loanPD('Fair', 0);
    const lgd = DEFAULT_ASSUMPTIONS.lgd;

    expect(s.totalPrincipal).toBe(4000);
    expect(s.loanCount).toBe(2);
    expect(s.weightedAvgScore).toBeCloseTo((700 * 1000 + 540 * 3000) / 4000, 6);
    expect(s.weightedAvgPD).toBeCloseTo((pdGood * 1000 + pdFair * 3000) / 4000, 6);
    expect(s.expectedLossRate).toBeCloseTo(
      (pdGood * lgd * 1000 + pdFair * lgd * 3000) / 4000,
      6
    );
  });

  it('returns zeros for an empty pool', () => {
    const s = summarizePool([]);
    expect(s.totalPrincipal).toBe(0);
    expect(s.loanCount).toBe(0);
    expect(s.weightedAvgScore).toBe(0);
    expect(s.weightedAvgPD).toBe(0);
    expect(s.expectedLossRate).toBe(0);
  });
});

describe('rateTranche', () => {
  it('maps coverage multiples to ratings monotonically', () => {
    expect(rateTranche(0)).toBe('Equity');
    expect(rateTranche(0.9)).toBe('Equity');
    expect(rateTranche(1)).toBe('BB');
    expect(rateTranche(2)).toBe('BBB');
    expect(rateTranche(3)).toBe('A');
    expect(rateTranche(4)).toBe('AA');
    expect(rateTranche(6)).toBe('AAA');
    expect(rateTranche(Infinity)).toBe('AAA');
  });
});

describe('structurePool', () => {
  const fairPool = Array.from({ length: 10 }, () =>
    loan({ band: 'Fair', principal: 5000, score: 560, fraudProb: 0 })
  );

  it('produces three contiguous tranches covering the whole pool', () => {
    const { tranches, summary } = structurePool(fairPool);
    const sub = tranches.find((t) => t.name === 'Subordinated')!;
    const mez = tranches.find((t) => t.name === 'Mezzanine')!;
    const sen = tranches.find((t) => t.name === 'Senior')!;

    expect(sub.attachmentPct).toBeCloseTo(0, 6);
    expect(sub.detachmentPct).toBeCloseTo(mez.attachmentPct, 6);
    expect(mez.detachmentPct).toBeCloseTo(sen.attachmentPct, 6);
    expect(sen.detachmentPct).toBeCloseTo(1, 6);

    const sumThick = tranches.reduce((a, t) => a + t.thicknessPct, 0);
    expect(sumThick).toBeCloseTo(1, 6);
    const sumRM = tranches.reduce((a, t) => a + t.thicknessRM, 0);
    expect(sumRM).toBeCloseTo(summary.totalPrincipal, 3);
    tranches.forEach((t) => expect(t.thicknessPct).toBeGreaterThanOrEqual(0));
  });

  it('orders profit rate Senior < Mezzanine < Subordinated', () => {
    const { tranches } = structurePool(fairPool);
    const sub = tranches.find((t) => t.name === 'Subordinated')!;
    const mez = tranches.find((t) => t.name === 'Mezzanine')!;
    const sen = tranches.find((t) => t.name === 'Senior')!;
    expect(sen.profitRate).toBeLessThan(mez.profitRate);
    expect(mez.profitRate).toBeLessThan(sub.profitRate);
  });

  it('rates a high-quality pool senior tranche investment-grade', () => {
    const goodPool = Array.from({ length: 10 }, () =>
      loan({ band: 'Excellent', principal: 5000, score: 850, fraudProb: 0 })
    );
    const sen = structurePool(goodPool).tranches.find((t) => t.name === 'Senior')!;
    expect(['AAA', 'AA']).toContain(sen.rating);
  });

  it('does NOT rate a deliberately poor pool senior tranche AAA (honest downgrade)', () => {
    const poorPool = Array.from({ length: 10 }, () =>
      loan({ band: 'Building', principal: 5000, score: 380, fraudProb: 0.6 })
    );
    const sen = structurePool(poorPool).tranches.find((t) => t.name === 'Senior')!;
    expect(sen.rating).not.toBe('AAA');
  });

  it('structures a single-loan pool without error and yields no tranches for an empty pool', () => {
    expect(structurePool([loan({})]).tranches.length).toBe(3);
    expect(structurePool([]).tranches).toEqual([]);
  });
});

describe('SAMPLE_POOL (seeded demo pool)', () => {
  it('is a substantial pool and structures into a sensible, investment-grade senior tranche', () => {
    expect(SAMPLE_POOL.length).toBeGreaterThan(500);
    const { summary, tranches } = structurePool(SAMPLE_POOL);
    expect(summary.totalPrincipal).toBeGreaterThan(1_000_000);

    const sumRM = tranches.reduce((a, t) => a + t.thicknessRM, 0);
    expect(sumRM).toBeCloseTo(summary.totalPrincipal, 2);

    const sen = tranches.find((t) => t.name === 'Senior')!;
    expect(['AAA', 'AA', 'A']).toContain(sen.rating);
  });
});
