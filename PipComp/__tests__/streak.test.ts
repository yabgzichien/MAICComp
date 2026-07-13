import { computeStreak, type StreakInput } from '../src/lib/streak';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function day(offset: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function t(offset: number, source: StreakInput['source'] = 'extracted'): StreakInput {
  return { date: day(offset), createdAt: day(offset) + 'T09:00:00Z', source };
}

describe('computeStreak', () => {
  it('is 0 for no transactions', () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  it('is 1 for a single transaction today', () => {
    expect(computeStreak([t(0)], NOW)).toBe(1);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak([t(0), t(1), t(2)], NOW)).toBe(3);
  });

  it('counts multiple transactions on the same day once', () => {
    expect(computeStreak([t(0), t(0), t(1)], NOW)).toBe(2);
  });

  it('allows a one-day gap (grace)  recording every two days keeps the streak alive', () => {
    expect(computeStreak([t(0), t(2), t(4)], NOW)).toBe(3);
  });

  it('breaks the streak when a gap exceeds the grace window', () => {
    // today + 4 days ago: gap of 4 breaks → only today counts
    expect(computeStreak([t(0), t(4)], NOW)).toBe(1);
  });

  it('is 0 when the most recent activity is older than the grace window (lapsed)', () => {
    expect(computeStreak([t(3), t(4)], NOW)).toBe(0);
  });

  it('stays alive when last activity was yesterday or two days ago', () => {
    expect(computeStreak([t(1), t(2)], NOW)).toBe(2);
  });

  it('counts manual entries too (streak is motivation, not a credit signal)', () => {
    expect(computeStreak([t(0, 'manual'), t(1, 'manual')], NOW)).toBe(2);
  });
});
