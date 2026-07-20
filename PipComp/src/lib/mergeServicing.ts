// src/lib/mergeServicing.ts (Bidirectional Servicing Sync, 2026-07-18 design)
// Pure merge rule for the one shared repayment ledger per loan, ported byte-identical to
// LenderConsole/lib/mergeServicing.ts (kept in sync, the loans.ts / passport.ts port-pair
// convention). No I/O, no UI imports  the server route and both apps' local stores all
// call this same function so "what does a merge produce" only has one definition.
//
// Commutative and order-independent by construction: mergeServicing(a, b) always equals
// mergeServicing(b, a), so it doesn't matter which side is "local" and which is "server"
// when calling it, and repeated merges of the same two records are idempotent.

export type ServicingOutcome = 'on-time' | 'late' | 'missed';
export type ServicingSource = 'lender' | 'borrower';

/** One per-instalment servicing outcome. `at` is the tiebreaker on a same-instalment
 *  conflict (a correction supersedes  the later `at` wins). */
export interface ServicingEvent {
  instalmentSeq: number;
  outcome: ServicingOutcome;
  at: string; // ISO timestamp
  source: ServicingSource;
}

/** The loan-level terminal flag (distinct from a missed instalment). A monotonic latch:
 *  once true, stays true regardless of which side merges next. */
export interface ServicingDefault {
  value: boolean;
  at: string; // ISO timestamp of the raise (or of the last honest "still false" check)
  source: ServicingSource;
}

export interface ServicingRecord {
  subject: string;
  lenderId: string;
  /** The authoritative shared schedule coordinate, set once from the loan's decided terms.
   *  0 means "not yet known to this record". */
  tenorMonths: number;
  installment: number;
  /** Append-only from either side's point of view; this module de-duplicates by
   *  instalmentSeq on merge. Not required to be sorted going in. */
  events: ServicingEvent[];
  defaulted: ServicingDefault;
  updatedAt: string; // ISO timestamp
}

/** A fresh record for a subject+lender pair that has never had an event or default raised
 *  on it  the lazy-create starting point both the server route and each app's local store
 *  merge new writes against. */
export function emptyServicingRecord(subject: string, lenderId: string, at: string): ServicingRecord {
  return {
    subject,
    lenderId,
    tenorMonths: 0,
    installment: 0,
    events: [],
    defaulted: { value: false, at, source: 'lender' },
    updatedAt: at,
  };
}

/** Deterministic winner between two events recorded for the SAME instalment: the later
 *  `at` wins (a correction supersedes). A tie (identical `at`) falls back to comparing the
 *  rest of the event so the choice is still symmetric regardless of argument order  it
 *  never matters in practice (a genuine tie only happens when both sides recorded the same
 *  outcome from the same write), but this keeps the function total and order-independent. */
function laterEvent(a: ServicingEvent, b: ServicingEvent): ServicingEvent {
  if (a.at !== b.at) return a.at > b.at ? a : b;
  if (a.outcome !== b.outcome) return a.outcome > b.outcome ? a : b;
  return a.source >= b.source ? a : b;
}

function mergeEvents(a: ServicingEvent[], b: ServicingEvent[]): ServicingEvent[] {
  const bySeq = new Map<number, ServicingEvent>();
  for (const e of [...a, ...b]) {
    const existing = bySeq.get(e.instalmentSeq);
    bySeq.set(e.instalmentSeq, existing ? laterEvent(existing, e) : e);
  }
  return Array.from(bySeq.values()).sort((x, y) => x.instalmentSeq - y.instalmentSeq);
}

/** The latch: true wins over false regardless of side. Between two "true" raises, the
 *  EARLIER `at` is kept  that's when the loan actually first went into default, not when
 *  the second side happened to find out. Between two "false" checks, the later `at` is kept
 *  as the more current honest read. Symmetric in both branches, so order never matters. */
function mergeDefaulted(a: ServicingDefault, b: ServicingDefault): ServicingDefault {
  if (a.value && b.value) return a.at <= b.at ? a : b;
  if (a.value) return a;
  if (b.value) return b;
  return a.at >= b.at ? a : b;
}

/** Prefer whichever side already has a positive schedule coordinate; once both are set they
 *  are expected to agree (the record's own stored value is authoritative and never
 *  recomputed), but taking the max keeps this total and order-independent rather than
 *  silently trusting argument order if they ever did disagree. */
function mergeCoordinate(a: number, b: number): number {
  return Math.max(a, b);
}

/**
 * Merge two views of the same subject+lender servicing record into one. Pure, commutative:
 * mergeServicing(a, b) deep-equals mergeServicing(b, a). Safe to call repeatedly with the
 * same inputs (idempotent)  a poll loop can merge on every tick without drifting state.
 */
export function mergeServicing(a: ServicingRecord, b: ServicingRecord): ServicingRecord {
  return {
    subject: a.subject || b.subject,
    lenderId: a.lenderId || b.lenderId,
    tenorMonths: mergeCoordinate(a.tenorMonths, b.tenorMonths),
    installment: mergeCoordinate(a.installment, b.installment),
    events: mergeEvents(a.events, b.events),
    defaulted: mergeDefaulted(a.defaulted, b.defaulted),
    updatedAt: a.updatedAt >= b.updatedAt ? a.updatedAt : b.updatedAt,
  };
}
