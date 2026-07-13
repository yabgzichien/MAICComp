import { describe, expect, it } from 'vitest';
import { formatPoolMoney, poolStatCells, ratingStyle, trancheViews } from './poolView';
import { structurePool, type PoolLoan } from './securitization';
import { SAMPLE_POOL } from './samplePool';

const loan = (over: Partial<PoolLoan>): PoolLoan => ({ id: 'x', principal: 5000, apr: 0.22, tenorMonths: 18, score: 680, band: 'Good', fraudProb: 0, ...over });

describe('formatPoolMoney', () => {
  it('formats millions, thousands, and small amounts', () => {
    expect(formatPoolMoney(6_535_450)).toBe('RM 6.54M');
    expect(formatPoolMoney(784_254)).toBe('RM 784K');
    expect(formatPoolMoney(500)).toBe('RM 500');
  });
});

describe('poolStatCells + trancheViews reflect the source pool', () => {
  it('the sample pool reproduces the believable headline numbers', () => {
    const cells = poolStatCells(structurePool(SAMPLE_POOL).summary);
    const byLabel = Object.fromEntries(cells.map((c) => [c.label, c.value]));
    expect(byLabel['Total Principal']).toBe('RM 6.54M');
    expect(byLabel['Loans Pooled']).toBe('1,000');
    expect(Number(byLabel['Wtd-Avg Score'])).toBeGreaterThan(600);
  });

  it('a small live book yields different headline numbers than the sample', () => {
    const book = [loan({ id: 'a', principal: 3000 }), loan({ id: 'b', principal: 4000, band: 'Strong' })];
    const live = poolStatCells(structurePool(book).summary);
    const sample = poolStatCells(structurePool(SAMPLE_POOL).summary);
    expect(live.find((c) => c.label === 'Total Principal')!.value).toBe('RM 7K');
    expect(live).not.toEqual(sample);
  });

  it('rating badge colour tracks the rating tier', () => {
    expect(ratingStyle('AAA').color).toBe(ratingStyle('A').color);
    expect(ratingStyle('BB').color).not.toBe(ratingStyle('AAA').color);
    expect(ratingStyle('Equity').color).not.toBe(ratingStyle('BB').color);
  });

  it('produces three tranche cards with integer slices summing to 100', () => {
    const views = trancheViews(structurePool(SAMPLE_POOL));
    expect(views.map((v) => v.seat)).toEqual(['Senior', 'Mezzanine', 'Subordinated']);
    expect(views.reduce((s, v) => s + v.pct, 0)).toBe(100);
  });
});
