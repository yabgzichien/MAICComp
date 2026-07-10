// Server-only file persistence for the lender policy (Brief N). Split from
// policyStore.ts so the pure validation stays importable by client components.
// The canonical file lives at .data/policy.json (gitignored) so GET /api/lenders
// can publish TEKUN's live ladder from the same store the Policy tab edits.

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_STORED_POLICY, validateStoredPolicy, type PolicyValidation, type StoredPolicy } from './policyStore';

/** Where the routes persist the policy. process.cwd() is the LenderConsole root
 *  under `next dev`/`next start`. */
export const POLICY_FILE_PATH = path.join(process.cwd(), '.data', 'policy.json');

/** Read the stored policy; a missing or corrupt file falls back to the defaults
 *  (no updatedAt = never edited) so the console can never boot into a broken state. */
export function readStoredPolicy(filePath: string = POLICY_FILE_PATH): StoredPolicy {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    // BOM tolerance — Windows editors prepend one and JSON.parse rejects it.
    const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as StoredPolicy & { updatedAt?: unknown };
    const v = validateStoredPolicy(parsed);
    if (!v.ok) return DEFAULT_STORED_POLICY;
    return typeof parsed.updatedAt === 'string' ? { ...v.value, updatedAt: parsed.updatedAt } : v.value;
  } catch {
    return DEFAULT_STORED_POLICY;
  }
}

/** Validate and persist. Rejection never touches the file; success stamps updatedAt
 *  server-side (the client's clock is not trusted) and returns the stored value. */
export function writeStoredPolicy(filePath: string = POLICY_FILE_PATH, raw: unknown): PolicyValidation {
  const v = validateStoredPolicy(raw);
  if (!v.ok) return v;
  const stored: StoredPolicy = { ...v.value, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(stored, null, 2));
  return { ok: true, value: stored };
}
