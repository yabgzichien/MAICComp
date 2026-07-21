// lib/servicingSync.ts (Bidirectional Servicing Sync, 2026-07-18 design)
// Client-safe glue between the shared servicing record (mergeServicing.ts) and the
// console's own local ApplicationRecord shape. Pure  no fetch, no fs; Console.tsx does the
// actual network calls (write-through POST, poll-on-focus GET) and hands the parsed
// ServicingRecord to mergeAppWithServicing, and reads servicingWritePayload to build the
// POST body. Kept as its own module (not folded into applications.ts or servicing.ts) since
// it's the one place that knows about the wire format; everything else here only knows the
// local shape.

import { mergeServicing, type ServicingEvent, type ServicingRecord } from './mergeServicing';
import type { ApplicationRecord, RepaymentEvent } from './applications';
import { mapBook } from './portfolio';

/** Build the console's own view of `app` as a ServicingRecord, so it can be merged against
 *  the server's via the same pure mergeServicing rule both apps port. Every local repayment
 *  is attributed source: 'lender'  the console's own ledger is, by construction, everything
 *  this console itself recorded. `tenorMonths` comes from mapBook (the console's derived
 *  schedule); 0 (absent) for a record mapBook can't schedule (no offer / unparseable code),
 *  matching mergeServicing's own "absent" convention. */
export function appToServicingView(app: ApplicationRecord, lenderId: string): ServicingRecord {
  const book = mapBook([app]);
  const tenorMonths = book.length > 0 ? book[0].loan.tenorMonths : 0;
  const events: ServicingEvent[] = (app.repayments ?? []).map((r) => ({
    instalmentSeq: r.instalmentSeq,
    outcome: r.outcome,
    at: r.at,
    source: 'lender',
  }));
  return {
    subject: app.subject,
    lenderId,
    tenorMonths,
    installment: app.installment,
    events,
    defaulted: app.defaulted ?? { value: false, at: app.filedAt, source: 'lender' },
    updatedAt: app.audit[app.audit.length - 1]?.at ?? app.filedAt,
  };
}

/** Build the POST /api/servicing body for one write-through action on `app`: either a
 *  repayment event or a default raise, never both (mirrors the route's own "exactly one of
 *  event or default" contract). Seeds tenorMonths/installment from the console's own decided
 *  terms on every write  harmless once the server record already has them, since
 *  mergeServicing's coordinate rule only fills an absent (0) value; necessary on the very
 *  first write for this loan, when the server has no record yet. Returns null when `app`
 *  can't be scheduled (no offer / unparseable passport)  there is nothing coherent to sync. */
export function servicingWritePayload(
  app: ApplicationRecord,
  lenderId: string,
  write: { event: { instalmentSeq: number; outcome: RepaymentEvent['outcome'] } } | { default: true },
): Record<string, unknown> | null {
  const book = mapBook([app]);
  if (book.length === 0) return null;
  return {
    subject: app.subject,
    lenderId,
    source: 'lender',
    tenorMonths: book[0].loan.tenorMonths,
    installment: app.installment,
    ...write,
  };
}

/**
 * Merge a server-returned ServicingRecord into `app`: builds the console's own local view,
 * runs it through the same pure mergeServicing rule, and maps the result back onto the
 * local shape (repayments[] amounts are derived from the loan's own installment, since raw
 * amounts never cross the wire  only per-instalment outcomes do). Returns `{ app, changed:
 * false }` unchanged when the server carried nothing new, so a caller can skip re-persisting
 * on every poll tick. New audit lines are added only for what the server actually
 * contributed (a borrower-recorded event, or a default this console hadn't seen yet)  a
 * poll that returns exactly what's already known produces no audit noise.
 */
export function mergeAppWithServicing(app: ApplicationRecord, lenderId: string, server: ServicingRecord): { app: ApplicationRecord; changed: boolean } {
  const local = appToServicingView(app, lenderId);
  const merged = mergeServicing(local, server);

  const localBySeq = new Map(local.events.map((e) => [e.instalmentSeq, e]));
  const newOrChangedEvents = merged.events.filter((e) => {
    const l = localBySeq.get(e.instalmentSeq);
    return !l || l.at !== e.at || l.outcome !== e.outcome;
  });
  const defaultedChanged = merged.defaulted.value && !local.defaulted.value;

  if (newOrChangedEvents.length === 0 && !defaultedChanged) return { app, changed: false };

  const repayments: RepaymentEvent[] = merged.events.map((e) => ({
    at: e.at,
    instalmentSeq: e.instalmentSeq,
    amount: e.outcome === 'missed' ? 0 : merged.installment || app.installment,
    outcome: e.outcome,
  }));

  const auditFromEvents = newOrChangedEvents.map((e) => ({
    at: e.at,
    action: 'repayment',
    detail: `instalment ${e.instalmentSeq}: ${e.outcome} (synced from ${e.source === 'borrower' ? 'the borrower app' : 'this console'})`,
  }));
  const auditFromDefault = defaultedChanged
    ? [{ at: merged.defaulted.at, action: 'defaulted', detail: `reported ${merged.defaulted.source === 'borrower' ? 'by the borrower app' : 'by this console'} (synced). Loan written off.` }]
    : [];

  return {
    app: {
      ...app,
      repayments,
      ...(defaultedChanged ? { defaulted: merged.defaulted } : {}),
      audit: [...app.audit, ...auditFromEvents, ...auditFromDefault],
    },
    changed: true,
  };
}
