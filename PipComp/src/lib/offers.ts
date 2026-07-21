// src/lib/offers.ts (approval-notify, 2026-07-19)
// Borrower-side client helpers for the approved-offer back-channel the Lender Console
// publishes at GET /api/offers. When an officer approves a REFERRED application, the console
// posts the decided terms; the borrower app polls them here and auto-books the financing, so
// a console approval reaches the borrower without a manual re-share.
//
// Untrusted network input: an offer is validated field-by-field (the lenderDirectory.ts /
// directApply.ts idiom) and a malformed payload reads as "no offer" rather than throwing.

import type { DirectApplyDecision } from './directApply';
import { PURPOSE_CATEGORIES, type DeclaredPurpose } from './loanPurpose';
import type { LoanApplication } from '../db/loansRepo';

export interface Offer {
  subject: string;
  lenderId: string;
  decision: 'approve';
  maxAmount: number;
  installment: number;
  decidedAt: string;
  /** The purpose declared at apply time, round-tripped from the console's own application
   *  record (My Financing polish, 2026-07-19) so an auto-booked loan carries the same "why"
   *  a manually-accepted one does. Absent on offers published before this shipped. */
  purpose?: DeclaredPurpose;
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
  const purpose = parsePurpose(o.purpose);
  return { subject: o.subject, lenderId: o.lenderId, decision: 'approve', maxAmount: o.maxAmount, installment: o.installment, decidedAt: o.decidedAt, ...(purpose ? { purpose } : {}) };
}

/** The DirectApplyDecision shape the accept-offer flow already books from  so a polled offer
 *  goes through exactly the same `acceptLenderOffer` path as an offer the borrower accepted by
 *  hand. Reasons are empty (the back-channel carries terms, not the officer's rationale). */
export function offerToDecision(offer: Offer): DirectApplyDecision {
  return { decision: 'approve', maxAmount: offer.maxAmount, installment: offer.installment, reasons: [] };
}

/**
 * Pure: given the offers polled for a set of lenders and the borrower's existing loan
 * applications, return the offers that should be auto-booked  i.e. those for a lender the
 * borrower doesn't already have a loan with. Dedupe is one-loan-per-lender (the servicing
 * sync's own simplification): if any application already carries this lenderId, the offer was
 * already booked (by the poll on an earlier tick, or by the borrower accepting it by hand), so
 * it is skipped. Idempotent  re-running with the same inputs yields the same result.
 */
export function pendingOffers(offers: Offer[], applications: LoanApplication[]): Offer[] {
  const bookedLenderIds = new Set(applications.map((a) => a.lenderId).filter((id): id is string => !!id));
  return offers.filter((o) => !bookedLenderIds.has(o.lenderId));
}
