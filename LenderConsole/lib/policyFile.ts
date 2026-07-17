// Server-only persistence for the lender policy (Brief N). Split from policyStore.ts so the
// pure validation stays importable by client components. Publishes through kvStore.ts (Redis
// on a serverless host when configured, a local JSON file otherwise) so GET /api/lenders can
// publish each lender's live ladder from the same store its Policy tab edits  and so that
// ladder survives a serverless cold start instead of silently resetting.
//
// Keyed by lender id (Lender Tenancy spec, 2026-07-12): each of the three registry lenders
// persists its own edited policy. `lenderId` defaults to 'tekun', which keeps the original,
// unsuffixed key/file  so any policy edited before multi-tenancy shipped is still TEKUN's.

import * as path from 'path';
import { readJson, writeJson } from './kvStore';
import { DEFAULT_STORED_POLICY, validateStoredPolicy, type PolicyValidation, type StoredPolicy } from './policyStore';
import { LENDER_REGISTRY } from './lenderRegistry';
import { DEFAULT_POLICY } from './loans';

const STORE_KEY = 'policy';
const DEFAULT_LENDER_ID = 'tekun';

/** File-backend fallback path. process.cwd() is the LenderConsole root under `next dev`/`next start`. */
export const POLICY_FILE_PATH = path.join(process.cwd(), '.data', 'policy.json');

function keyFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? STORE_KEY : `${STORE_KEY}:${lenderId}`;
}

function defaultFilePathFor(lenderId: string): string {
  return lenderId === DEFAULT_LENDER_ID ? POLICY_FILE_PATH : path.join(process.cwd(), '.data', `policy-${lenderId}.json`);
}

/** Read the stored policy for `lenderId` (default 'tekun'); a missing, corrupt, or
 *  unreachable store falls back to the defaults (no updatedAt = never edited) so the
 *  console can never boot into a broken state. Pass `filePath` to force the local-file
 *  backend at an exact path (tests); omit it for the auto-selected, lender-keyed one. */
export async function readStoredPolicy(filePath?: string, lenderId: string = DEFAULT_LENDER_ID): Promise<StoredPolicy> {
  const parsed = await readJson<StoredPolicy & { updatedAt?: unknown }>(
    keyFor(lenderId),
    defaultFilePathFor(lenderId),
    DEFAULT_STORED_POLICY,
    filePath
  );
  const v = validateStoredPolicy(parsed);
  if (!v.ok) return DEFAULT_STORED_POLICY;
  return typeof parsed.updatedAt === 'string' ? { ...v.value, updatedAt: parsed.updatedAt } : v.value;
}

/**
 * The EFFECTIVE policy a lender decides with (multi-lender direct-apply, 2026-07-16). Resolves
 * the gap that `readStoredPolicy` falls back to the generic DEFAULT_STORED_POLICY (TEKUN's
 * ladder) for a lender that has never opened its Policy editor  which would silently decide a
 * Koperasi or Dana Niaga application against TEKUN's package. Rule: an EDITED policy (carries
 * `updatedAt`) is honoured as-is; otherwise the lender's own registry package is used, so an
 * unedited lender decides with the ladder it publishes on /api/lenders, not TEKUN's. An unknown
 * lender keeps the generic default. This is the single source of truth for /api/apply,
 * /api/policy (GET), and /api/lenders, so all three agree on every lender's real ladder.
 */
export async function readLenderPolicy(lenderId: string = DEFAULT_LENDER_ID, filePath?: string): Promise<StoredPolicy> {
  const stored = await readStoredPolicy(filePath, lenderId);
  if (stored.updatedAt) return stored;
  const registry = LENDER_REGISTRY.find((l) => l.id === lenderId);
  if (!registry) return stored;
  return { policy: registry.policy ?? DEFAULT_POLICY, products: registry.products };
}

/** Validate and persist `lenderId`'s policy. Rejection never touches the store; success
 *  stamps updatedAt server-side (the client's clock is not trusted) and returns the
 *  stored value. */
export async function writeStoredPolicy(filePath: string | undefined, raw: unknown, lenderId: string = DEFAULT_LENDER_ID): Promise<PolicyValidation> {
  const v = validateStoredPolicy(raw);
  if (!v.ok) return v;
  const stored: StoredPolicy = { ...v.value, updatedAt: new Date().toISOString() };
  await writeJson(keyFor(lenderId), defaultFilePathFor(lenderId), stored, filePath);
  return { ok: true, value: stored };
}
