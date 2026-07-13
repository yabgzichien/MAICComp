import {
  findRecentPresentments,
  formatAgo,
  presentmentKey,
  type Presentment,
} from '../src/lib/presentment';
import type { CreditPassport } from '../src/lib/passport';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function p(id: string, hoursAgo: number): Presentment {
  return { id, at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString() };
}

describe('presentmentKey', () => {
  it('uses the passport subject as the stable id', () => {
    const passport = { subject: 'abc123' } as CreditPassport;
    expect(presentmentKey(passport)).toBe('abc123');
  });
});

describe('findRecentPresentments', () => {
  it('returns nothing for an empty log', () => {
    expect(findRecentPresentments([], 'x', NOW)).toEqual([]);
  });

  it('finds prior presentments of the same id within the window, most-recent first', () => {
    const log = [p('x', 1), p('x', 5), p('y', 2)];
    const hits = findRecentPresentments(log, 'x', NOW, 24);
    expect(hits).toHaveLength(2);
    expect(new Date(hits[0].at).getTime()).toBeGreaterThan(new Date(hits[1].at).getTime());
  });

  it('excludes presentments outside the window', () => {
    const log = [p('x', 30)]; // 30h ago, window 24h
    expect(findRecentPresentments(log, 'x', NOW, 24)).toEqual([]);
  });

  it('excludes other borrowers', () => {
    const log = [p('y', 1), p('z', 1)];
    expect(findRecentPresentments(log, 'x', NOW, 24)).toEqual([]);
  });
});

describe('formatAgo', () => {
  it('formats minutes, hours, and days', () => {
    expect(formatAgo(new Date(NOW.getTime() - 30 * 1000).toISOString(), NOW)).toBe('just now');
    expect(formatAgo(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5 min ago');
    expect(formatAgo(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), NOW)).toBe('3 h ago');
    expect(formatAgo(new Date(NOW.getTime() - 2 * 86_400_000).toISOString(), NOW)).toBe('2 d ago');
  });
});
