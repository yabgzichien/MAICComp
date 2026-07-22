// TDD: acceptance-state classification (borrower acceptance, 2026-07-21). Pure  no I/O.
import { describe, expect, it } from 'vitest';
import { acceptanceLabel, acceptanceStateFor, awaitingAcceptance, declinedByBorrower, isOfferRecord, liveBook, parseOfferBook, type OfferBook, type OfferRecord } from './offerAcceptance';
import type { ApplicationRecord } from './applications';

const SUBJECT = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

function app(over: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 'app-1',
    passportCode: '{}',
    subject: SUBJECT,
    applicantLabel: 'Aina',
    requestedAmount: 5000,
    engineDecision: 'approve',
    offeredAmount: 5000,
    installment: 482.53,
    status: 'approved',
    filedAt: '2026-07-21T12:00:00.000Z',
    notes: [],
    audit: [],
    ...over,
  };
}

function offer(over: Partial<OfferRecord> = {}): OfferRecord {
  return {
    subject: SUBJECT,
    lenderId: 'tekun',
    decision: 'approve',
    maxAmount: 5000,
    installment: 482.53,
    decidedAt: '2026-07-21T12:00:00.000Z',
    ...over,
  };
}

describe('isOfferRecord — applied APR and discount bps (auto-apply risk discount, 2026-07-22)', () => {
  it('accepts a valid apr/discountBps pair', () => {
    expect(isOfferRecord(offer({ apr: 0.24, discountBps: 400 }))).toBe(true);
  });

  it('rejects a non-positive apr', () => {
    expect(isOfferRecord(offer({ apr: -1 }))).toBe(false);
  });

  it('rejects apr: 0 — the guard requires strictly positive', () => {
    expect(isOfferRecord(offer({ apr: 0 }))).toBe(false);
  });

  it('rejects a non-integer discountBps', () => {
    expect(isOfferRecord(offer({ discountBps: 1.5 }))).toBe(false);
  });

  it('rejects a negative discountBps — the guard requires >= 0', () => {
    expect(isOfferRecord(offer({ discountBps: -1 }))).toBe(false);
  });

  it('accepts discountBps: 0 — a real value, not the same as absent', () => {
    expect(isOfferRecord(offer({ discountBps: 0 }))).toBe(true);
  });

  it('back-compat: still accepts a record with neither field', () => {
    expect(isOfferRecord(offer())).toBe(true);
  });
});

describe('acceptanceStateFor', () => {
  it('an approved file with an unanswered offer is awaiting the borrower', () => {
    expect(acceptanceStateFor(app(), { [SUBJECT]: offer() })).toBe('awaiting');
  });

  it('reports the borrower accepting', () => {
    const book: OfferBook = { [SUBJECT]: offer({ response: { state: 'accepted', at: '2026-07-21T13:00:00.000Z' } }) };
    expect(acceptanceStateFor(app(), book)).toBe('accepted');
  });

  it('reports the borrower declining', () => {
    const book: OfferBook = { [SUBJECT]: offer({ response: { state: 'declined', at: '2026-07-21T13:00:00.000Z' } }) };
    expect(acceptanceStateFor(app(), book)).toBe('declined');
  });

  it('an officer-filed or seeded file with no offer is ungoverned, not awaiting', () => {
    // The whole demo pipeline is seeded this way — treating it as unanswered would park an
    // already-disbursed book in a queue no borrower will ever answer.
    expect(acceptanceStateFor(app(), {})).toBeNull();
  });

  it('a referred or declined file is never awaiting acceptance', () => {
    const book: OfferBook = { [SUBJECT]: offer() };
    expect(acceptanceStateFor(app({ status: 'referred' }), book)).toBeNull();
    expect(acceptanceStateFor(app({ status: 'declined' }), book)).toBeNull();
    expect(acceptanceStateFor(app({ status: 'new' }), book)).toBeNull();
  });

  it('a stale approval at a different amount does not borrow the live offer answer', () => {
    const book: OfferBook = { [SUBJECT]: offer({ maxAmount: 3000, installment: 290 }) };
    expect(acceptanceStateFor(app({ offeredAmount: 5000 }), book)).toBeNull();
  });

  it('another borrower offer never leaks onto this file', () => {
    expect(acceptanceStateFor(app(), { [OTHER]: offer({ subject: OTHER }) })).toBeNull();
  });
});

