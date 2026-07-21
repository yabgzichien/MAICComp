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
  /** The purpose the borrower declared at apply time (My Financing polish, 2026-07-19),
   *  round-tripped so an auto-booked loan on the borrower side carries the same "why" a
   *  manually-accepted one does. Absent when the filed application carried none. */
  purpose?: DeclaredPurpose;
}

const PURPOSE_CATEGORIES_SET: ReadonlySet<string> = new Set(['stock', 'equipment', 'working-capital', 'emergency', 'education', 'other']);

function isDeclaredPurpose(x: unknown): x is DeclaredPurpose {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  if (typeof p.category !== 'string' || !PURPOSE_CATEGORIES_SET.has(p.category)) return false;
  return p.note === undefined || typeof p.note === 'string';
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
    (o.purpose === undefined || isDeclaredPurpose(o.purpose))
  );
}

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

/** Publish (or overwrite) `subject`'s current offer with this lender. Latest write wins. */
export async function writeOffer(
  filePath: string | undefined,
  lenderId: string,
  subject: string,
  offer: { maxAmount: number; installment: number; purpose?: DeclaredPurpose },
  now: Date = new Date(),
): Promise<OfferRecord> {
  const record: OfferRecord = {
    subject,
    lenderId,
    decision: 'approve',
    maxAmount: offer.maxAmount,
    installment: offer.installment,
    decidedAt: now.toISOString(),
    ...(offer.purpose ? { purpose: offer.purpose } : {}),
  };
  const book = await readOfferBook(filePath, lenderId);
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
