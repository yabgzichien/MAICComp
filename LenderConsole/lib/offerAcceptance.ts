// Borrower acceptance (2026-07-21)  pure classification of "has the borrower answered the
// offer on this file yet?". No I/O, no React.
//
// Why this exists: an approved application is not the same thing as a disbursed loan. A
// direct-apply the engine approves outright used to land straight in Servicing as a live loan
// that nobody had ever agreed to  the officer never saw a file to work, and the borrower had
// nothing to accept. Now every approval publishes an OFFER (see offersStore), and this module
// is what turns "approved + an unanswered offer" into a triage state the queue can show.
//
// Back-compat is the reason this returns null rather than defaulting to 'awaiting': officer-
// filed and demo-seeded applications have no offer record at all, and they represent an
// already-disbursed book. Treating them as unanswered would put the entire seeded pipeline
// into a "waiting on the borrower" queue that no borrower will ever answer.

import type { ApplicationRecord, DeclaredPurpose } from './applications';

/** The offer shape and its validator live HERE, not in offersStore, because Console.tsx is a
 *  client component: importing them from the store would drag kvStore's `fs` backend into the
 *  browser bundle and fail the build. offersStore re-exports these so the server keeps one
 *  import site. */

/** The borrower's answer to a published offer (borrower acceptance, 2026-07-21). An offer is a
 *  standing invitation, not a disbursed loan: nothing is booked on either side until the
 *  borrower says yes. Absent = still waiting on them. */
export interface OfferResponse {
  state: 'accepted' | 'declined';
  at: string;
}

/** One published offer  the lender's current decided terms for a borrower-loan. `decision`
 *  is 'approve' for every record today (only approvals are published; a decline simply writes
 *  no offer), but carried explicitly so a future decline-notify can reuse this shape. */
export interface OfferRecord {
  subject: string;
  lenderId: string;
  decision: 'approve';
  /** The offered principal and monthly installment  the borrower rebuilds the schedule from
   *  these exactly as the accept-offer flow already does (installment is authoritative, tenor
   *  is derived from the lender's product ladder by amount). */
  maxAmount: number;
  installment: number;
  decidedAt: string; // ISO timestamp; also the change token the borrower dedupes on
  /** The tenor of the tier this offer was priced on. Carried explicitly because the borrower
   *  app would otherwise re-derive it from the amount alone and can pick a DIFFERENT tier than
   *  the one the lender actually approved — showing (and booking) a longer term and a larger
   *  total than the lender decided. Optional: offers published before this shipped lack it, and
   *  the borrower falls back to its own tier lookup. */
  tenorMonths?: number;
  /** The purpose the borrower declared at apply time (My Financing polish, 2026-07-19),
   *  round-tripped so an accepted loan on the borrower side carries the same "why" a
   *  manually-accepted one does. Absent when the filed application carried none. */
  purpose?: DeclaredPurpose;
  /** The applied annual rate, as a decimal (e.g. 0.24 = 24% APR). Absent on offers priced
   *  before this shipped, and on any offer that was never re-decided off the ladder rate. */
  apr?: number;
  /** The discount off the tier's ladder rate that produced `apr`, in basis points. Absent
   *  under the same conditions as `apr`. */
  discountBps?: number;
  /** The borrower's accept/decline, once they've given one. Absent while the offer is still
   *  awaiting them  which is what the console renders as "awaiting borrower". */
  response?: OfferResponse;
}

const PURPOSE_CATEGORIES_SET: ReadonlySet<string> = new Set(['stock', 'equipment', 'working-capital', 'emergency', 'education', 'other']);

function isDeclaredPurpose(x: unknown): x is DeclaredPurpose {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  if (typeof p.category !== 'string' || !PURPOSE_CATEGORIES_SET.has(p.category)) return false;
  return p.note === undefined || typeof p.note === 'string';
}

function isOfferResponse(x: unknown): x is OfferResponse {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  if (r.state !== 'accepted' && r.state !== 'declined') return false;
  return typeof r.at === 'string' && r.at.length > 0;
}

