// Server-only file persistence for direct-apply submissions (direct-apply-transport
// spec, 2026-07-11). Mirrors policyFile.ts's read-with-fallback / write-then-stamp
// pattern. This is a MAILBOX for POST /api/apply, not a replacement for the console's
// own localStorage pipeline: Console.tsx merges these in via fileApplication's own
// subject+amount dedupe on load, same as any officer-pasted filing.

import * as fs from 'fs';
import * as path from 'path';
import { fileApplication, isApplicationRecord, type ApplicationRecord, type FileApplicationInput } from './applications';

export const APPLICATIONS_FILE_PATH = path.join(process.cwd(), '.data', 'applications.json');

/** Read the server-stored direct-apply submissions; a missing or corrupt file reads as
 *  empty rather than throwing  the console must never fail to load because of this file. */
export function readServerApplications(filePath: string = APPLICATIONS_FILE_PATH): ApplicationRecord[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    return Array.isArray(parsed) ? parsed.filter(isApplicationRecord) : [];
  } catch {
    return [];
  }
}

/** File one submission into the server store, reusing fileApplication's own dedupe/audit
 *  logic so a direct submission is indistinguishable in shape from an officer-filed one. */
export function appendServerApplication(
  filePath: string = APPLICATIONS_FILE_PATH,
  input: FileApplicationInput,
  now: Date = new Date(),
): { filed: boolean; id?: string } {
  const existing = readServerApplications(filePath);
  const result = fileApplication(existing, input, now);
  if (result.filed) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(result.apps, null, 2));
  }
  return { filed: result.filed, id: result.id };
}
