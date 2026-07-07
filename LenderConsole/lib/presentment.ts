// Ported verbatim from PipComp/src/lib/presentment.ts (Brief G) — keep the two
// files in sync, same as the loans.ts / passport.ts port pairs.
//
// Pure anti-stacking helpers. A "presentment" is one verification of a passport at a lender.
// If the same passport is presented to (m)any lenders in a short window, that is classic
// loan-stacking — surface it. Pure + unit-tested; the lender console owns the log state.
//
// Production note: a real deployment shares the presentment log across lenders via a registry
// (the same backend that hosts issuer signing). The in-app log demonstrates the mechanic.

import type { CreditPassport } from './passport';

export interface Presentment {
  id: string;   // stable per borrower (the passport subject key)
  at: string;   // ISO timestamp of the presentment
  lender?: string;
}

/** Stable id for a passport — the subject public key uniquely identifies the borrower. */
export function presentmentKey(passport: CreditPassport): string {
  return passport.subject;
}

/**
 * Prior presentments of `id` within `windowHours` of `now`, most-recent first.
 * Used to decide whether to warn about possible stacking before recording a new one.
 */
export function findRecentPresentments(
  log: Presentment[],
  id: string,
  now: Date = new Date(),
  windowHours = 24
): Presentment[] {
  const cutoff = now.getTime() - windowHours * 3_600_000;
  return log
    .filter((p) => p.id === id)
    .filter((p) => {
      const t = new Date(p.at).getTime();
      return !Number.isNaN(t) && t >= cutoff && t <= now.getTime();
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Human-friendly "time ago" for a presentment timestamp. */
export function formatAgo(at: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(at).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} d ago`;
}
