import { computeStreak, lastActiveDay, type StreakInput } from '../src/lib/streak';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function day(offset: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function t(offset: number, source: StreakInput['source'] = 'extracted'): StreakInput {
  return { date: day(offset), createdAt: day(offset) + 'T09:00:00Z', source };
}

describe('lastActiveDay', () => {
  const todayUtc = Math.floor(NOW.getTime() / 86_400_000);

  it('returns null for an empty transaction list', () => {
    expect(lastActiveDay([], NOW)).toBeNull();
  });

  it('returns the UTC day number for a transaction today', () => {
    expect(lastActiveDay([t(0)], NOW)).toBe(todayUtc);
  });

  it('returns the day number of the most recent activity among several', () => {
    expect(lastActiveDay([t(5), t(2), t(7)], NOW)).toBe(todayUtc - 2);
  });

  it('ignores future-dated rows', () => {
    // Offset -1 is tomorrow
    expect(lastActiveDay([t(-1), t(1)], NOW)).toBe(todayUtc - 1);
  });

  it('prefers date over createdAt when both are present', () => {
    const txn: StreakInput = {
      date: day(3),
      createdAt: day(1) + 'T09:00:00Z',
    };
    expect(lastActiveDay([txn], NOW)).toBe(todayUtc - 3);
  });

  it('falls back to createdAt when date is absent or null', () => {
    const txn: StreakInput = {
      date: null,
      createdAt: day(2) + 'T10:00:00Z',
    };
    expect(lastActiveDay([txn], NOW)).toBe(todayUtc - 2);
  });
});

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

