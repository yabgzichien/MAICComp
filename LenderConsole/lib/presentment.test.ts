// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Pure anti-stacking helpers (Brief G), ported verbatim from PipComp's presentment.ts.
import { describe, expect, it } from 'vitest';
import { findRecentPresentments, formatAgo, presentmentKey, type Presentment } from './presentment';
import type { CreditPassport } from './passport';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('presentmentKey', () => {
  it('is the passport\'s subject public key', () => {
    const p = { subject: 'abc123' } as CreditPassport;
    expect(presentmentKey(p)).toBe('abc123');
  });
});

describe('findRecentPresentments', () => {
  const at = (hoursAgo: number): string => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

  it('filters to only the matching id', () => {
    const log: Presentment[] = [{ id: 'a', at: at(1) }, { id: 'b', at: at(1) }];
    expect(findRecentPresentments(log, 'a', NOW)).toHaveLength(1);
  });

  it('includes a presentment exactly at the window cutoff (inclusive lower bound)', () => {
    const log: Presentment[] = [{ id: 'a', at: at(24) }];
    expect(findRecentPresentments(log, 'a', NOW, 24)).toHaveLength(1);
  });

  it('excludes a presentment just outside the window', () => {
    const log: Presentment[] = [{ id: 'a', at: at(24.01) }];
    expect(findRecentPresentments(log, 'a', NOW, 24)).toHaveLength(0);
  });

  it('excludes a presentment timestamped after "now"', () => {
    const log: Presentment[] = [{ id: 'a', at: new Date(NOW.getTime() + 60_000).toISOString() }];
    expect(findRecentPresentments(log, 'a', NOW)).toHaveLength(0);
  });

  it('excludes a presentment with an unparsable timestamp rather than throwing', () => {
    const log: Presentment[] = [{ id: 'a', at: 'not-a-date' }];
    expect(() => findRecentPresentments(log, 'a', NOW)).not.toThrow();
    expect(findRecentPresentments(log, 'a', NOW)).toHaveLength(0);
  });

  it('sorts most-recent first', () => {
    const log: Presentment[] = [{ id: 'a', at: at(10) }, { id: 'a', at: at(1) }, { id: 'a', at: at(5) }];
    const found = findRecentPresentments(log, 'a', NOW);
    expect(found.map((p) => p.at)).toEqual([at(1), at(5), at(10)]);
  });

  it('defaults to a 24-hour window when not specified', () => {
    const log: Presentment[] = [{ id: 'a', at: at(23) }, { id: 'a', at: at(25) }];
    expect(findRecentPresentments(log, 'a', NOW)).toHaveLength(1);
  });

  it('an empty log returns an empty result', () => {
    expect(findRecentPresentments([], 'a', NOW)).toEqual([]);
  });
});

describe('formatAgo', () => {
  it('reads "just now" for anything under a minute', () => {
    expect(formatAgo(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe('just now');
    expect(formatAgo(NOW.toISOString(), NOW)).toBe('just now');
  });

  it('reads "just now" for a future timestamp rather than a negative duration', () => {
    expect(formatAgo(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe('just now');
  });

  it('reads "just now" for an unparsable timestamp', () => {
    expect(formatAgo('not-a-date', NOW)).toBe('just now');
  });

  it('reads minutes for 1-59 minutes', () => {
    expect(formatAgo(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5 min ago');
    expect(formatAgo(new Date(NOW.getTime() - 59 * 60_000).toISOString(), NOW)).toBe('59 min ago');
  });

  it('reads hours for 1-23 hours', () => {
    expect(formatAgo(new Date(NOW.getTime() - 60 * 60_000).toISOString(), NOW)).toBe('1 h ago');
    expect(formatAgo(new Date(NOW.getTime() - 23 * 3_600_000).toISOString(), NOW)).toBe('23 h ago');
  });

  it('reads days at 24+ hours', () => {
    expect(formatAgo(new Date(NOW.getTime() - 24 * 3_600_000).toISOString(), NOW)).toBe('1 d ago');
    expect(formatAgo(new Date(NOW.getTime() - 72 * 3_600_000).toISOString(), NOW)).toBe('3 d ago');
  });
});