describe('awaitingAcceptance', () => {
  it('returns only the unanswered approvals, in the given order', () => {
    const a = app({ id: 'a', subject: SUBJECT });
    const b = app({ id: 'b', subject: OTHER, offeredAmount: 2000, installment: 190 });
    const c = app({ id: 'c', subject: 'c'.repeat(64) });
    const book: OfferBook = {
      [SUBJECT]: offer(),
      [OTHER]: offer({ subject: OTHER, maxAmount: 2000, installment: 190, response: { state: 'accepted', at: 'x' } }),
    };
    expect(awaitingAcceptance([a, b, c], book).map((x) => x.id)).toEqual(['a']);
  });

  it('is empty for a pipeline with no offers at all', () => {
    expect(awaitingAcceptance([app()], {})).toEqual([]);
  });
});

describe('liveBook / declinedByBorrower', () => {
  const declinedOffer = offer({ response: { state: 'declined', at: '2026-07-21T13:00:00.000Z' } });

  it('drops an offer the borrower turned down — nobody took it, so it is not on the book', () => {
    expect(liveBook([app()], { [SUBJECT]: declinedOffer })).toEqual([]);
  });

  it('keeps accepted, awaiting, and ungoverned files', () => {
    const accepted = app({ id: 'acc', subject: SUBJECT });
    const awaiting = app({ id: 'awa', subject: OTHER, offeredAmount: 2000, installment: 190 });
    const seeded = app({ id: 'seed', subject: 'c'.repeat(64) });
    const b: OfferBook = {
      [SUBJECT]: offer({ response: { state: 'accepted', at: 'x' } }),
      [OTHER]: offer({ subject: OTHER, maxAmount: 2000, installment: 190 }),
    };
    expect(liveBook([accepted, awaiting, seeded], b).map((a) => a.id)).toEqual(['acc', 'awa', 'seed']);
  });

  it('does not rewrite the record status — the lender still approved it', () => {
    // The officer's own decision is a matter of record; only its place on the book changes.
    const a = app();
    expect(declinedByBorrower([a], { [SUBJECT]: declinedOffer })[0].status).toBe('approved');
  });

  it('declinedByBorrower returns exactly the turned-down files', () => {
    const turned = app({ id: 'no', subject: SUBJECT });
    const taken = app({ id: 'yes', subject: OTHER, offeredAmount: 2000, installment: 190 });
    const b: OfferBook = {
      [SUBJECT]: declinedOffer,
      [OTHER]: offer({ subject: OTHER, maxAmount: 2000, installment: 190, response: { state: 'accepted', at: 'x' } }),
    };
    expect(declinedByBorrower([turned, taken], b).map((a) => a.id)).toEqual(['no']);
  });

  it('an empty offer book leaves the whole pipeline live (seeded demo book)', () => {
    const apps = [app({ id: 'a' }), app({ id: 'b', subject: OTHER })];
    expect(liveBook(apps, {})).toHaveLength(2);
    expect(declinedByBorrower(apps, {})).toEqual([]);
  });
});

describe('parseOfferBook', () => {
  it('keeps valid entries and drops malformed ones individually', () => {
    const raw = { [SUBJECT]: offer(), [OTHER]: { subject: OTHER, maxAmount: -1 } };
    const parsed = parseOfferBook(raw);
    expect(Object.keys(parsed)).toEqual([SUBJECT]);
  });

  it('a non-object payload reads as an empty book rather than throwing', () => {
    expect(parseOfferBook(null)).toEqual({});
    expect(parseOfferBook([offer()])).toEqual({});
    expect(parseOfferBook('nope')).toEqual({});
  });
});

describe('acceptanceLabel', () => {
  it('names each state for the officer', () => {
    expect(acceptanceLabel('awaiting')).toBe('Awaiting borrower');
    expect(acceptanceLabel('accepted')).toBe('Accepted by borrower');
    expect(acceptanceLabel('declined')).toBe('Declined by borrower');
  });
});
