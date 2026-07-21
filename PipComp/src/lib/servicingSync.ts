// src/lib/servicingSync.ts (Bidirectional Servicing Sync, 2026-07-18 design)
// Pure glue between the shared servicing record (mergeServicing.ts) and the borrower app's
// own SQLite-backed repayment schedule. No I/O  store.tsx does the actual DB reads/writes
// and network calls (write-through POST, poll-on-focus GET); this only computes what should
// change. Mirrors LenderConsole/lib/servicingSync.ts's role, adapted to this app's local
// shape (a due-date-ordered Repayment[] instead of an in-memory ApplicationRecord).

import { mergeServicing, type ServicingEvent, type ServicingOutcome, type ServicingRecord } from './mergeServicing';
import type { LoanApplication, Repayment, RepaymentStatus } from '../db/loansRepo';

function toOutcome(status: RepaymentStatus): ServicingOutcome | null {
  if (status === 'paid') return 'on-time';
  if (status === 'late') return 'late';
  if (status === 'missed') return 'missed';
  return null; // 'scheduled' (not due yet) or the per-instalment 'defaulted' value (unused by any writer today)
}

/**
 * Build the borrower's own view of one loan as a ServicingRecord, so it can be merged
 * against the server's via the same pure mergeServicing rule both apps port. `repayments`
 * must already be ordered by due date ascending (listRepayments's own order  the same order
 * the schedule was written in), since array position doubles as instalmentSeq: neither this
 * app nor the console persists an explicit sequence column.
 */
export function loanToServicingView(subject: string, application: LoanApplication, repayments: Repayment[]): ServicingRecord {
  const events: ServicingEvent[] = [];
  repayments.forEach((r, i) => {
    const outcome = toOutcome(r.status);
    if (outcome) events.push({ instalmentSeq: i + 1, outcome, at: r.paidOn ?? r.dueDate, source: 'borrower' });
  });
  return {
    subject,
    lenderId: application.lenderId ?? '',
    tenorMonths: repayments.length,
    installment: repayments[0]?.amount ?? 0,
    events,
    defaulted: application.defaultedAt
      ? { value: true, at: application.defaultedAt, source: application.defaultedSource ?? 'borrower' }
      : { value: false, at: application.createdAt, source: 'borrower' },
    updatedAt: application.createdAt,
  };
}

/**
 * Build the POST /api/servicing body for one write-through action: either a repayment event
 * or a default raise, never both (mirrors the route's own "exactly one of event or default"
 * contract). Seeds tenorMonths/installment on every write  harmless once the server record
 * already has them (mergeServicing's coordinate rule only fills an absent value), necessary
 * on the very first write for this loan. Returns null when the loan has no lenderId (a
 * self-decided application, never routed through a lender  there is nothing to sync).
 */
export function servicingWritePayload(
  subject: string,
  application: LoanApplication,
  tenorMonths: number,
  installment: number,
  write: { event: { instalmentSeq: number; outcome: ServicingOutcome } } | { default: true },
): Record<string, unknown> | null {
  if (!application.lenderId) return null;
  return {
    subject,
    lenderId: application.lenderId,
    source: 'borrower',
    tenorMonths,
    installment,
    ...write,
  };
}

export interface ServicingMergeResult {
  changed: boolean;
  /** Repayment rows whose outcome needs writing locally (the server contributed something
   *  new, or different from what's already stored). */
  repaymentUpdates: { repaymentId: string; outcome: ServicingOutcome; at: string }[];
  /** Present when the merge raised a default not yet reflected in `application` as passed in. */
  newDefault: { at: string; source: 'lender' | 'borrower' } | null;
}

/**
 * Merge a server-returned ServicingRecord into the borrower's own local view and compute
 * what needs writing back to SQLite. Pure  store.tsx applies `repaymentUpdates` via
 * setRepaymentOutcome and `newDefault` via markApplicationDefaulted; this only decides what
 * changed, the same split LenderConsole/lib/servicingSync.ts's mergeAppWithServicing keeps
 * between "what changed" (pure) and "how to persist it" (the caller's I/O).
 */
export function mergeLoanWithServicing(subject: string, application: LoanApplication, repayments: Repayment[], server: ServicingRecord): ServicingMergeResult {
  const local = loanToServicingView(subject, application, repayments);
  const merged = mergeServicing(local, server);

  const localBySeq = new Map(local.events.map((e) => [e.instalmentSeq, e]));
  const repaymentUpdates: { repaymentId: string; outcome: ServicingOutcome; at: string }[] = [];
  for (const e of merged.events) {
    const l = localBySeq.get(e.instalmentSeq);
    if (l && l.at === e.at && l.outcome === e.outcome) continue;
    const repayment = repayments[e.instalmentSeq - 1];
    if (repayment) repaymentUpdates.push({ repaymentId: repayment.id, outcome: e.outcome, at: e.at });
  }

  const defaultedChanged = merged.defaulted.value && !local.defaulted.value;
  const newDefault = defaultedChanged ? { at: merged.defaulted.at, source: merged.defaulted.source } : null;

  return { changed: repaymentUpdates.length > 0 || defaultedChanged, repaymentUpdates, newDefault };
}
