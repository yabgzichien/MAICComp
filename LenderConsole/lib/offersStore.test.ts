// TDD: server-side persistence for the approved-offer back-channel (approval-notify,
// 2026-07-19). Same test shape as servicingStore.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readOffer, readOfferBook, writeOffer } from './offersStore';

const NOW = new Date('2026-07-19T12:00:00.000Z');
const SUBJECT = 'a'.repeat(64);

describe('offersStore — approved-offer back-channel', () => {
  const tmp = path.join(os.tmpdir(), `offers-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('missing file reads back as no offer', async () => {
    expect(await readOffer(SUBJECT, tmp)).toBeNull();
    expect(await readOfferBook(tmp)).toEqual({});
  });

  it('corrupt file falls back to empty instead of throwing', async () => {
    fs.writeFileSync(tmp, '{not json');
    expect(await readOffer(SUBJECT, tmp)).toBeNull();
  });

  it('publishes an offer and reads it back', async () => {
    const rec = await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53 }, NOW);
    expect(rec).toEqual({ subject: SUBJECT, lenderId: 'tekun', decision: 'approve', maxAmount: 5000, installment: 482.53, decidedAt: NOW.toISOString() });
    expect(await readOffer(SUBJECT, tmp)).toEqual(rec);
  });

  it('latest write wins for the same subject', async () => {
    await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53 }, NOW);
    const later = new Date('2026-08-19T12:00:00.000Z');
    await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 3000, installment: 290 }, later);
    const stored = await readOffer(SUBJECT, tmp);
    expect(stored?.maxAmount).toBe(3000);
    expect(stored?.decidedAt).toBe(later.toISOString());
  });

  it('keeps different subjects isolated within the same lender book', async () => {
    await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53 }, NOW);
    await writeOffer(tmp, 'tekun', 'b'.repeat(64), { maxAmount: 2000, installment: 190 }, NOW);
    const book = await readOfferBook(tmp);
    expect(Object.keys(book).sort()).toEqual([SUBJECT, 'b'.repeat(64)].sort());
  });

  it('rejects a malformed stored record (defensive read)', async () => {
    fs.writeFileSync(tmp, JSON.stringify({ [SUBJECT]: { subject: SUBJECT, lenderId: 'tekun', decision: 'approve', maxAmount: -1, installment: 0, decidedAt: NOW.toISOString() } }));
    expect(await readOffer(SUBJECT, tmp)).toBeNull();
  });

  it('accepts a lenderId param without disturbing the explicit-filePath round-trip', async () => {
    await writeOffer(tmp, 'koperasi-sejahtera', SUBJECT, { maxAmount: 5000, installment: 482.53 }, NOW);
    const stored = await readOffer(SUBJECT, tmp, 'koperasi-sejahtera');
    expect(stored?.lenderId).toBe('koperasi-sejahtera');
  });

  it('publishes and round-trips the declared purpose (My Financing polish, 2026-07-19)', async () => {
    const rec = await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53, purpose: { category: 'emergency', note: 'medical bill' } }, NOW);
    expect(rec.purpose).toEqual({ category: 'emergency', note: 'medical bill' });
    expect((await readOffer(SUBJECT, tmp))?.purpose).toEqual({ category: 'emergency', note: 'medical bill' });
  });

  it('omits purpose entirely when none was declared', async () => {
    const rec = await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53 }, NOW);
    expect(rec.purpose).toBeUndefined();
  });

  it('a stored record with a malformed purpose is rejected (defensive read)', async () => {
    fs.writeFileSync(
      tmp,
      JSON.stringify({ [SUBJECT]: { subject: SUBJECT, lenderId: 'tekun', decision: 'approve', maxAmount: 5000, installment: 482.53, decidedAt: NOW.toISOString(), purpose: { category: 'not-a-real-category' } } })
    );
    expect(await readOffer(SUBJECT, tmp)).toBeNull();
  });
});
