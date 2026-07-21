// TDD: server-side persistence for the lender-reset marker (data-consistency follow-up,
// 2026-07-20). Same test shape as offersStore.test.ts / servicingStore.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readResetMarker, writeResetMarker } from './resetStore';

const NOW = new Date('2026-07-20T12:00:00.000Z');

describe('resetStore — lender-reset marker', () => {
  const tmp = path.join(os.tmpdir(), `reset-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('missing file reads back as never reset', async () => {
    expect(await readResetMarker(tmp)).toBeNull();
  });

  it('corrupt file falls back to null instead of throwing', async () => {
    fs.writeFileSync(tmp, '{not json');
    expect(await readResetMarker(tmp)).toBeNull();
  });

  it('stamps a reset and reads it back', async () => {
    const rec = await writeResetMarker(tmp, 'tekun', NOW);
    expect(rec).toEqual({ lenderId: 'tekun', resetAt: NOW.toISOString() });
    expect(await readResetMarker(tmp, 'tekun')).toEqual(rec);
  });

  it('latest reset wins', async () => {
    await writeResetMarker(tmp, 'tekun', NOW);
    const later = new Date('2026-08-20T12:00:00.000Z');
    await writeResetMarker(tmp, 'tekun', later);
    expect((await readResetMarker(tmp, 'tekun'))?.resetAt).toBe(later.toISOString());
  });

  it('keeps different lenders isolated', async () => {
    await writeResetMarker(tmp, 'tekun', NOW);
    expect(await readResetMarker(tmp, 'dana-niaga')).toBeNull();
  });

  it('rejects a malformed stored record (defensive read)', async () => {
    fs.writeFileSync(tmp, JSON.stringify({ lenderId: 'tekun', resetAt: 'not-a-date' }));
    expect(await readResetMarker(tmp)).toBeNull();
  });
});
