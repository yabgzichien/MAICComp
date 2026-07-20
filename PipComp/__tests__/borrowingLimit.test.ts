import {
  progressionCap,
  outstandingExposure,
  computeBorrowingLimit,
  DEFAULT_PROGRESSION,
} from '../src/lib/borrowingLimit';
import type { LoanApplication } from '../src/db/loansRepo';

const app = (over: Partial<LoanApplication> = {}): LoanApplication => ({
  id: 'a1',
  productId: 'starter',
  requestedAmount: 2000,
  decision: 'approve',
  scoreAt: 700,
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  lenderLabel: 'TEKUN',
  liabilityAccountId: 'acc1',
  lenderId: null,
  defaultedAt: null,
  defaultedSource: null,
  purpose: null,
  ...over,
});

describe('progressionCap', () => {
  it('is the first-loan cap for a borrower with no repayment record', () => {
    expect(progressionCap(0, 0, 20000)).toBe(DEFAULT_PROGRESSION.firstLoanCap);
  });

  it('grows by the step for each on-time repayment', () => {
    expect(progressionCap(2, 0, 20000)).toBe(5000 + 2 * 1500); // 8000
  });

  it('is cut by the penalty for each missed installment', () => {
    expect(progressionCap(2, 1, 20000)).toBe(5000 + 3000 - 3000); // 5000
  });

  it('never drops below zero', () => {
    expect(progressionCap(0, 5, 20000)).toBe(0);
  });

  it('never exceeds the ladder max', () => {
    expect(progressionCap(20, 0, 10000)).toBe(10000);
  });
});

describe('outstandingExposure', () => {
  const values = { acc1: 1833, acc2: 4000 };

  it('sums linked liability-account values across active loans', () => {
    const apps = [app({ id: 'a1', liabilityAccountId: 'acc1' }), app({ id: 'a2', liabilityAccountId: 'acc2' })];
    expect(outstandingExposure(apps, values)).toBe(1833 + 4000);
  });

  it('ignores non-active loans', () => {
    const apps = [app({ liabilityAccountId: 'acc1', status: 'completed' })];
    expect(outstandingExposure(apps, values)).toBe(0);
  });

  it('ignores loans with no linked liability account (legacy rows)', () => {
    const apps = [app({ liabilityAccountId: null })];
    expect(outstandingExposure(apps, values)).toBe(0);
  });
});

describe('computeBorrowingLimit', () => {
  it('affordability binds when the engine max is below the progression cap', () => {
    // First loan (cap 5000), engine only supports 3656.
    const r = computeBorrowingLimit({
      engineMax: 3656,
      ladderMax: 20000,
      repaymentOnTime: 0,
      repaymentMissed: 0,
      outstandingPrincipal: 0,
    });
    expect(r.limit).toBe(3656);
    expect(r.available).toBe(3656);
    expect(r.binding).toBe('affordability');
  });

  it('progression binds when the repayment cap is below the engine max', () => {
    // Engine could afford 12000, but a first-timer is capped to 5000.
    const r = computeBorrowingLimit({
      engineMax: 12000,
      ladderMax: 20000,
      repaymentOnTime: 0,
      repaymentMissed: 0,
      outstandingPrincipal: 0,
    });
    expect(r.progressionCap).toBe(5000);
    expect(r.limit).toBe(5000);
    expect(r.binding).toBe('progression');
  });

  it('subtracts outstanding exposure and reports it as the binding constraint', () => {
    const r = computeBorrowingLimit({
      engineMax: 12000,
      ladderMax: 20000,
      repaymentOnTime: 3, // cap = 5000 + 4500 = 9500
      repaymentMissed: 0,
      outstandingPrincipal: 4000,
    });
    expect(r.limit).toBe(9500);
    expect(r.available).toBe(5500);
    expect(r.binding).toBe('exposure');
  });

  it('floors available at zero when exposure exceeds the limit', () => {
    const r = computeBorrowingLimit({
      engineMax: 5000,
      ladderMax: 20000,
      repaymentOnTime: 0,
      repaymentMissed: 0,
      outstandingPrincipal: 5000,
    });
    expect(r.available).toBe(0);
    expect(r.binding).toBe('exposure');
  });

  it('a missed payment lowers the available limit versus a clean record', () => {
    const clean = computeBorrowingLimit({
      engineMax: 20000,
      ladderMax: 20000,
      repaymentOnTime: 3,
      repaymentMissed: 0,
      outstandingPrincipal: 0,
    });
    const missed = computeBorrowingLimit({
      engineMax: 20000,
      ladderMax: 20000,
      repaymentOnTime: 3,
      repaymentMissed: 1,
      outstandingPrincipal: 0,
    });
    expect(missed.available).toBeLessThan(clean.available);
  });

  it('is deterministic', () => {
    const input = {
      engineMax: 8000,
      ladderMax: 20000,
      repaymentOnTime: 1,
      repaymentMissed: 0,
      outstandingPrincipal: 1000,
    };
    expect(computeBorrowingLimit(input)).toEqual(computeBorrowingLimit(input));
  });
});
