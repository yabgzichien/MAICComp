// TDD: server-side persistence for the approved-offer back-channel (approval-notify,
// 2026-07-19). Same test shape as servicingStore.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { clearOfferBook, readOffer, readOfferBook, recordOfferResponse, writeOffer } from './offersStore';

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

  it('clearOfferBook empties the book (lender-reset-to-defaults, 2026-07-20)', async () => {
    await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53 }, NOW);
    await clearOfferBook(tmp, 'tekun');
    expect(await readOffer(SUBJECT, tmp)).toBeNull();
    expect(await readOfferBook(tmp)).toEqual({});
  });

  describe('apr / discountBps (auto-apply risk discount, 2026-07-22)', () => {
    it('publishes and round-trips apr and discountBps', async () => {
      const rec = await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53, apr: 0.24, discountBps: 400 }, NOW);
      expect(rec.apr).toBe(0.24);
      expect(rec.discountBps).toBe(400);
      const stored = await readOffer(SUBJECT, tmp);
      expect(stored?.apr).toBe(0.24);
      expect(stored?.discountBps).toBe(400);
    });

    it('discountBps: 0 survives the round trip — it is a real value, not absent', async () => {
      const rec = await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53, discountBps: 0 }, NOW);
      expect(rec.discountBps).toBe(0);
      expect((await readOffer(SUBJECT, tmp))?.discountBps).toBe(0);
    });

    it('omits apr/discountBps entirely when neither was supplied', async () => {
      const rec = await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 5000, installment: 482.53 }, NOW);
      expect(rec.apr).toBeUndefined();
      expect(rec.discountBps).toBeUndefined();
    });

    it('a same-terms republish still refreshes apr/discountBps — they are not gated on sameTerms like decidedAt/response are (documented behavior, see writeOffer)', async () => {
      const terms = { maxAmount: 5000, installment: 482.53 };
      await writeOffer(tmp, 'tekun', SUBJECT, { ...terms, apr: 0.3, discountBps: 0 }, NOW);
      const later = new Date('2026-07-23T09:00:00.000Z');
      const republished = await writeOffer(tmp, 'tekun', SUBJECT, { ...terms, apr: 0.24, discountBps: 400 }, later);
      // maxAmount/installment unchanged → sameTerms is true → decidedAt does NOT bump...
      expect(republished.decidedAt).toBe(NOW.toISOString());
      // ...but apr/discountBps still take the new call's values.
      expect(republished.apr).toBe(0.24);
      expect(republished.discountBps).toBe(400);
    });
  });

  describe('borrower response (borrower acceptance, 2026-07-21)', () => {
    const LATER = new Date('2026-07-21T09:00:00.000Z');
    const terms = { maxAmount: 5000, installment: 482.53 };

    it('a freshly published offer carries no response — it is awaiting the borrower', async () => {
      const rec = await writeOffer(tmp, 'tekun', SUBJECT, terms, NOW);
      expect(rec.response).toBeUndefined();
    });

    it('records an acceptance and reads it back', async () => {
      await writeOffer(tmp, 'tekun', SUBJECT, terms, NOW);
      const rec = await recordOfferResponse(tmp, 'tekun', SUBJECT, 'accepted', LATER);
      expect(rec?.response).toEqual({ state: 'accepted', at: LATER.toISOString() });
      expect((await readOffer(SUBJECT, tmp))?.response).toEqual({ state: 'accepted', at: LATER.toISOString() });
    });

    it('records a decline the same way', async () => {
      await writeOffer(tmp, 'tekun', SUBJECT, terms, NOW);
      const rec = await recordOfferResponse(tmp, 'tekun', SUBJECT, 'declined', LATER);
      expect(rec?.response?.state).toBe('declined');
    });

    it('responding to a subject with no offer returns null and writes nothing', async () => {
      expect(await recordOfferResponse(tmp, 'tekun', SUBJECT, 'accepted', LATER)).toBeNull();
      expect(await readOfferBook(tmp)).toEqual({});
    });

    it('first answer wins — a second response cannot flip an acceptance', async () => {
      await writeOffer(tmp, 'tekun', SUBJECT, terms, NOW);
      await recordOfferResponse(tmp, 'tekun', SUBJECT, 'accepted', LATER);
      const again = await recordOfferResponse(tmp, 'tekun', SUBJECT, 'declined', new Date('2026-07-22T09:00:00.000Z'));
      expect(again?.response).toEqual({ state: 'accepted', at: LATER.toISOString() });
    });

    it('re-publishing the SAME terms keeps the acceptance — an idempotent re-apply must not un-book a live loan', async () => {
      await writeOffer(tmp, 'tekun', SUBJECT, terms, NOW);
      await recordOfferResponse(tmp, 'tekun', SUBJECT, 'accepted', LATER);
      const republished = await writeOffer(tmp, 'tekun', SUBJECT, terms, new Date('2026-07-23T09:00:00.000Z'));
      expect(republished.response).toEqual({ state: 'accepted', at: LATER.toISOString() });
      expect(republished.decidedAt).toBe(NOW.toISOString());
    });

    it('publishing DIFFERENT terms clears the old answer — new terms need a new decision', async () => {
      await writeOffer(tmp, 'tekun', SUBJECT, terms, NOW);
      await recordOfferResponse(tmp, 'tekun', SUBJECT, 'accepted', LATER);
      const retermed = await writeOffer(tmp, 'tekun', SUBJECT, { maxAmount: 3000, installment: 290 }, LATER);
      expect(retermed.response).toBeUndefined();
      expect(retermed.decidedAt).toBe(LATER.toISOString());
    });

    it('a stored record with a malformed response is rejected (defensive read)', async () => {
      fs.writeFileSync(
        tmp,
        JSON.stringify({ [SUBJECT]: { subject: SUBJECT, lenderId: 'tekun', decision: 'approve', maxAmount: 5000, installment: 482.53, decidedAt: NOW.toISOString(), response: { state: 'maybe', at: NOW.toISOString() } } })
      );
      expect(await readOffer(SUBJECT, tmp)).toBeNull();
    });
  });
});
