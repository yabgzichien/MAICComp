// Server-only persistence for direct-apply submissions (direct-apply-transport spec,
// 2026-07-11). Mirrors policyFile.ts's read-with-fallback / write-then-stamp pattern, now
// through kvStore.ts (Redis on a serverless host, a local file otherwise  see kvStore.ts's
// header for why plain files don't survive a serverless deploy). This is a MAILBOX for
// POST /api/apply, not a replacement for the console's own localStorage pipeline: Console.tsx
// merges these in via fileApplication's own subject+amount dedupe on load, same as any
// officer-pasted filing.
//
// Keyed by lender id (multi-lender direct-apply, 2026-07-16), the same tenancy pattern
// policyFile.ts uses: each registry lender gets its own mailbox, so a borrower who applies
// to Koperasi never lands in TEKUN's queue. `lenderId` defaults to 'tekun', which keeps the
// original, unsuffixed key/file  so any submission filed before multi-lender shipped stays
// TEKUN's.

import * as path from 'path';
import { readJson, writeJson } from './kvStore';
import { fileApplication, isApplicationRecord, type ApplicationRecord, type FileApplicationInput } from './applications';

const STORE_KEY = 'applications';
const DEFAULT_LENDER_ID = 'tekun';

/** File-backend fallback path (TEKUN / default lender). */
export const APPLICATIONS_FILE_PATH = path.join(process.cwd(), '.data', 'applications.json');

function keyFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? STORE_KEY : `${STORE_KEY}:${lenderId}`;
}

function defaultFilePathFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID
    ? APPLICATIONS_FILE_PATH
    : path.join(process.cwd(), '.data', `applications-${lenderId}.json`);
}

/** Read `lenderId`'s server-stored direct-apply submissions (default 'tekun'); a missing,
 *  corrupt, or unreachable store reads as empty rather than throwing  the console must never
 *  fail to load because of this. Pass `filePath` to force the local-file backend (tests);
 *  omit it for the auto-selected, lender-keyed one. */
export async function readServerApplications(filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<ApplicationRecord[]> {
  const parsed = await readJson<unknown>(keyFor(lenderId), defaultFilePathFor(lenderId), [], filePath);
  return Array.isArray(parsed) ? parsed.filter(isApplicationRecord) : [];
}

/** File one submission into `lenderId`'s server store, reusing fileApplication's own
 *  dedupe/audit logic so a direct submission is indistinguishable in shape from an
 *  officer-filed one. */
export async function appendServerApplication(
  filePath: string | undefined,
  input: FileApplicationInput,
  now: Date = new Date(),
  lenderId: string = DEFAULT_LENDER_ID,
): Promise<{ filed: boolean; id?: string }> {
  const existing = await readServerApplications(filePath, lenderId);
  const result = fileApplication(existing, input, now);
  if (result.filed) {
    await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), result.apps, filePath);
  }
  return { filed: result.filed, id: result.id };
}

/** Empty `lenderId`'s server-side direct-apply mailbox (console reset-to-defaults). Demo-only
 *  operation: this console has no authentication, so the mailbox holds only test/demo
 *  submissions from the paired borrower app, never a real lender's live pipeline. */
export async function clearServerApplications(filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<void> {
  await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), [], filePath);
}
