// Console-side persistence for the presentment log (Brief G). localStorage-backed
// and per-console by design  the honest simplification presentment.ts documents:
// a real deployment shares this log across lenders via a registry. Storage is
// injectable so the pure behavior is testable without a browser; without any
// storage (SSR render pass) reads return [] and writes are no-ops.
//
// Keyed by lender id (Lender Tenancy spec, 2026-07-12): a presentment at TEKUN must
// never trigger Koperasi's stacking warning  that's the honest gap the shared
// cross-lender registry (backend MVP) exists to close, not this per-console log.
// `lenderId` defaults to 'tekun', keeping the original, unsuffixed key.

import type { Presentment } from './presentment';

const LOG_KEY = 'pip-presentment-log';
const DEFAULT_LENDER_ID = 'tekun';

function keyFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? LOG_KEY : `${LOG_KEY}:${lenderId}`;
}

function defaultStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function isPresentment(x: unknown): x is Presentment {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.at === 'string';
}

/** The stored log, oldest first, for `lenderId`. Corrupted or malformed entries are
 *  dropped, never thrown. */
export function readPresentmentLog(storage: Storage | null = defaultStorage(), lenderId: string = DEFAULT_LENDER_ID): Presentment[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(keyFor(lenderId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPresentment) : [];
  } catch {
    return [];
  }
}

/** Append one presentment to `lenderId`'s stored log. */
export function recordPresentment(entry: Presentment, storage: Storage | null = defaultStorage(), lenderId: string = DEFAULT_LENDER_ID): void {
  if (!storage) return;
  try {
    storage.setItem(keyFor(lenderId), JSON.stringify([...readPresentmentLog(storage, lenderId), entry]));
  } catch {
    // Quota/security errors degrade to "no log", same as SSR  never break verification.
  }
}

/** Wipe `lenderId`'s stored log entirely (console reset-to-defaults). */
export function clearPresentmentLog(storage: Storage | null = defaultStorage(), lenderId: string = DEFAULT_LENDER_ID): void {
  if (!storage) return;
  try {
    storage.removeItem(keyFor(lenderId));
  } catch {
    // Best-effort; a failed clear just leaves the log as-is.
  }
}
