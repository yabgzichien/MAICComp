// Pluggable persistence (see kvStore.ts's header for why this exists): a Vercel serverless
// function's filesystem is ephemeral, so policyFile.ts/applicationsFile.ts need a backend that
// survives it. Covers both the file-backend fallback (used whenever an explicit filePath is
// given, or no Redis credentials are configured) and the auto-selected Redis path.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    delete process.env[key];
  }
}

describe('kvStore — file backend (no Redis configured)', () => {
  const tmp = path.join(os.tmpdir(), `kvstore-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    process.env = { ...ORIGINAL_ENV };
  });

  it('an explicit filePath always uses the file backend, even with Redis credentials present', async () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'token';
    const { readJson, writeJson } = await import('./kvStore');
    await writeJson('some-key', tmp, { hello: 'world' }, tmp);
    expect(await readJson('some-key', tmp, null, tmp)).toEqual({ hello: 'world' });
    // Written to the actual file, not a mocked Redis client.
    expect(fs.existsSync(tmp)).toBe(true);
  });

  it('with no filePath and no Redis credentials, falls back to defaultFilePath', async () => {
    const { readJson, writeJson } = await import('./kvStore');
    await writeJson('k', tmp, { a: 1 });
    expect(await readJson('k', tmp, null)).toEqual({ a: 1 });
  });

  it('a missing or corrupt file resolves to the fallback instead of throwing', async () => {
    const { readJson } = await import('./kvStore');
    expect(await readJson('k', tmp, 'fallback-value')).toBe('fallback-value');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, '{not json');
    expect(await readJson('k', tmp, 'fallback-value')).toBe('fallback-value');
  });
});

describe('kvStore — Redis backend (auto-selected when credentials are present)', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
    vi.doMock('@upstash/redis', () => {
      const store = new Map<string, unknown>();
      class Redis {
        get = vi.fn(async (key: string) => store.get(key) ?? null);
        set = vi.fn(async (key: string, value: unknown) => {
          store.set(key, value);
        });
      }
      return { Redis, __store: store };
    });
  });
  afterEach(() => {
    vi.doUnmock('@upstash/redis');
    process.env = { ...ORIGINAL_ENV };
  });

  it('uses Redis (not the file) once KV_REST_API_URL/TOKEN are set', async () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'token';
    const { readJson, writeJson } = await import('./kvStore');
    const unusedFilePath = path.join(os.tmpdir(), `kvstore-should-not-be-written-${Math.random()}.json`);
    await writeJson('flag', unusedFilePath, { via: 'redis' });
    expect(await readJson('flag', unusedFilePath, null)).toEqual({ via: 'redis' });
    expect(fs.existsSync(unusedFilePath)).toBe(false);
  });

  it('also accepts the UPSTASH_REDIS_REST_* naming (the current marketplace integration)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    const { readJson, writeJson } = await import('./kvStore');
    await writeJson('flag2', '/unused', { via: 'upstash-naming' });
    expect(await readJson('flag2', '/unused', null)).toEqual({ via: 'upstash-naming' });
  });

  it('a missing key resolves to the fallback', async () => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'token';
    const { readJson } = await import('./kvStore');
    expect(await readJson('never-set', '/unused', 'fallback')).toBe('fallback');
  });
});
