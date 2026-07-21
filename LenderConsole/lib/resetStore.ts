// Server-only persistence for the lender-reset marker (data-consistency follow-up,
// 2026-07-20). Mirrors offersStore.ts / servicingStore.ts's read-with-fallback / write-then-
// stamp pattern through kvStore.ts. This is the one-way signal the borrower app polls (same
// shape as the offers/servicing channels): when an officer resets their console, this stamps
// "everything before this instant is gone" for that lender. The borrower compares its own
// locally-booked loans' timestamps against the marker rather than the console echoing back a
// list of cleared subjects  simpler, and correct because a reset is a total wipe, not a
// selective one.
//
// Keyed by lender id, the same tenancy pattern every other per-lender store here uses.
// `lenderId` defaults to 'tekun', keeping an unsuffixed key for the original lender.

import * as path from 'path';
import { readJson, writeJson } from './kvStore';

const STORE_KEY = 'resetMarker';
const DEFAULT_LENDER_ID = 'tekun';

/** File-backend fallback path (TEKUN / default lender). */
export const RESET_FILE_PATH = path.join(process.cwd(), '.data', 'reset.json');

function keyFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? STORE_KEY : `${STORE_KEY}:${lenderId}`;
}

function defaultFilePathFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? RESET_FILE_PATH : path.join(process.cwd(), '.data', `reset-${lenderId}.json`);
}

export interface ResetMarker {
  lenderId: string;
  resetAt: string;
}

function isResetMarker(x: unknown): x is ResetMarker {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.lenderId === 'string' && r.lenderId.length > 0 && typeof r.resetAt === 'string' && !Number.isNaN(Date.parse(r.resetAt));
}

/** Read `lenderId`'s current reset marker, or null if that lender has never reset (or the
 *  store is missing/corrupt/unreachable  reads as "never reset" rather than throwing, the
 *  console must never fail to load because of this). Pass `filePath` to force the local-file
 *  backend (tests); omit it for the auto-selected, lender-keyed one. The stored `lenderId` is
 *  cross-checked against the one requested: harmless in production (each lender's marker
 *  already lives in its own keyed file/record) but keeps a forced test filepath  which
 *  bypasses the per-lender file selection entirely  from reading back a different lender's
 *  marker as if it were this one's. */
export async function readResetMarker(filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<ResetMarker | null> {
  const parsed = await readJson<unknown>(keyFor(lenderId), defaultFilePathFor(lenderId), null, filePath);
  if (!isResetMarker(parsed) || parsed.lenderId !== lenderId) return null;
  return parsed;
}

/** Stamp `lenderId` as reset at `now`. Latest write wins  there is no history, only "the
 *  most recent reset", which is all the borrower-side comparison needs. */
export async function writeResetMarker(filePath: string | undefined, lenderId: string, now: Date = new Date()): Promise<ResetMarker> {
  const record: ResetMarker = { lenderId, resetAt: now.toISOString() };
  await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), record, filePath);
  return record;
}
