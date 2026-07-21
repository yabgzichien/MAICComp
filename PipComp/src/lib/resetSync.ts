// src/lib/resetSync.ts (data-consistency follow-up, 2026-07-20)
// Pure parse + selection for the lender-reset marker channel. When an officer resets their
// console to defaults, this borrower's own locally-booked loan(s) with that lender are
// orphaned  the console no longer has any record of them, but the phone hasn't been told.
// GET /api/reset?lender=X (mirrors offers.ts's own polling shape) tells the borrower "this
// lender wiped everything as of T"; this module decides which of the borrower's own loans
// that means removing.
//
// Untrusted network input: the marker is validated field-by-field, same idiom as offers.ts /
// directApply.ts. A malformed payload reads as "never reset" rather than throwing.

import type { LoanApplication } from '../db/loansRepo';

export interface ResetMarker {
  resetAt: string;
}

const nonEmptyStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/** Validate an untrusted /api/reset payload into a ResetMarker, or null. A null/absent body
 *  (this lender has never reset) and any malformed field both read as null. */
export function parseResetMarker(raw: unknown): ResetMarker | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!nonEmptyStr(r.resetAt) || Number.isNaN(Date.parse(r.resetAt))) return null;
  return { resetAt: r.resetAt };
}

/**
 * Pure: given one lender's reset marker and this borrower's own applications, return the
 * applications that predate the reset and should be cleared locally  i.e. those routed to
 * `lenderId` whose local booking timestamp is strictly before `resetAt`. An application booked
 * AFTER the reset (a fresh apply against the now-clean console) is left alone  it's a real,
 * current application the console does still know about.
 */
export function applicationsClearedByReset(marker: ResetMarker, lenderId: string, applications: LoanApplication[]): LoanApplication[] {
  return applications.filter((a) => a.lenderId === lenderId && a.createdAt < marker.resetAt);
}

/**
 * Human-readable notice for the borrower when one or more loans were cleared by a lender
 * reset  one entry per cleared loan (so a borrower with two loans at the same lender sees
 * "your 2 loan records" reflecting both, not just the distinct lender count), grouped by
 * lender name. Pure so the banner copy is testable without mounting the app. Empty input
 * reads as an empty string  the caller only shows a banner when this is non-empty.
 */
export function clearedLoanMessage(lenderNames: string[]): string {
  if (lenderNames.length === 0) return '';
  const unique = Array.from(new Set(lenderNames));
  const list =
    unique.length === 1
      ? unique[0]
      : unique.length === 2
        ? `${unique[0]} and ${unique[1]}`
        : `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
  const subject = lenderNames.length === 1 ? 'A loan record' : `${lenderNames.length} loan records`;
  return `${list} reset their demo console. ${subject} on your side ${lenderNames.length === 1 ? 'was' : 'were'} cleared to keep both apps in sync.`;
}
