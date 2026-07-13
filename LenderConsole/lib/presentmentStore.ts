// Console-side persistence for the presentment log (Brief G). localStorage-backed
// and per-console by design  the honest simplification presentment.ts documents:
// a real deployment shares this log across lenders via a registry. Storage is
// injectable so the pure behavior is testable without a browser; without any
// storage (SSR render pass) reads return [] and writes are no-ops.

import type { Presentment } from './presentment';

const LOG_KEY = 'pip-presentment-log';

function defaultStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function isPresentment(x: unknown): x is Presentment {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.at === 'string';
}

/** The stored log, oldest first. Corrupted or malformed entries are dropped, never thrown. */
export function readPresentmentLog(storage: Storage | null = defaultStorage()): Presentment[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPresentment) : [];
  } catch {
    return [];
  }
}

/** Append one presentment to the stored log. */
export function recordPresentment(entry: Presentment, storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(LOG_KEY, JSON.stringify([...readPresentmentLog(storage), entry]));
  } catch {
    // Quota/security errors degrade to "no log", same as SSR  never break verification.
  }
}
