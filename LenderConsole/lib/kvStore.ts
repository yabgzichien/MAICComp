// lib/kvStore.ts
// Pluggable JSON persistence so the console survives serverless hosts. A Vercel serverless
// function's filesystem is ephemeral  a write from one invocation isn't guaranteed to be
// visible to the next, so the plain file-based store (policyFile.ts / applicationsFile.ts's
// original design) silently resets the lender's live policy and direct-apply mailbox on
// Vercel. This module auto-upgrades to Redis (Upstash, via Vercel's KV/Redis marketplace
// integration) when the environment provides credentials, and otherwise falls back to a
// local JSON file  which is fine for local dev and any persistent (non-serverless) host.
//
// Callers pass an explicit `filePath` to force the file backend regardless of environment
// (used by tests, which can't reach a real Redis instance); omitting it selects the
// auto-detected backend.

import * as fs from 'fs';
import * as path from 'path';

/** Accepts either naming convention Vercel injects: the older "Vercel KV" integration used
 *  KV_REST_API_URL/KV_REST_API_TOKEN; the current Upstash-for-Redis marketplace integration
 *  uses UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN. */
function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

// Lazily imported so @upstash/redis never needs to resolve at runtime when it's not
// configured  keeps local dev and non-Vercel hosts dependency-free at runtime.
async function redisClient(creds: { url: string; token: string }) {
  const { Redis } = await import('@upstash/redis');
  return new Redis(creds);
}

function readFileJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    // BOM tolerance  Windows editors prepend one and JSON.parse rejects it.
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as T;
  } catch {
    return fallback;
  }
}

function writeFileJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

/**
 * Read a JSON value by key. `filePath`, if given, forces the local-file backend (tests and
 * explicit overrides); otherwise the backend is auto-selected  Redis when credentials are
 * present, else the file at `defaultFilePath`. Never throws: a missing key, missing file, or
 * unreachable store all resolve to `fallback`.
 */
export async function readJson<T>(key: string, defaultFilePath: string, fallback: T, filePath?: string): Promise<T> {
  if (!filePath) {
    const creds = redisCredentials();
    if (creds) {
      try {
        const redis = await redisClient(creds);
        const value = await redis.get<T>(key);
        return value ?? fallback;
      } catch {
        return fallback; // an unreachable store must never break the console
      }
    }
  }
  return readFileJson(filePath ?? defaultFilePath, fallback);
}

/** Write a JSON value by key, mirroring `readJson`'s backend selection. */
export async function writeJson(key: string, defaultFilePath: string, value: unknown, filePath?: string): Promise<void> {
  if (!filePath) {
    const creds = redisCredentials();
    if (creds) {
      const redis = await redisClient(creds);
      await redis.set(key, value);
      return;
    }
  }
  writeFileJson(filePath ?? defaultFilePath, value);
}
