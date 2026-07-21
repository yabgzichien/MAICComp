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
});
