// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Console-side persistence for the presentment log (Brief G) — localStorage-backed,
// injectable storage, SSR-safe.
import { describe, expect, it } from 'vitest';
import { readPresentmentLog, recordPresentment } from './presentmentStore';
import type { Presentment } from './presentment';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('readPresentmentLog', () => {
  it('reads back an empty log when nothing is stored', () => {
    expect(readPresentmentLog(fakeStorage())).toEqual([]);
  });

  it('returns an empty array on corrupted JSON rather than throwing', () => {
    expect(() => readPresentmentLog(fakeStorage({ 'pip-presentment-log': '{not json' }))).not.toThrow();
    expect(readPresentmentLog(fakeStorage({ 'pip-presentment-log': '{not json' }))).toEqual([]);
  });

  it('drops malformed entries but keeps well-formed ones', () => {
    const raw = JSON.stringify([{ id: 'a', at: '2026-06-01T00:00:00.000Z' }, { junk: true }, { id: 'b' }]);
    const log = readPresentmentLog(fakeStorage({ 'pip-presentment-log': raw }));
    expect(log).toEqual([{ id: 'a', at: '2026-06-01T00:00:00.000Z' }]);
  });

  it('is SSR-safe: no storage means an empty read', () => {
    expect(readPresentmentLog(null)).toEqual([]);
  });
});

describe('recordPresentment', () => {
  it('appends a new entry to an empty log', () => {
    const s = fakeStorage();
    const entry: Presentment = { id: 'a', at: '2026-06-01T00:00:00.000Z', lender: 'TEKUN' };
    recordPresentment(entry, s);
    expect(readPresentmentLog(s)).toEqual([entry]);
  });

  it('appends to an existing log, preserving prior entries in order', () => {
    const s = fakeStorage();
    const first: Presentment = { id: 'a', at: '2026-06-01T00:00:00.000Z' };
    const second: Presentment = { id: 'b', at: '2026-06-02T00:00:00.000Z' };
    recordPresentment(first, s);
    recordPresentment(second, s);
    expect(readPresentmentLog(s)).toEqual([first, second]);
  });

  it('is a no-op (never throws) when storage is unavailable (SSR)', () => {
    expect(() => recordPresentment({ id: 'a', at: '2026-06-01T00:00:00.000Z' }, null)).not.toThrow();
  });

  it('degrades silently on a storage write failure (e.g. quota exceeded)', () => {
    const s = fakeStorage();
    const failing: Storage = {
      ...s,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(() => recordPresentment({ id: 'a', at: '2026-06-01T00:00:00.000Z' }, failing)).not.toThrow();
  });
});

// ── Lender Tenancy spec: no cross-lender leakage ──────────────────────────────
// A TEKUN presentment must not trigger another lender's stacking warning  the shared
// cross-lender registry is exactly what the backend MVP sells, not this per-console log.

describe('lender scoping', () => {
  it("a TEKUN presentment (default lender id) does not appear in another lender's log", () => {
    const s = fakeStorage();
    recordPresentment({ id: 'shared-subject', at: '2026-06-01T00:00:00.000Z' }, s);
    expect(readPresentmentLog(s)).toHaveLength(1);
    expect(readPresentmentLog(s, 'koperasi-sejahtera')).toEqual([]);
  });

  it('two lenders keep fully independent logs in the same storage', () => {
    const s = fakeStorage();
    recordPresentment({ id: 'shared-subject', at: '2026-06-01T00:00:00.000Z' }, s, 'tekun');
    recordPresentment({ id: 'shared-subject', at: '2026-06-02T00:00:00.000Z' }, s, 'koperasi-sejahtera');
    expect(readPresentmentLog(s, 'tekun')).toHaveLength(1);
    expect(readPresentmentLog(s, 'koperasi-sejahtera')).toHaveLength(1);
    expect(readPresentmentLog(s, 'dana-niaga')).toEqual([]);
  });

  it("omitting lenderId defaults to TEKUN and reads the pre-tenancy unsuffixed key (back-compat)", () => {
    const s = fakeStorage({ 'pip-presentment-log': JSON.stringify([{ id: 'legacy', at: '2026-01-01T00:00:00.000Z' }]) });
    expect(readPresentmentLog(s)).toEqual([{ id: 'legacy', at: '2026-01-01T00:00:00.000Z' }]);
    expect(readPresentmentLog(s, 'tekun')).toEqual([{ id: 'legacy', at: '2026-01-01T00:00:00.000Z' }]);
  });
});
