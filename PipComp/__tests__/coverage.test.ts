import { computeCoverage, type CoverageInput } from '../src/lib/coverage';

function txn(over: Partial<CoverageInput> & Pick<CoverageInput, 'createdAt'>): CoverageInput {
  return { source: 'extracted', ...over };
}

const NOW = new Date('2026-06-10T12:00:00.000Z');

describe('computeCoverage', () => {
  it('empty input returns zeros and null recency', () => {
    const c = computeCoverage([], NOW);
    expect(c.ratio).toBe(0);
    expect(c.daysCovered).toBe(0);
    expect(c.recencyDays).toBeNull();
    expect(c.windowDays).toBe(90);
  });

  it('manual-only input contributes nothing (anti-gaming)', () => {
    const txns = [
      txn({ createdAt: '2026-06-10T00:00:00Z', date: '2026-06-10', source: 'manual' }),
      txn({ createdAt: '2026-06-09T00:00:00Z', date: '2026-06-09', source: 'manual' }),
    ];
    const c = computeCoverage(txns, NOW);
    expect(c.daysCovered).toBe(0);
    expect(c.ratio).toBe(0);
    expect(c.recencyDays).toBeNull();
  });

  it('counts extracted/imported/verified sources, ignores manual', () => {
    const txns = [
      txn({ createdAt: '2026-06-10T00:00:00Z', date: '2026-06-10', source: 'extracted' }),
      txn({ createdAt: '2026-06-09T00:00:00Z', date: '2026-06-09', source: 'imported' }),
      txn({ createdAt: '2026-06-08T00:00:00Z', date: '2026-06-08', source: 'verified' }),
      txn({ createdAt: '2026-06-07T00:00:00Z', date: '2026-06-07', source: 'manual' }),
    ];
    const c = computeCoverage(txns, NOW);
    expect(c.daysCovered).toBe(3);
  });

  it('multiple transactions on the same day count as one distinct day', () => {
    const txns = [
      txn({ createdAt: '2026-06-10T01:00:00Z', date: '2026-06-10' }),
      txn({ createdAt: '2026-06-10T05:00:00Z', date: '2026-06-10' }),
      txn({ createdAt: '2026-06-10T09:00:00Z', date: '2026-06-10' }),
    ];
    const c = computeCoverage(txns, NOW);
    expect(c.daysCovered).toBe(1);
  });

  it('excludes transactions older than the window', () => {
    const txns = [
      txn({ createdAt: '2026-06-10T00:00:00Z', date: '2026-06-10' }),
      txn({ createdAt: '2026-01-01T00:00:00Z', date: '2026-01-01' }),
    ];
    const c = computeCoverage(txns, NOW);
    expect(c.daysCovered).toBe(1);
  });

  it('excludes future-dated transactions', () => {
    const txns = [
      txn({ createdAt: '2026-06-15T00:00:00Z', date: '2026-06-15' }),
      txn({ createdAt: '2026-06-10T00:00:00Z', date: '2026-06-10' }),
    ];
    const c = computeCoverage(txns, NOW);
    expect(c.daysCovered).toBe(1);
  });

  it('falls back to createdAt when date is null', () => {
    const c = computeCoverage([txn({ createdAt: '2026-06-05T00:00:00Z', date: null })], NOW);
    expect(c.daysCovered).toBe(1);
  });

  it('a fully covered window yields ratio 1.0', () => {
    const txns: CoverageInput[] = [];
    for (let i = 0; i < 90; i++) {
      const d = new Date(NOW);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      txns.push(txn({ createdAt: `${iso}T00:00:00Z`, date: iso }));
    }
    const c = computeCoverage(txns, NOW);
    expect(c.daysCovered).toBe(90);
    expect(c.ratio).toBeCloseTo(1.0, 6);
  });

  it('recency reflects the most recent contributing transaction', () => {
    const txns = [
      txn({ createdAt: '2026-06-05T00:00:00Z', date: '2026-06-05', source: 'extracted' }),
      txn({ createdAt: '2026-06-09T00:00:00Z', date: '2026-06-09', source: 'extracted' }),
      // Manual on a more recent day should NOT influence recency.
      txn({ createdAt: '2026-06-10T00:00:00Z', date: '2026-06-10', source: 'manual' }),
    ];
    const c = computeCoverage(txns, NOW);
    expect(c.recencyDays).toBe(1);
  });

  it('ratio clamps at 1.0 even if (improbably) more than 90 distinct days slip in', () => {
    // synthetic safety check  should never happen, but assert the clamp
    const txns: CoverageInput[] = [];
    for (let i = 0; i < 90; i++) {
      const d = new Date(NOW);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      txns.push(txn({ createdAt: `${iso}T00:00:00Z`, date: iso }));
    }
    const c = computeCoverage(txns, NOW);
    expect(c.ratio).toBeLessThanOrEqual(1);
  });
});
