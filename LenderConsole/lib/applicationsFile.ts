// Server-only persistence for direct-apply submissions (direct-apply-transport spec,
// 2026-07-11). Mirrors policyFile.ts's read-with-fallback / write-then-stamp pattern, now
// through kvStore.ts (Redis on a serverless host, a local file otherwise  see kvStore.ts's
// header for why plain files don't survive a serverless deploy). This is a MAILBOX for
// POST /api/apply, not a replacement for the console's own localStorage pipeline: Console.tsx
// merges these in via fileApplication's own subject+amount dedupe on load, same as any
// officer-pasted filing.

import * as path from 'path';
import { readJson, writeJson } from './kvStore';
import { fileApplication, isApplicationRecord, type ApplicationRecord, type FileApplicationInput } from './applications';

const STORE_KEY = 'applications';

/** File-backend fallback path. */
export const APPLICATIONS_FILE_PATH = path.join(process.cwd(), '.data', 'applications.json');

/** Read the server-stored direct-apply submissions; a missing, corrupt, or unreachable store
 *  reads as empty rather than throwing  the console must never fail to load because of this.
 *  Pass `filePath` to force the local-file backend (tests); omit it for the auto-selected one. */
export async function readServerApplications(filePath?: string): Promise<ApplicationRecord[]> {
  const parsed = await readJson<unknown>(STORE_KEY, APPLICATIONS_FILE_PATH, [], filePath);
  return Array.isArray(parsed) ? parsed.filter(isApplicationRecord) : [];
}

/** File one submission into the server store, reusing fileApplication's own dedupe/audit
 *  logic so a direct submission is indistinguishable in shape from an officer-filed one. */
export async function appendServerApplication(
  filePath: string | undefined,
  input: FileApplicationInput,
  now: Date = new Date(),
): Promise<{ filed: boolean; id?: string }> {
  const existing = await readServerApplications(filePath);
  const result = fileApplication(existing, input, now);
  if (result.filed) {
    await writeJson(STORE_KEY, APPLICATIONS_FILE_PATH, result.apps, filePath);
  }
  return { filed: result.filed, id: result.id };
}
