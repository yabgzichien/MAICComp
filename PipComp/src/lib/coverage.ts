// src/lib/coverage.ts
// Pure, deterministic data-coverage metric  measures how complete the borrower's
// recorded financial picture is over the trailing 90 days. Counts distinct days that
// carry at least one *non-manual* transaction (manual entries are excluded as anti-
// gaming, mirroring the source-trust weighting in dataConfidence). Feeds into both
// computeDataConfidence (as a completeness term) and decideLoan (as a tier ceiling).
//
// No UI/DB imports  unit-tested.

import type { TxnSource } from './types';

/** Minimal transaction shape this module needs (a slice of Transaction). */
export interface CoverageInput {
  date?: string | null;
  createdAt: string;
  source: TxnSource;
}

export interface Coverage {
  /** 0..1  daysCovered / windowDays. */
  ratio: number;
  /** Distinct UTC days in the window that carry at least one contributing transaction. */
  daysCovered: number;
  /** Whole UTC days between `now` and the most recent contributing transaction. */
  recencyDays: number | null;
  /** Length of the trailing window in days (90 for v1). */
  windowDays: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Sources that contribute to coverage. Manual is excluded so the metric resists trivial gaming. */
const CONTRIBUTING_SOURCES: ReadonlySet<TxnSource> = new Set(['extracted', 'imported', 'verified']);

/** YYYY-MM-DD of an ISO datetime in UTC. Returns null if not parseable. */
function utcDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Inclusive day count between two UTC YYYY-MM-DD strings: |a - b| in days. */
function daysBetweenUTC(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.round(Math.abs(a - b) / 86_400_000);
}

/**
 * Compute the coverage signal over the trailing window ending at `now`.
 * Pure: same inputs → same output. UTC throughout for test determinism.
 */
export function computeCoverage(
  txns: CoverageInput[],
  now: Date = new Date(),
  windowDays: number = 90
): Coverage {
  const todayUtc = now.toISOString().slice(0, 10);
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1));
  const windowStartUtc = windowStart.toISOString().slice(0, 10);

  const distinctDays = new Set<string>();
  let mostRecent: string | null = null;

  for (const t of txns) {
    if (!CONTRIBUTING_SOURCES.has(t.source)) continue;
    const dayUtc = utcDate(t.date) ?? utcDate(t.createdAt);
    if (!dayUtc) continue;
    // Out of window (too old, or future-dated)
    if (dayUtc < windowStartUtc || dayUtc > todayUtc) continue;

    distinctDays.add(dayUtc);
    if (mostRecent === null || dayUtc > mostRecent) mostRecent = dayUtc;
  }

  const daysCovered = distinctDays.size;
  return {
    ratio: clamp(daysCovered / windowDays, 0, 1),
    daysCovered,
    recencyDays: mostRecent === null ? null : daysBetweenUTC(todayUtc, mostRecent),
    windowDays,
  };
}
