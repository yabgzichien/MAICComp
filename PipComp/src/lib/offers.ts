// src/lib/offers.ts (approval-notify, 2026-07-19; borrower acceptance, 2026-07-21)
// Borrower-side client helpers for the offer back-channel the Lender Console publishes at
// GET /api/offers. Whenever a lender approves — the engine outright on a direct apply, or an
// officer resolving a referred file — the console publishes the decided terms here.
//
// The borrower app used to poll these and AUTO-BOOK them: a loan appeared in My Financing
// having never been agreed to, which is not how taking on debt works. An approval is now
// treated as what it is — a standing offer — and the borrower answers it with an explicit
// accept or decline, which is written back through PATCH /api/offers.
//
// Untrusted network input: an offer is validated field-by-field (the lenderDirectory.ts /
// directApply.ts idiom) and a malformed payload reads as "no offer" rather than throwing.

import type { DirectApplyDecision } from './directApply';
import { PURPOSE_CATEGORIES, type DeclaredPurpose } from './loanPurpose';
import type { LoanApplication } from '../db/loansRepo';

/** The borrower's own answer, as the lender recorded it. Absent = still theirs to make. */
export interface OfferResponse {
  state: 'accepted' | 'declined';
  at: string;
}

export interface Offer {
  subject: string;
  lenderId: string;
  decision: 'approve';
  maxAmount: number;
  installment: number;
  decidedAt: string;
  /** The tenor of the tier the LENDER priced this on. Authoritative when present: without it
   *  the app re-derives a tier from the amount alone and can pick a longer one, showing and
   *  booking a term the lender never approved. Absent on offers published before this shipped. */
  tenorMonths?: number;
  /** The purpose declared at apply time, round-tripped from the console's own application
   *  record (My Financing polish, 2026-07-19) so an accepted loan carries the same "why"
   *  a manually-accepted one does. Absent on offers published before this shipped. */
  purpose?: DeclaredPurpose;
  /** The applied annual rate, as a decimal (e.g. 0.24 = 24% APR). Absent on offers priced
   *  before this shipped, and on any offer that was never re-decided off the ladder rate. */
  apr?: number;
  /** The discount off the tier's ladder rate that produced `apr`, in basis points. Absent
   *  under the same conditions as `apr`. */
  discountBps?: number;
  /** Present once the borrower has answered. The lender is the source of truth for this, not
   *  local state: it survives a reinstall, and it's what stops an already-answered offer from
   *  reappearing in the borrower's inbox on the next poll. */
  response?: OfferResponse;
}

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nonEmptyStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/** Validate an untrusted purpose payload; a malformed one is dropped (the offer itself stays
 *  bookable  purpose is context, not a required field). */
function parsePurpose(raw: unknown): DeclaredPurpose | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  if (typeof p.category !== 'string' || !(PURPOSE_CATEGORIES as string[]).includes(p.category)) return undefined;
  const note = typeof p.note === 'string' ? p.note : undefined;
  return { category: p.category as DeclaredPurpose['category'], ...(note ? { note } : {}) };
}

/** Validate an untrusted response block. A malformed one is dropped — which reads as "not yet
 *  answered", the safe direction: the borrower is re-shown an offer they may have already
 *  answered, rather than silently losing one they haven't. */
function parseResponse(raw: unknown): OfferResponse | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.state !== 'accepted' && r.state !== 'declined') return undefined;
  if (!nonEmptyStr(r.at)) return undefined;
  return { state: r.state, at: r.at };
}

/** Validate an untrusted /api/offers payload into an Offer, or null. A null/absent body (no
 *  offer published for this subject) and any malformed field both read as null. Only an
 *  'approve' decision with a positive amount is a bookable offer. */
export function parseOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!nonEmptyStr(o.subject) || !nonEmptyStr(o.lenderId)) return null;
  if (o.decision !== 'approve') return null;
  if (!isFiniteNum(o.maxAmount) || o.maxAmount <= 0) return null;
  if (!isFiniteNum(o.installment) || o.installment < 0) return null;
  if (!nonEmptyStr(o.decidedAt)) return null;
  const tenorMonths = isFiniteNum(o.tenorMonths) && Number.isInteger(o.tenorMonths) && o.tenorMonths > 0 ? o.tenorMonths : undefined;
  const purpose = parsePurpose(o.purpose);
  const response = parseResponse(o.response);
  const apr = isFiniteNum(o.apr) && o.apr > 0 ? o.apr : undefined;
  const discountBps = isFiniteNum(o.discountBps) && Number.isInteger(o.discountBps) && o.discountBps >= 0 ? o.discountBps : undefined;
  return {
    subject: o.subject,
    lenderId: o.lenderId,
    decision: 'approve',
    maxAmount: o.maxAmount,
    installment: o.installment,
    decidedAt: o.decidedAt,
    ...(tenorMonths ? { tenorMonths } : {}),
    ...(purpose ? { purpose } : {}),
    ...(apr ? { apr } : {}),
    ...(discountBps !== undefined ? { discountBps } : {}),
    ...(response ? { response } : {}),
  };
}

/** The DirectApplyDecision shape the accept-offer flow already books from  so a polled offer
 *  goes through exactly the same `acceptLenderOffer` path as an offer the borrower accepted by
 *  hand. Reasons are empty (the back-channel carries terms, not the officer's rationale). */
export function offerToDecision(offer: Offer): DirectApplyDecision {
  return { decision: 'approve', maxAmount: offer.maxAmount, installment: offer.installment, reasons: [] };
}

/**
 * Pure: given the offers polled for a set of lenders and the borrower's existing loan
 * applications, return the ones still awaiting the borrower's decision.
 *
 * Two filters, and both are load-bearing:
 *  - an offer the borrower has already answered is done, whichever way they answered. This is
 *    what stops a declined offer from nagging forever, and it's read from the lender's record
 *    rather than local state so it survives a reinstall.
 *  - an offer from a lender the borrower already has a loan with is already booked. Dedupe is
 *    one-loan-per-lender, the same simplification the servicing sync makes.
 *
 * Idempotent  re-running with the same inputs yields the same result.
 */
export function pendingOffers(offers: Offer[], applications: LoanApplication[]): Offer[] {
  const bookedLenderIds = new Set(applications.map((a) => a.lenderId).filter((id): id is string => !!id));
  return offers.filter((o) => !o.response && !bookedLenderIds.has(o.lenderId));
}

const RESPOND_TIMEOUT_MS = 8_000;

/** Write the borrower's answer back to the lender (borrower acceptance, 2026-07-21). Never
 *  throws: resolves false on any transport failure, which the caller treats as "not answered
 *  yet" and retries on a later tap  the lender's record is the source of truth, so booking a
 *  loan the lender still thinks is unanswered would be the worse failure mode. */
export async function respondToOffer(
  baseUrl: string,
  req: { subject: string; lenderId: string; response: OfferResponse['state'] },
): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RESPOND_TIMEOUT_MS);
    let res: { ok: boolean };
    try {
      res = await fetch(`${baseUrl}/api/offers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    return res.ok;
  } catch {
    return false;
  }
}
