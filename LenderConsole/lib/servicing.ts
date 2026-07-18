// lib/servicing.ts (Console IA split, 2026-07-18 design)
// Pure helpers shared by the pipeline rail (New/Referred/Archive) and the Servicing tab
// (the approved book): the one-chip priority rule so a card never shows two competing
// badges, and the Servicing list's sort order. No UI imports.

import { watchlistApplications, type ApplicationRecord } from './applications';
import type { LoanPerfStatus } from './performance';

export type ChipKind = 'watchlist' | 'delinquent' | 'late' | 'direct';

/** One-chip priority rule: a watchlist flag always wins (it is the most urgent signal),
 *  then a behind-schedule performance status, then the direct-apply provenance badge.
 *  A card renders at most one of these  never a wall of chips. */
export function chipKindFor(app: ApplicationRecord, isWatchlisted: boolean, perfStatus: LoanPerfStatus | null): ChipKind | null {
  if (isWatchlisted) return 'watchlist';
  if (perfStatus === 'delinquent') return 'delinquent';
  if (perfStatus === 'late') return 'late';
  if (app.source === 'direct') return 'direct';
  return null;
}

const recencyKey = (a: ApplicationRecord): string => a.resolvedAt ?? a.filedAt;
const byRecencyDesc = (a: ApplicationRecord, b: ApplicationRecord): number => recencyKey(b).localeCompare(recencyKey(a));

/** Servicing tab list order: watchlist-flagged loans first (most recently checked-in
 *  first, via watchlistApplications' own filtering), then every other approved loan by
 *  most-recently-disbursed first  the officer's attention goes where it's needed. */
export function orderServicingList(apps: ApplicationRecord[]): ApplicationRecord[] {
  const watchlist = watchlistApplications(apps);
  const watchlistIds = new Set(watchlist.map((a) => a.id));
  const rest = apps.filter((a) => a.status === 'approved' && !watchlistIds.has(a.id));
  return [...[...watchlist].sort(byRecencyDesc), ...rest.sort(byRecencyDesc)];
}
