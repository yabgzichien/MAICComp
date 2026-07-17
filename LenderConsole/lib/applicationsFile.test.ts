// TDD: server-side file persistence for direct-apply submissions (direct-apply-transport
// spec, 2026-07-11). Mirrors policyFile.ts's read/write-with-fallback pattern  same
// test shape as policyStore.test.ts's "read/write round-trip" block.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileApplication, type ApplicationRecord, type FileApplicationInput } from './applications';
import { appendServerApplication, readServerApplications } from './applicationsFile';

const NOW = new Date('2026-07-11T12:00:00.000Z');

function input(overrides: Partial<FileApplicationInput> = {}): FileApplicationInput {
  return {
    passportCode: '{"passport":{}}',
    subject: 'a'.repeat(64),
    applicantLabel: 'Aisyah binti Rahman',
    requestedAmount: 10000,
    engineDecision: 'refer',
    offeredAmount: 2769,
    installment: 180,
    tierLabel: 'Growth Capital',
    source: 'direct',
    ...overrides,
  };
}

describe('applicationsFile — server-side direct-apply store', () => {
  const tmp = path.join(os.tmpdir(), `applications-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('missing file reads back as an empty list', async () => {
    expect(await readServerApplications(tmp)).toEqual([]);
  });

  it('corrupt file falls back to an empty list instead of throwing', async () => {
    fs.writeFileSync(tmp, '{not json');
    expect(await readServerApplications(tmp)).toEqual([]);
  });

  it('appends a submission and reads it back identically', async () => {
    const result = await appendServerApplication(tmp, input(), NOW);
    expect(result.filed).toBe(true);
    const stored = await readServerApplications(tmp);
    expect(stored).toHaveLength(1);
    expect(stored[0].source).toBe('direct');
    expect(stored[0].subject).toBe('a'.repeat(64));
  });

  it('accumulates multiple submissions across separate calls (each call re-reads the file)', async () => {
    await appendServerApplication(tmp, input({ subject: 'b'.repeat(64) }), NOW);
    await appendServerApplication(tmp, input({ subject: 'c'.repeat(64) }), NOW);
    expect((await readServerApplications(tmp)).map((a: ApplicationRecord) => a.subject)).toEqual(['b'.repeat(64), 'c'.repeat(64)]);
  });

  it('dedupes on subject + requested amount, same as fileApplication', async () => {
    const first = await appendServerApplication(tmp, input({ subject: 'd'.repeat(64) }), NOW);
    const second = await appendServerApplication(tmp, input({ subject: 'd'.repeat(64) }), NOW);
    expect(first.filed).toBe(true);
    expect(second.filed).toBe(false);
    expect(await readServerApplications(tmp)).toHaveLength(1);
  });

  it('uses the same fileApplication logic under the hood — matching audit provenance', async () => {
    await appendServerApplication(tmp, input({ subject: 'e'.repeat(64) }), NOW);
    const stored = await readServerApplications(tmp);
    const viaLib = fileApplication([], input({ subject: 'e'.repeat(64) }), NOW).apps;
    expect(stored[0].audit).toEqual(viaLib[0].audit);
  });

  // Multi-lender direct-apply (2026-07-16): the lenderId param exists so each registry lender
  // gets its own mailbox (keyFor). An explicit filePath still wins for tests, so passing a
  // non-default lenderId alongside one must not break the round-trip (back-compat guarantee).
  it('accepts a lenderId param without disturbing the explicit-filePath round-trip', async () => {
    const result = await appendServerApplication(tmp, input({ subject: 'f'.repeat(64) }), NOW, 'koperasi-sejahtera');
    expect(result.filed).toBe(true);
    expect((await readServerApplications(tmp, 'koperasi-sejahtera')).map((a) => a.subject)).toEqual(['f'.repeat(64)]);
  });
});
