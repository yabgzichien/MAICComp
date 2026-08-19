import { compute7DayDots, type StreakInput } from '../src/lib/streak';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function day(offset: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

function t(offset: number): StreakInput {
  return { date: day(offset), createdAt: day(offset) + 'T09:00:00Z' };
}

describe('compute7DayDots', () => {
  it('returns 7 false booleans when empty', () => {
    const dots = compute7DayDots([], NOW);
    expect(dots).toHaveLength(7);
    expect(dots).toEqual([false, false, false, false, false, false, false]);
  });

  it('returns true for today at index 6', () => {
    const dots = compute7DayDots([t(0)], NOW);
    expect(dots).toHaveLength(7);
    expect(dots).toEqual([false, false, false, false, false, false, true]);
  });

  it('correctly flags active days across the 7-day window', () => {
    // 6 days ago (index 0), 3 days ago (index 3), today (index 6)
    const dots = compute7DayDots([t(6), t(3), t(0)], NOW);
    expect(dots).toHaveLength(7);
    expect(dots).toEqual([true, false, false, true, false, false, true]);
  });

  it('ignores activity older than 7 days', () => {
    const dots = compute7DayDots([t(8), t(10)], NOW);
    expect(dots).toEqual([false, false, false, false, false, false, false]);
  });
});
