import { describe, expect, it } from 'vitest';
import {
  standingBucketFor,
  adverseRecordFor,
  loanStandingFor,
  currentStandingAcross,
  scarAcross,
  computeRepaymentStanding,
  mergedStanding,
} from './repaymentStanding';
import type { ApplicationRecord, RepaymentEvent } from './applications';
import type { CreditPassport } from './passport';
import { DEFAULT_STORED_POLICY } from './policyStore';

const NOW = new Date('2026-07-21T00:00:00.000Z');

function app(overrides: Partial<ApplicationRecord>): ApplicationRecord {
  return {
    id: 'app1',
    passportCode: '',
    subject: 'sub1',
    applicantLabel: 'Test',
    requestedAmount: 3600,
    engineDecision: 'approve',
    offeredAmount: 3600,
    installment: 300,
    status: 'approved',
    filedAt: '2026-01-21T00:00:00.000Z',
    resolvedAt: '2026-01-21T00:00:00.000Z',
    notes: [],
    audit: [],
    ...overrides,
  };
}

function ev(overrides: Partial<RepaymentEvent>): RepaymentEvent {
  return { at: '2026-02-21T00:00:00.000Z', instalmentSeq: 1, amount: 300, outcome: 'on-time', ...overrides };
}

describe('standingBucketFor / adverseRecordFor', () => {
  it('matches the locked bucket table', () => {
    expect(standingBucketFor(0)).toBe('clean');
    expect(standingBucketFor(1)).toBe('slipping');
    expect(standingBucketFor(2)).toBe('arrears');
    expect(standingBucketFor(4)).toBe('impaired');
    expect(adverseRecordFor('clean')).toBe('none');
    expect(adverseRecordFor('slipping')).toBe('soft');
    expect(adverseRecordFor('arrears')).toBe('soft');
    expect(adverseRecordFor('impaired')).toBe('hard');
  });
});

describe('loanStandingFor', () => {
  it('is clean when every due instalment is paid', () => {
    const a = app({ repayments: [ev({ instalmentSeq: 1, at: '2026-02-21T00:00:00.000Z', outcome: 'on-time' })] });
    const s = loanStandingFor(a, 1, NOW); // tenor 1: only 1 instalment ever due
    expect(s.bucket).toBe('clean');
    expect(s.monthsInArrears).toBe(0);
  });

  it('counts unpaid due instalments as months behind, priced at the installment amount', () => {
    const a = app({ installment: 300, repayments: [] }); // nothing paid, 6 months elapsed, tenor 12
    const s = loanStandingFor(a, 12, NOW);
    expect(s.monthsInArrears).toBe(6);
    expect(s.amountOverdue).toBe(1800);
    expect(s.bucket).toBe('impaired');
  });

  it('a missed event does not count as paid', () => {
    const a = app({ installment: 300, repayments: [ev({ instalmentSeq: 1, outcome: 'missed' })] });
    const s = loanStandingFor(a, 1, NOW);
    expect(s.monthsInArrears).toBe(1);
  });

  it('a formally-defaulted loan is impaired outright', () => {
    const a = app({ defaulted: { value: true, source: 'lender', at: '2026-03-01T00:00:00.000Z' }, installment: 300, repayments: [] });
    const s = loanStandingFor(a, 12, NOW);
    expect(s.bucket).toBe('impaired');
  });
});

describe('currentStandingAcross', () => {
  it('takes the worst across every loan', () => {
    const clean = { app: app({ id: 'a', repayments: [ev({ instalmentSeq: 1 })] }), tenorMonths: 1 };
    const behind = { app: app({ id: 'b', installment: 300, repayments: [] }), tenorMonths: 12 };
    const worst = currentStandingAcross([clean, behind], NOW);
    expect(worst.applicationId).toBe('b');
    expect(worst.bucket).toBe('impaired');
  });

  it('is clean with no applications', () => {
    expect(currentStandingAcross([], NOW).bucket).toBe('clean');
  });
});

