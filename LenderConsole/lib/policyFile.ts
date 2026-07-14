// Server-only persistence for the lender policy (Brief N). Split from policyStore.ts so the
// pure validation stays importable by client components. Publishes through kvStore.ts (Redis
// on a serverless host when configured, a local JSON file otherwise) so GET /api/lenders can
// publish TEKUN's live ladder from the same store the Policy tab edits  and so that ladder
// survives a serverless cold start instead of silently resetting.

import * as path from 'path';
import { readJson, writeJson } from './kvStore';
import { DEFAULT_STORED_POLICY, validateStoredPolicy, type PolicyValidation, type StoredPolicy } from './policyStore';

const STORE_KEY = 'policy';

/** File-backend fallback path. process.cwd() is the LenderConsole root under `next dev`/`next start`. */
export const POLICY_FILE_PATH = path.join(process.cwd(), '.data', 'policy.json');

/** Read the stored policy; a missing, corrupt, or unreachable store falls back to the
 *  defaults (no updatedAt = never edited) so the console can never boot into a broken state.
 *  Pass `filePath` to force the local-file backend (tests); omit it for the auto-selected one. */
export async function readStoredPolicy(filePath?: string): Promise<StoredPolicy> {
  const parsed = await readJson<StoredPolicy & { updatedAt?: unknown }>(
    STORE_KEY,
    POLICY_FILE_PATH,
    DEFAULT_STORED_POLICY,
    filePath
  );
  const v = validateStoredPolicy(parsed);
  if (!v.ok) return DEFAULT_STORED_POLICY;
  return typeof parsed.updatedAt === 'string' ? { ...v.value, updatedAt: parsed.updatedAt } : v.value;
}

/** Validate and persist. Rejection never touches the store; success stamps updatedAt
 *  server-side (the client's clock is not trusted) and returns the stored value. */
export async function writeStoredPolicy(filePath: string | undefined, raw: unknown): Promise<PolicyValidation> {
  const v = validateStoredPolicy(raw);
  if (!v.ok) return v;
  const stored: StoredPolicy = { ...v.value, updatedAt: new Date().toISOString() };
  await writeJson(STORE_KEY, POLICY_FILE_PATH, stored, filePath);
  return { ok: true, value: stored };
}
