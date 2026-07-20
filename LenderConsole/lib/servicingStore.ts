// Server-only persistence for the shared servicing ledger (Bidirectional Servicing Sync,
// 2026-07-18 design). Mirrors applicationsFile.ts's read-with-fallback / write-then-stamp
// pattern through kvStore.ts (Redis on a serverless host, a local file otherwise  see
// kvStore.ts's header for why plain files don't survive a serverless deploy).
//
// Keyed by lender id, the same tenancy pattern applicationsFile.ts uses: each registry
// lender gets its own book, so a borrower's loan with Koperasi never merges into TEKUN's
// records. Within a lender's book, one JSON object maps subject -> ServicingRecord (one
// record per borrower-loan, per the "no multi-loan-per-lender history" non-goal).
// `lenderId` defaults to 'tekun', keeping the original, unsuffixed key.

import * as path from 'path';
import { readJson, writeJson } from './kvStore';
import { emptyServicingRecord, mergeServicing, type ServicingDefault, type ServicingEvent, type ServicingOutcome, type ServicingRecord, type ServicingSource } from './mergeServicing';

const STORE_KEY = 'servicing';
const DEFAULT_LENDER_ID = 'tekun';

/** File-backend fallback path (TEKUN / default lender). */
export const SERVICING_FILE_PATH = path.join(process.cwd(), '.data', 'servicing.json');

function keyFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? STORE_KEY : `${STORE_KEY}:${lenderId}`;
}

function defaultFilePathFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? SERVICING_FILE_PATH : path.join(process.cwd(), '.data', `servicing-${lenderId}.json`);
}

const OUTCOMES: ServicingOutcome[] = ['on-time', 'late', 'missed'];
const SOURCES: ServicingSource[] = ['lender', 'borrower'];

function isEvent(x: unknown): x is ServicingEvent {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.instalmentSeq === 'number' &&
    Number.isInteger(e.instalmentSeq) &&
    e.instalmentSeq > 0 &&
    typeof e.outcome === 'string' &&
    OUTCOMES.includes(e.outcome as ServicingOutcome) &&
    typeof e.at === 'string' &&
    typeof e.source === 'string' &&
    SOURCES.includes(e.source as ServicingSource)
  );
}

function isDefaulted(x: unknown): x is ServicingDefault {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  return typeof d.value === 'boolean' && typeof d.at === 'string' && typeof d.source === 'string' && SOURCES.includes(d.source as ServicingSource);
}

/** Defensive: a corrupt/tampered stored record reads as absent rather than throwing or
 *  poisoning a merge with malformed data  same posture applications.ts's isApplicationRecord
 *  takes on its own store. */
export function isServicingRecord(x: unknown): x is ServicingRecord {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.subject === 'string' &&
    r.subject.length > 0 &&
    typeof r.lenderId === 'string' &&
    typeof r.tenorMonths === 'number' &&
    typeof r.installment === 'number' &&
    Array.isArray(r.events) &&
    r.events.every(isEvent) &&
    isDefaulted(r.defaulted) &&
    typeof r.updatedAt === 'string'
  );
}

/** Read `lenderId`'s whole servicing book (default 'tekun'); a missing, corrupt, or
 *  unreachable store reads as empty rather than throwing  the console must never fail to
 *  load because of this. Pass `filePath` to force the local-file backend (tests); omit it
 *  for the auto-selected, lender-keyed one. */
export async function readServicingBook(filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<Record<string, ServicingRecord>> {
  const parsed = await readJson<unknown>(keyFor(lenderId), defaultFilePathFor(lenderId), {}, filePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, ServicingRecord> = {};
  for (const [subject, rec] of Object.entries(parsed as Record<string, unknown>)) {
    if (isServicingRecord(rec)) out[subject] = rec;
  }
  return out;
}

/** Read one subject's servicing record, or null if none exists yet  the "unknown subject
 *  reads empty" contract GET /api/servicing relies on. */
export async function readServicingRecord(subject: string, filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<ServicingRecord | null> {
  const book = await readServicingBook(filePath, lenderId);
  return book[subject] ?? null;
}

export interface ServicingWrite {
  /** Present on the first write for a subject that has no server record yet  the writing
   *  side's own decided terms, seeded onto the freshly-created record. Ignored (via
   *  mergeServicing's coordinate rule) once a record already carries a schedule. */
  tenorMonths?: number;
  installment?: number;
  event?: { instalmentSeq: number; outcome: ServicingOutcome };
  default?: boolean;
  source: ServicingSource;
}

/**
 * Merge one write into `lenderId`'s stored record for `subject` (lazily created on first
 * write via emptyServicingRecord) and persist. Reuses mergeServicing so the store never
 * implements a second, divergent merge policy  the same rule the route validates against
 * and both apps port locally is the one that actually lands on disk.
 */
export async function writeServicingEvent(
  filePath: string | undefined,
  lenderId: string,
  subject: string,
  write: ServicingWrite,
  now: Date = new Date(),
): Promise<ServicingRecord> {
  const at = now.toISOString();
  const book = await readServicingBook(filePath, lenderId);
  const existing = book[subject] ?? emptyServicingRecord(subject, lenderId, at);
  const delta: ServicingRecord = {
    subject,
    lenderId,
    tenorMonths: write.tenorMonths ?? 0,
    installment: write.installment ?? 0,
    events: write.event ? [{ instalmentSeq: write.event.instalmentSeq, outcome: write.event.outcome, at, source: write.source }] : [],
    defaulted: { value: write.default === true, at, source: write.source },
    updatedAt: at,
  };
  const merged = mergeServicing(existing, delta);

  book[subject] = merged;
  await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), book, filePath);
  return merged;
}