describe('scarAcross', () => {
  it('is null when the loan was always current', () => {
    const a = { app: app({ repayments: [ev({ instalmentSeq: 1, at: '2026-02-21T00:00:00.000Z', outcome: 'on-time' })] }), tenorMonths: 1 };
    expect(scarAcross([a], NOW)).toBeNull();
  });

  it('finds a historical peak that has since recovered', () => {
    const a = {
      app: app({
        filedAt: '2026-05-21T00:00:00.000Z',
        resolvedAt: '2026-05-21T00:00:00.000Z',
        installment: 300,
        repayments: [
          ev({ instalmentSeq: 1, at: '2026-07-05T00:00:00.000Z', outcome: 'late' }),
        ],
      }),
      tenorMonths: 12,
    };
    const scar = scarAcross([a], NOW);
    expect(scar).not.toBeNull();
    expect(scar!.bucket).toBe('slipping');
  });

  it('drops a peak older than 12 months', () => {
    const a = {
      app: app({
        filedAt: '2023-01-21T00:00:00.000Z',
        resolvedAt: '2023-01-21T00:00:00.000Z',
        installment: 300,
        repayments: [ev({ instalmentSeq: 1, at: '2023-06-21T00:00:00.000Z', outcome: 'late' })],
      }),
      tenorMonths: 60,
    };
    expect(scarAcross([a], NOW)).toBeNull();
  });

  it('does not double-count consecutive late payments into a worse bucket than either landed at', () => {
    const a = {
      app: app({
        filedAt: '2026-01-21T00:00:00.000Z',
        resolvedAt: '2026-01-21T00:00:00.000Z',
        installment: 300,
        repayments: [
          ev({ instalmentSeq: 1, at: '2026-03-05T00:00:00.000Z', outcome: 'late' }), // 1 month behind at the moment it landed
          ev({ instalmentSeq: 2, at: '2026-04-05T00:00:00.000Z', outcome: 'late' }), // still only 1 month behind, not 2
        ],
      }),
      tenorMonths: 12,
    };
    const scar = scarAcross([a], NOW);
    expect(scar).not.toBeNull();
    expect(scar!.bucket).toBe('slipping');
  });

  it('picks the worst peak across multiple loans, regardless of which is more recent', () => {
    const milder = {
      app: app({
        id: 'a',
        filedAt: '2026-05-21T00:00:00.000Z',
        resolvedAt: '2026-05-21T00:00:00.000Z',
        installment: 300,
        repayments: [ev({ instalmentSeq: 1, at: '2026-07-05T00:00:00.000Z', outcome: 'late' })], // slipping, 0 months ago
      }),
      tenorMonths: 12,
    };
    const worse = {
      app: app({
        id: 'b',
        filedAt: '2026-01-21T00:00:00.000Z',
        resolvedAt: '2026-01-21T00:00:00.000Z',
        installment: 300,
        repayments: [ev({ instalmentSeq: 1, at: '2026-06-05T00:00:00.000Z', outcome: 'late' })], // impaired, 1 month ago
      }),
      tenorMonths: 12,
    };
    const scar = scarAcross([milder, worse], NOW);
    expect(scar).toEqual({ bucket: 'impaired', reachedMonthsAgo: 1 });
  });
});

describe('computeRepaymentStanding', () => {
  it('is discount-eligible only at clean/slipping', () => {
    const cleanArgs = [{ app: app({ repayments: [ev({ instalmentSeq: 1 })] }), tenorMonths: 1 }];
    expect(computeRepaymentStanding(cleanArgs, NOW).discountEligible).toBe(true);

    const arrearsArgs = [{ app: app({ installment: 300, filedAt: '2026-05-21T00:00:00.000Z', resolvedAt: '2026-05-21T00:00:00.000Z', repayments: [] }), tenorMonths: 12 }];
    expect(computeRepaymentStanding(arrearsArgs, NOW).discountEligible).toBe(false);
  });
});

function passport(overrides: Partial<CreditPassport>): CreditPassport {
  return {
    subject: 'sub1',
    score: 700,
    band: 'B',
    factorSummary: [],
    provenanceSummary: '',
    evidenceHash: '',
    repaymentRecord: { onTime: 0, total: 0 },
    issuedAt: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergedStanding', () => {
  it('is not discount-eligible when the passport carries a signed arrears standing and there are no own applications', () => {
    const p = passport({
      standing: {
        current: { bucket: 'arrears', adverseRecord: 'soft', monthsInArrears: 2, amountOverdue: 600 },
        scar: null,
        discountEligible: false,
      },
    });
    const standing = mergedStanding(p, [], DEFAULT_STORED_POLICY);
    expect(standing.discountEligible).toBe(false);
  });

  it('is discount-eligible for a clean passport with no own loans', () => {
    const p = passport({
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
    });
    const standing = mergedStanding(p, [], DEFAULT_STORED_POLICY);
    expect(standing.discountEligible).toBe(true);
  });
});
