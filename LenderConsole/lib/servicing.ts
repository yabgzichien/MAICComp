// lib/servicing.ts (Console IA split, 2026-07-18; settled loans, 2026-07-18 stats/advisor
// design). Pure helpers shared by the pipeline rail (New/Referred/Archive) and the
// Servicing tab (the approved book): the one-chip priority rule so a card never shows two
// competing badges, the settled predicate, and the Servicing tab's three-section sort
// order (watchlist / active / settled). No UI imports.

import { watchlistApplications, type ApplicationRecord } from './applications';
import { mapBook } from './portfolio';
import { loanPerformance, type LoanPerfStatus } from './performance';

export type ChipKind = 'defaulted' | 'watchlist' | 'settled' | 'delinquent' | 'late' | 'direct';

/** One-chip priority rule: a default is the most terminal signal there is (a realized
 *  loss, not just a delinquency) so it wins over everything, including watchlist  then a
 *  watchlist flag (the most urgent signal short of a default), then settled (nothing left
 *  to watch for  in practice mutually exclusive with watchlist per orderServicingSections,
 *  but the priority order stays explicit here so the rule reads completely on its own),
 *  then a behind-schedule performance status, then the direct-apply provenance badge. A
 *  card renders at most one of these  never a wall of chips. */
export function chipKindFor(app: ApplicationRecord, isWatchlisted: boolean, perfStatus: LoanPerfStatus | null, settled: boolean = false): ChipKind | null {
  if (app.defaulted?.value) return 'defaulted';
  if (isWatchlisted) return 'watchlist';
  if (settled) return 'settled';
  if (perfStatus === 'delinquent') return 'delinquent';
  if (perfStatus === 'late') return 'late';
  if (app.source === 'direct') return 'direct';
  return null;
}

/**
 * A loan is settled once its recorded paid instalments reach the loan's full tenor.
 * Because a missed instalment permanently occupies one schedule slot without ever
 * counting toward `paidCount` (loanPerformance's own definition), a loan with any missed
 * instalment can never reach settled  "settled" and "zero realized loss" coincide by
 * construction, never by a separate check. Reuses loanPerformance so there is exactly one
 * place that knows what "paid" means; `now` doesn't affect paidCount/tenorMonths, only the
 * (unused here) dueCount/status fields, so it's safe to compute regardless of the clock.
 */
export function isSettled(app: ApplicationRecord): boolean {
  const book = mapBook([app]);
  if (book.length === 0) return false;
  const perf = loanPerformance(book[0]);
  return perf.tenorMonths > 0 && perf.paidCount >= perf.tenorMonths;
}

const recencyKey = (a: ApplicationRecord): string => a.resolvedAt ?? a.filedAt;
const byRecencyDesc = (a: ApplicationRecord, b: ApplicationRecord): number => recencyKey(b).localeCompare(recencyKey(a));

export interface ServicingSections {
  /** Approved and defaulted  a realized loss, terminal, and (per the servicing-sync
   *  design) deliberately NOT excluded from the book the way settled is: unlike a settled
   *  loan there is exposure lost here, so it stays visible as its own section rather than
   *  quietly dropping out of servicing. Pulled out before every other section, including
   *  watchlist  a defaulted loan is never also shown as watchlisted/active/settled. */
  defaulted: ApplicationRecord[];
  /** Approved, not defaulted, not settled, with active check-in flags. Most urgent short
   *  of a default  a loan never appears here once it settles, even if an earlier
   *  check-in flagged it. */
  watchlist: ApplicationRecord[];
  /** Approved, not defaulted, not settled, not watchlisted  the ordinary in-progress book. */
  active: ApplicationRecord[];
  /** Approved, not defaulted, and fully repaid  nothing left to monitor or service. */
  settled: ApplicationRecord[];
}

/** Servicing tab section order: defaulted first (the most terminal state), then watchlist
 *  (most recently checked-in first, via watchlistApplications' own filtering), then active
 *  loans, then settled loans  each section by most-recently-disbursed first. Settled and
 *  defaulted both exclude from watchlist by definition, regardless of any check-in flags a
 *  loan happens to carry. */
export function orderServicingSections(apps: ApplicationRecord[]): ServicingSections {
  const approvedApps = apps.filter((a) => a.status === 'approved');
  const defaultedIds = new Set(approvedApps.filter((a) => a.defaulted?.value).map((a) => a.id));
  const defaulted = approvedApps.filter((a) => defaultedIds.has(a.id));
  const notDefaulted = approvedApps.filter((a) => !defaultedIds.has(a.id));

  const settledIds = new Set(notDefaulted.filter(isSettled).map((a) => a.id));
  const settled = notDefaulted.filter((a) => settledIds.has(a.id));
  const notSettled = notDefaulted.filter((a) => !settledIds.has(a.id));

  const watchlist = watchlistApplications(notSettled);
  const watchlistIds = new Set(watchlist.map((a) => a.id));
  const active = notSettled.filter((a) => !watchlistIds.has(a.id));

  return {
    defaulted: [...defaulted].sort(byRecencyDesc),
    watchlist: [...watchlist].sort(byRecencyDesc),
    active: [...active].sort(byRecencyDesc),
    settled: [...settled].sort(byRecencyDesc),
  };
}
