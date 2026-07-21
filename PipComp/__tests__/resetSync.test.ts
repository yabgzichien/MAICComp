// TDD: borrower-side parse + selection for the lender-reset marker channel (data-consistency
// follow-up, 2026-07-20).
import { applicationsClearedByReset, clearedLoanMessage, parseResetMarker, type ResetMarker } from '../src/lib/resetSync';
import type { LoanApplication } from '../src/db/loansRepo';

function marker(overrides: Partial<ResetMarker> = {}): ResetMarker {
  return { resetAt: '2026-07-20T00:00:00.000Z', ...overrides };
}

function application(overrides: Partial<LoanApplication> = {}): LoanApplication {
  return {
    id: 'app-1',
    productId: 'emergency',
    requestedAmount: 500,
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

describe('parseResetMarker', () => {
  it('parses a valid marker', () => {
    expect(parseResetMarker(marker())).toEqual(marker());
  });

  it('reads null for a null/absent body (this lender has never reset)', () => {
    expect(parseResetMarker(null)).toBeNull();
    expect(parseResetMarker(undefined)).toBeNull();
  });

  it('rejects a missing/empty resetAt', () => {
    expect(parseResetMarker({ resetAt: '' })).toBeNull();
    expect(parseResetMarker({})).toBeNull();
  });

  it('rejects an unparsable resetAt', () => {
    expect(parseResetMarker({ resetAt: 'not-a-date' })).toBeNull();
  });

  it('ignores extra fields (e.g. the server-side lenderId echo)', () => {
    expect(parseResetMarker({ resetAt: marker().resetAt, lenderId: 'tekun' })).toEqual(marker());
  });
});

describe('applicationsClearedByReset', () => {
  it('clears a loan with this lender booked before the reset', () => {
    const app = application({ createdAt: '2026-07-01T00:00:00.000Z' });
    expect(applicationsClearedByReset(marker(), 'tekun', [app])).toEqual([app]);
  });

  it('leaves a loan booked after the reset alone (a fresh apply against the clean console)', () => {
    const app = application({ createdAt: '2026-08-01T00:00:00.000Z' });
    expect(applicationsClearedByReset(marker(), 'tekun', [app])).toEqual([]);
  });

  it('leaves a loan with a different lender alone', () => {
    const app = application({ lenderId: 'dana-niaga', createdAt: '2026-07-01T00:00:00.000Z' });
    expect(applicationsClearedByReset(marker(), 'tekun', [app])).toEqual([]);
  });

  it('leaves a self-decided (no-lender) application alone', () => {
    const app = application({ lenderId: null, createdAt: '2026-07-01T00:00:00.000Z' });
    expect(applicationsClearedByReset(marker(), 'tekun', [app])).toEqual([]);
  });

  it('clears every matching application, not just the first', () => {
    const a = application({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' });
    const b = application({ id: 'b', createdAt: '2026-07-05T00:00:00.000Z' });
    const c = application({ id: 'c', createdAt: '2026-08-01T00:00:00.000Z' });
    expect(applicationsClearedByReset(marker(), 'tekun', [a, b, c]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('returns empty for no applications', () => {
    expect(applicationsClearedByReset(marker(), 'tekun', [])).toEqual([]);
  });
});

describe('clearedLoanMessage', () => {
  it('returns empty string for no cleared loans', () => {
    expect(clearedLoanMessage([])).toBe('');
  });

  it('singular phrasing for one cleared loan', () => {
    const msg = clearedLoanMessage(['TEKUN Nasional']);
    expect(msg).toContain('TEKUN Nasional');
    expect(msg).toContain('A loan record');
    expect(msg).toContain('was cleared');
  });

  it('plural phrasing, and counts loans not distinct lenders, for two loans at the same lender', () => {
    const msg = clearedLoanMessage(['TEKUN Nasional', 'TEKUN Nasional']);
    expect(msg).toContain('2 loan records');
    expect(msg).toContain('were cleared');
    // still names the lender once, not twice
    expect(msg.match(/TEKUN Nasional/g)).toHaveLength(1);
  });

  it('joins two distinct lenders with "and"', () => {
    expect(clearedLoanMessage(['TEKUN Nasional', 'Dana Niaga Capital'])).toContain('TEKUN Nasional and Dana Niaga Capital');
  });

  it('joins three or more distinct lenders with an Oxford comma', () => {
    expect(clearedLoanMessage(['TEKUN Nasional', 'Dana Niaga Capital', 'Koperasi Usahawan Sejahtera'])).toContain(
      'TEKUN Nasional, Dana Niaga Capital, and Koperasi Usahawan Sejahtera'
    );
  });
});
