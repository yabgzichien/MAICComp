// TDD: borrower-side parse + dedupe for the approved-offer back-channel (approval-notify,
// 2026-07-19).
import { offerToDecision, parseOffer, pendingOffers, type Offer } from '../src/lib/offers';
import type { LoanApplication } from '../src/db/loansRepo';

const SUBJECT = 'a'.repeat(64);

function offer(overrides: Partial<Offer> = {}): Offer {
  return { subject: SUBJECT, lenderId: 'tekun', decision: 'approve', maxAmount: 5000, installment: 482.53, decidedAt: '2026-07-19T00:00:00.000Z', ...overrides };
}

function application(overrides: Partial<LoanApplication> = {}): LoanApplication {
  return {
    id: 'app-1',
    productId: 'growth',
    requestedAmount: 5000,
    decision: 'approve',
    scoreAt: 700,
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    lenderLabel: 'TEKUN Nasional',
    liabilityAccountId: 'liab-1',
    lenderId: 'tekun',
    defaultedAt: null,
    defaultedSource: null,
    purpose: null,
    ...overrides,
  };
}

describe('parseOffer', () => {
  it('parses a valid approved offer', () => {
    expect(parseOffer(offer())).toEqual(offer());
  });

  it('reads null for a null/absent body (no offer published)', () => {
    expect(parseOffer(null)).toBeNull();
    expect(parseOffer(undefined)).toBeNull();
  });

  it('rejects a non-approve decision', () => {
    expect(parseOffer({ ...offer(), decision: 'decline' })).toBeNull();
  });

  it('rejects a non-positive amount', () => {
    expect(parseOffer({ ...offer(), maxAmount: 0 })).toBeNull();
  });

  it('rejects missing subject/lenderId/decidedAt', () => {
    expect(parseOffer({ ...offer(), subject: '' })).toBeNull();
    expect(parseOffer({ ...offer(), lenderId: '' })).toBeNull();
    expect(parseOffer({ ...offer(), decidedAt: 123 })).toBeNull();
  });
});

describe('parseOffer — applied APR and discount bps (auto-apply risk discount, 2026-07-22)', () => {
  it('keeps a valid apr/discountBps pair', () => {
    const parsed = parseOffer({ ...offer(), apr: 0.24, discountBps: 400 });
    expect(parsed?.apr).toBe(0.24);
    expect(parsed?.discountBps).toBe(400);
  });

  it('drops a malformed apr while keeping the rest of the offer', () => {
    const parsed = parseOffer({ ...offer(), apr: -1 });
    expect(parsed).not.toBeNull();
    expect(parsed?.apr).toBeUndefined();
  });

  it('drops apr: 0 — the guard requires strictly positive', () => {
    const parsed = parseOffer({ ...offer(), apr: 0 });
    expect(parsed).not.toBeNull();
    expect(parsed?.apr).toBeUndefined();
  });

  it('drops a non-integer discountBps while keeping the rest of the offer', () => {
    const parsed = parseOffer({ ...offer(), discountBps: 1.5 });
    expect(parsed).not.toBeNull();
    expect(parsed?.discountBps).toBeUndefined();
  });

  it('drops a negative discountBps — the guard requires >= 0', () => {
    const parsed = parseOffer({ ...offer(), discountBps: -1 });
    expect(parsed).not.toBeNull();
    expect(parsed?.discountBps).toBeUndefined();
  });

  it('keeps discountBps: 0 — a legitimate value, not "absent"', () => {
    expect(parseOffer({ ...offer(), discountBps: 0 })?.discountBps).toBe(0);
  });

  it('omits both fields when absent from the payload', () => {
    const parsed = parseOffer(offer());
    expect(parsed?.apr).toBeUndefined();
    expect(parsed?.discountBps).toBeUndefined();
    expect(parsed && 'apr' in parsed).toBe(false);
    expect(parsed && 'discountBps' in parsed).toBe(false);
  });
});

describe('offerToDecision', () => {
  it('maps an offer to the accept-offer DirectApplyDecision shape', () => {
    expect(offerToDecision(offer())).toEqual({ decision: 'approve', maxAmount: 5000, installment: 482.53, reasons: [] });
  });
});

describe('pendingOffers', () => {
  it('returns an offer for a lender the borrower has no loan with', () => {
    expect(pendingOffers([offer({ lenderId: 'koperasi-sejahtera' })], [application({ lenderId: 'tekun' })])).toHaveLength(1);
  });

  it('skips an offer for a lender the borrower already has a loan with (dedupe)', () => {
    expect(pendingOffers([offer({ lenderId: 'tekun' })], [application({ lenderId: 'tekun' })])).toEqual([]);
  });

  it('dedupes regardless of the existing loan status (active/completed/defaulted all count)', () => {
    expect(pendingOffers([offer({ lenderId: 'tekun' })], [application({ lenderId: 'tekun', status: 'defaulted' })])).toEqual([]);
  });

  it('returns all offers when the borrower has no loans yet', () => {
    expect(pendingOffers([offer(), offer({ lenderId: 'dana-niaga' })], [])).toHaveLength(2);
  });

  it('ignores applications with no lenderId when deduping', () => {
    expect(pendingOffers([offer({ lenderId: 'tekun' })], [application({ lenderId: null })])).toHaveLength(1);
  });

  // Borrower acceptance, 2026-07-21: an answered offer is finished, whichever way it was
  // answered. Read from the lender's own record, so it survives a reinstall.
  it('drops an offer the borrower has already accepted', () => {
    expect(pendingOffers([offer({ response: { state: 'accepted', at: '2026-07-21T00:00:00.000Z' } })], [])).toEqual([]);
  });

  it('drops an offer the borrower has already declined — a turned-down offer must not nag', () => {
    expect(pendingOffers([offer({ response: { state: 'declined', at: '2026-07-21T00:00:00.000Z' } })], [])).toEqual([]);
  });

  it('keeps an unanswered offer alongside an answered one from another lender', () => {
    const answered = offer({ lenderId: 'tekun', response: { state: 'declined', at: '2026-07-21T00:00:00.000Z' } });
    const open = offer({ lenderId: 'dana-niaga' });
    expect(pendingOffers([answered, open], []).map((o) => o.lenderId)).toEqual(['dana-niaga']);
  });
});

describe('parseOffer — borrower response block (borrower acceptance, 2026-07-21)', () => {
  it('parses an accepted response', () => {
    const parsed = parseOffer({ ...offer(), response: { state: 'accepted', at: '2026-07-21T00:00:00.000Z' } });
    expect(parsed?.response).toEqual({ state: 'accepted', at: '2026-07-21T00:00:00.000Z' });
  });

  it('parses a declined response', () => {
    expect(parseOffer({ ...offer(), response: { state: 'declined', at: '2026-07-21T00:00:00.000Z' } })?.response?.state).toBe('declined');
  });

  it('omits response entirely when the lender has not recorded one', () => {
    expect(parseOffer(offer())?.response).toBeUndefined();
  });

  it('drops a malformed response rather than the whole offer — the offer stays answerable', () => {
    // Failing open is deliberate: re-showing an offer the borrower may already have answered
    // is recoverable, silently losing one they haven't is not.
    const parsed = parseOffer({ ...offer(), response: { state: 'maybe', at: '2026-07-21T00:00:00.000Z' } });
    expect(parsed).not.toBeNull();
    expect(parsed?.response).toBeUndefined();
  });

  it('drops a response with no timestamp', () => {
    expect(parseOffer({ ...offer(), response: { state: 'accepted' } })?.response).toBeUndefined();
  });
});
