// TDD: server-side persistence for the shared servicing ledger (Bidirectional Servicing
// Sync, 2026-07-18 design). Same test shape as applicationsFile.test.ts's read/write
// round-trip block, plus coverage of the merge-on-write behaviour.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readServicingBook, readServicingRecord, writeServicingEvent } from './servicingStore';

const NOW = new Date('2026-07-18T12:00:00.000Z');
const SUBJECT = 'a'.repeat(64);

describe('servicingStore — server-side shared servicing ledger', () => {
  const tmp = path.join(os.tmpdir(), `servicing-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('missing file reads back as no record', async () => {
    expect(await readServicingRecord(SUBJECT, tmp)).toBeNull();
    expect(await readServicingBook(tmp)).toEqual({});
  });

  it('corrupt file falls back to empty instead of throwing', async () => {
    fs.writeFileSync(tmp, '{not json');
    expect(await readServicingRecord(SUBJECT, tmp)).toBeNull();
  });

  it('lazily creates a record on first write, seeding tenor/installment from the writer', async () => {
    const rec = await writeServicingEvent(tmp, 'tekun', SUBJECT, { tenorMonths: 12, installment: 500, event: { instalmentSeq: 1, outcome: 'on-time' }, source: 'lender' }, NOW);
    expect(rec.tenorMonths).toBe(12);
    expect(rec.installment).toBe(500);
    expect(rec.events).toEqual([{ instalmentSeq: 1, outcome: 'on-time', at: NOW.toISOString(), source: 'lender' }]);

    const stored = await readServicingRecord(SUBJECT, tmp);
    expect(stored).toEqual(rec);
  });

  it('accumulates events across separate calls (each call re-reads the file)', async () => {
    await writeServicingEvent(tmp, 'tekun', SUBJECT, { tenorMonths: 12, installment: 500, event: { instalmentSeq: 1, outcome: 'on-time' }, source: 'lender' }, NOW);
    const second = new Date('2026-08-18T12:00:00.000Z');
    await writeServicingEvent(tmp, 'tekun', SUBJECT, { event: { instalmentSeq: 2, outcome: 'missed' }, source: 'borrower' }, second);

    const stored = await readServicingRecord(SUBJECT, tmp);
    expect(stored?.events.map((e) => e.instalmentSeq)).toEqual([1, 2]);
    // the schedule coordinate set on first write is retained, not overwritten by a later
    // write that doesn't carry one
    expect(stored?.tenorMonths).toBe(12);
    expect(stored?.installment).toBe(500);
  });

  it('a later write for the same instalment supersedes the earlier one (correction)', async () => {
    await writeServicingEvent(tmp, 'tekun', SUBJECT, { tenorMonths: 12, installment: 500, event: { instalmentSeq: 1, outcome: 'missed' }, source: 'lender' }, NOW);
    const corrected = new Date('2026-07-19T12:00:00.000Z');
    await writeServicingEvent(tmp, 'tekun', SUBJECT, { event: { instalmentSeq: 1, outcome: 'on-time' }, source: 'borrower' }, corrected);

    const stored = await readServicingRecord(SUBJECT, tmp);
    expect(stored?.events).toEqual([{ instalmentSeq: 1, outcome: 'on-time', at: corrected.toISOString(), source: 'borrower' }]);
  });

  it('a default raise latches true and survives a later non-default write', async () => {
    await writeServicingEvent(tmp, 'tekun', SUBJECT, { tenorMonths: 12, installment: 500, default: true, source: 'lender' }, NOW);
    await writeServicingEvent(tmp, 'tekun', SUBJECT, { event: { instalmentSeq: 1, outcome: 'on-time' }, source: 'borrower' }, new Date('2026-08-01T00:00:00.000Z'));

    const stored = await readServicingRecord(SUBJECT, tmp);
    expect(stored?.defaulted.value).toBe(true);
  });

  it('keeps different subjects isolated within the same lender book', async () => {
    await writeServicingEvent(tmp, 'tekun', SUBJECT, { tenorMonths: 12, installment: 500, event: { instalmentSeq: 1, outcome: 'on-time' }, source: 'lender' }, NOW);
    await writeServicingEvent(tmp, 'tekun', 'b'.repeat(64), { tenorMonths: 6, installment: 200, event: { instalmentSeq: 1, outcome: 'late' }, source: 'lender' }, NOW);

    const book = await readServicingBook(tmp);
    expect(Object.keys(book).sort()).toEqual([SUBJECT, 'b'.repeat(64)].sort());
    expect(book[SUBJECT].tenorMonths).toBe(12);
    expect(book['b'.repeat(64)].tenorMonths).toBe(6);
  });

  // Mirrors applicationsFile.test.ts's own "lenderId param" test: an explicit filePath still
  // wins over lender-keyed file selection (that's the point of passing one in tests), so this
  // only checks the round-trip works with a non-default lenderId alongside it.
  it('accepts a lenderId param without disturbing the explicit-filePath round-trip', async () => {
    await writeServicingEvent(tmp, 'koperasi-sejahtera', SUBJECT, { tenorMonths: 12, installment: 500, event: { instalmentSeq: 1, outcome: 'on-time' }, source: 'lender' }, NOW);
    const stored = await readServicingRecord(SUBJECT, tmp, 'koperasi-sejahtera');
    expect(stored?.lenderId).toBe('koperasi-sejahtera');
    expect(stored?.events).toHaveLength(1);
  });
});
