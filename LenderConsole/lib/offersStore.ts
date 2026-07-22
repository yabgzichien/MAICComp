// Server-only persistence for the approved-offer back-channel (approval-notify, 2026-07-19).
// The direct-apply transport is deliberately one-way; this is the narrow status channel back
// the borrower app polls so an officer's approval of a REFERRED application reaches the
// borrower without a manual re-share. Mirrors servicingStore.ts exactly: kvStore-backed
// (Redis on a serverless host, a local file otherwise), keyed by lender then by the passport
// `subject` hash, one current offer per borrower-loan (the same "one loan per lender" demo
// simplification the servicing sync uses). Latest write wins — there is no merge, an offer is
// just the lender's current decided terms for this subject.

import * as path from 'path';
import { readJson, writeJson } from './kvStore';
import type { DeclaredPurpose } from './applications';
import { isOfferRecord, type OfferRecord, type OfferResponse } from './offerAcceptance';

const STORE_KEY = 'offers';
const DEFAULT_LENDER_ID = 'tekun';

/** File-backend fallback path (TEKUN / default lender). */
export const OFFERS_FILE_PATH = path.join(process.cwd(), '.data', 'offers.json');

function keyFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? STORE_KEY : `${STORE_KEY}:${lenderId}`;
}

function defaultFilePathFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? OFFERS_FILE_PATH : path.join(process.cwd(), '.data', `offers-${lenderId}.json`);
}

// The record shape, its response block, and the validator live in offerAcceptance.ts — that
// module is pure and therefore safe to import from the client bundle, which this one is not
// (kvStore pulls in `fs`). Re-exported here so server code keeps a single import site.
export type { OfferRecord, OfferResponse } from './offerAcceptance';
export { isOfferRecord } from './offerAcceptance';

/** Read `lenderId`'s whole offer book; a missing, corrupt, or unreachable store reads as
 *  empty rather than throwing. Pass `filePath` to force the local-file backend (tests). */
export async function readOfferBook(filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<Record<string, OfferRecord>> {
  const parsed = await readJson<unknown>(keyFor(lenderId), defaultFilePathFor(lenderId), {}, filePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, OfferRecord> = {};
  for (const [subject, rec] of Object.entries(parsed as Record<string, unknown>)) {
    if (isOfferRecord(rec)) out[subject] = rec;
  }
  return out;
}

/** Read one subject's current offer, or null if none has been published yet  the
 *  "unknown subject reads empty" contract GET /api/offers relies on. */
export async function readOffer(subject: string, filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<OfferRecord | null> {
  const book = await readOfferBook(filePath, lenderId);
  return book[subject] ?? null;
}

/** Publish (or overwrite) `subject`'s current offer with this lender. Latest write wins  with
 *  one carve-out: re-publishing the SAME terms keeps whatever the borrower already answered.
 *  Without that, an idempotent re-publish (the officer re-approving, a repeat direct-apply at
 *  the same amount) would silently un-accept a loan the borrower had already taken, and it
 *  would reappear in their "awaiting your decision" list. Genuinely different terms are a new
 *  offer, so they clear the old answer and go back to awaiting. */
export async function writeOffer(
  filePath: string | undefined,
  lenderId: string,
  subject: string,
  offer: { maxAmount: number; installment: number; tenorMonths?: number; purpose?: DeclaredPurpose; apr?: number; discountBps?: number },
  now: Date = new Date(),
): Promise<OfferRecord> {
  const book = await readOfferBook(filePath, lenderId);
  const prior = book[subject];
  const sameTerms = prior !== undefined && prior.maxAmount === offer.maxAmount && prior.installment === offer.installment;
  const record: OfferRecord = {
    subject,
    lenderId,
    decision: 'approve',
    maxAmount: offer.maxAmount,
    installment: offer.installment,
    // Same terms → keep the original decidedAt too; the borrower dedupes on it, and bumping it
    // for an unchanged offer would read as fresh news.
    decidedAt: sameTerms ? prior.decidedAt : now.toISOString(),
    ...(offer.tenorMonths ? { tenorMonths: offer.tenorMonths } : {}),
    ...(offer.purpose ? { purpose: offer.purpose } : {}),
    // apr/discountBps refresh unconditionally from the new call, NOT gated on sameTerms like
    // decidedAt/response are: a re-publish always carries the caller's current pricing, even
    // when maxAmount/installment happen to match the prior offer. Deliberate for now — see
    // Task 3 code review — revisit if a same-terms-but-repriced republish needs to reset the
    // borrower's answer too.
    ...(offer.apr !== undefined ? { apr: offer.apr } : {}),
    ...(offer.discountBps !== undefined ? { discountBps: offer.discountBps } : {}),
    ...(sameTerms && prior.response ? { response: prior.response } : {}),
  };
  book[subject] = record;
  await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), book, filePath);
  return record;
}

/** Stamp the borrower's accept/decline onto their current offer (borrower acceptance,
 *  2026-07-21). Returns the updated record, or null when there is no offer to answer  a
 *  response to nothing is dropped rather than conjuring an offer the lender never made.
 *  First answer wins: an already-answered offer is returned untouched, so a duplicate tap
 *  (or a retry after a flaky response) can't flip an acceptance into a decline. */
export async function recordOfferResponse(
  filePath: string | undefined,
  lenderId: string,
  subject: string,
  state: OfferResponse['state'],
  now: Date = new Date(),
): Promise<OfferRecord | null> {
  const book = await readOfferBook(filePath, lenderId);
  const existing = book[subject];
  if (!existing) return null;
  if (existing.response) return existing;
  const record: OfferRecord = { ...existing, response: { state, at: now.toISOString() } };
  book[subject] = record;
  await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), book, filePath);
  return record;
}

/** Empty `lenderId`'s whole offer book (lender-reset-to-defaults, 2026-07-20 follow-up): a
 *  stale offer left behind after a reset would let a borrower's poll re-book a loan whose
 *  application record the console just wiped, the moment its own (also-just-cleared) local
 *  copy is removed  the reset has to take the offer with it, not just the application. */
export async function clearOfferBook(filePath: string | undefined, lenderId: string = DEFAULT_LENDER_ID): Promise<void> {
  await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), {}, filePath);
}