export function isOfferRecord(x: unknown): x is OfferRecord {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.subject === 'string' &&
    o.subject.length > 0 &&
    typeof o.lenderId === 'string' &&
    o.decision === 'approve' &&
    typeof o.maxAmount === 'number' &&
    Number.isFinite(o.maxAmount) &&
    o.maxAmount > 0 &&
    typeof o.installment === 'number' &&
    Number.isFinite(o.installment) &&
    o.installment >= 0 &&
    typeof o.decidedAt === 'string' &&
    (o.tenorMonths === undefined || (typeof o.tenorMonths === 'number' && Number.isInteger(o.tenorMonths) && o.tenorMonths > 0)) &&
    (o.purpose === undefined || isDeclaredPurpose(o.purpose)) &&
    (o.response === undefined || isOfferResponse(o.response)) &&
    (o.apr === undefined || (typeof o.apr === 'number' && Number.isFinite(o.apr) && o.apr > 0)) &&
    (o.discountBps === undefined || (typeof o.discountBps === 'number' && Number.isInteger(o.discountBps) && o.discountBps >= 0))
  );
}

export type AcceptanceState = 'awaiting' | 'accepted' | 'declined';

export type OfferBook = Record<string, OfferRecord>;

/**
 * The acceptance state of one application, or null when no offer governs it (an officer-filed
 * or seeded file, or an approval whose offer has since been superseded by different terms).
 *
 * Matching is on subject AND offered amount, not subject alone: the offer book holds one
 * current offer per borrower per lender, so if the same borrower has an older approved file at
 * a different amount, only the file the live offer actually refers to is "awaiting". The stale
 * one reads as ungoverned rather than borrowing its sibling's answer.
 */
export function acceptanceStateFor(app: ApplicationRecord, book: OfferBook): AcceptanceState | null {
  if (app.status !== 'approved') return null;
  const offer = book[app.subject];
  if (!offer) return null;
  if (offer.maxAmount !== app.offeredAmount) return null;
  return offer.response ? offer.response.state : 'awaiting';
}

/** Approved files still waiting on the borrower's yes/no  the officer's "nothing has been
 *  disbursed here yet" queue. Order is preserved from `apps`. */
export function awaitingAcceptance(apps: ApplicationRecord[], book: OfferBook): ApplicationRecord[] {
  return apps.filter((a) => acceptanceStateFor(a, book) === 'awaiting');
}

/** Files the borrower turned down. Order is preserved from `apps`. */
export function declinedByBorrower(apps: ApplicationRecord[], book: OfferBook): ApplicationRecord[] {
  return apps.filter((a) => acceptanceStateFor(a, book) === 'declined');
}

/**
 * The book as it actually stands: everything except offers the borrower turned down.
 *
 * A declined offer keeps `status: 'approved'` — that status records what the LENDER decided,
 * and rewriting it would be a lie about the officer's own call, as well as tripping the
 * override matrix (an approve can only ever be tightened to a decline by a human, with a
 * rationale). But an offer nobody took is not a loan: leaving it in meant it kept showing up
 * in Servicing as a live account, in the securitisation pool, and in the portfolio's exposure
 * and concentration figures. Everything that asks "what do we actually have on our book?"
 * should run through here first.
 */
export function liveBook(apps: ApplicationRecord[], book: OfferBook): ApplicationRecord[] {
  return apps.filter((a) => acceptanceStateFor(a, book) !== 'declined');
}

/** Parse an untrusted /api/offers/book payload into an OfferBook, dropping malformed entries
 *  individually (the lenderDirectory idiom). */
export function parseOfferBook(raw: unknown): OfferBook {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: OfferBook = {};
  for (const [subject, rec] of Object.entries(raw as Record<string, unknown>)) {
    if (isOfferRecord(rec)) out[subject] = rec;
  }
  return out;
}

const LABELS: Record<AcceptanceState, string> = {
  awaiting: 'Awaiting borrower',
  accepted: 'Accepted by borrower',
  declined: 'Declined by borrower',
};

export function acceptanceLabel(state: AcceptanceState): string {
  return LABELS[state];
}
