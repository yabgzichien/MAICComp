import {
  standingBucketFor,
  adverseRecordFor,
  overdueRowsFor,
  loanStandingFor,
  currentStandingAcross,
  curedArrearsEvents,
  scarAcross,
  computeRepaymentStanding,
} from '../src/lib/repaymentStanding';
import type { Repayment } from '../src/db/loansRepo';

const NOW = new Date('2026-07-21T00:00:00.000Z');

function repayment(overrides: Partial<Repayment>): Repayment {
  return {
    id: 'r1',
    applicationId: 'app1',
    dueDate: '2026-01-01',
    paidOn: null,
    amount: 300,
    status: 'scheduled',
    ...overrides,
  };
}

describe('standingBucketFor', () => {
  it('maps 0 to clean, 1 to slipping, 2 to arrears, 3+ to impaired', () => {
    expect(standingBucketFor(0)).toBe('clean');
    expect(standingBucketFor(1)).toBe('slipping');
    expect(standingBucketFor(2)).toBe('arrears');
    expect(standingBucketFor(3)).toBe('impaired');
    expect(standingBucketFor(7)).toBe('impaired');
  });
});

describe('adverseRecordFor', () => {
  it('collapses clean to none, slipping/arrears to soft, impaired to hard', () => {
    expect(adverseRecordFor('clean')).toBe('none');
    expect(adverseRecordFor('slipping')).toBe('soft');
    expect(adverseRecordFor('arrears')).toBe('soft');
    expect(adverseRecordFor('impaired')).toBe('hard');
  });
});

describe('overdueRowsFor', () => {
  it('returns rows past due that are not paid/late', () => {
    const rows = [
      repayment({ id: 'r1', dueDate: '2026-05-01', status: 'missed' }),
      repayment({ id: 'r2', dueDate: '2026-06-01', status: 'scheduled' }),
      repayment({ id: 'r3', dueDate: '2026-08-01', status: 'scheduled' }), // future
      repayment({ id: 'r4', dueDate: '2026-04-01', status: 'paid', paidOn: '2026-04-01' }),
    ];
    const overdue = overdueRowsFor(rows, NOW);
    expect(overdue.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });
});

describe('loanStandingFor', () => {
  it('is clean when nothing is overdue', () => {
    const rows = [repayment({ dueDate: '2026-08-01', status: 'scheduled' })];
    const s = loanStandingFor('app1', rows, false, NOW);
    expect(s).toEqual({ applicationId: 'app1', monthsInArrears: 0, amountOverdue: 0, bucket: 'clean' });
  });

  it('counts each overdue row as one month, summing their amounts', () => {
    const rows = [
      repayment({ id: 'r1', dueDate: '2026-05-01', amount: 300, status: 'missed' }),
      repayment({ id: 'r2', dueDate: '2026-06-01', amount: 300, status: 'scheduled' }),
    ];
    const s = loanStandingFor('app1', rows, false, NOW);
    expect(s).toEqual({ applicationId: 'app1', monthsInArrears: 2, amountOverdue: 600, bucket: 'arrears' });
  });

  it('treats a formally-defaulted application as impaired outright, counting every unresolved row (including not-yet-due ones)', () => {
    const rows = [
      repayment({ id: 'r1', dueDate: '2026-05-01', amount: 300, status: 'missed' }),
      repayment({ id: 'r2', dueDate: '2026-09-01', amount: 300, status: 'missed' }), // future due date, bulk-flipped by markApplicationDefaulted
    ];
    const s = loanStandingFor('app1', rows, true, NOW);
    expect(s.bucket).toBe('impaired');
    expect(s.amountOverdue).toBe(600);
  });
});

describe('currentStandingAcross', () => {
  it('is clean with no loans', () => {
    expect(currentStandingAcross([], NOW).bucket).toBe('clean');
  });

  it('takes the worst bucket across every loan', () => {
    const clean = { applicationId: 'a', repayments: [repayment({ dueDate: '2026-08-01', status: 'scheduled' })], defaulted: false };
    const behind = {
      applicationId: 'b',
      repayments: [repayment({ id: 'r2', dueDate: '2026-06-01', status: 'scheduled' })],
      defaulted: false,
    };
    const worst = currentStandingAcross([clean, behind], NOW);
    expect(worst.bucket).toBe('slipping');
    expect(worst.applicationId).toBe('b');
  });
});

describe('curedArrearsEvents', () => {
  it('finds a row paid a whole month or more after its due date', () => {
    const rows = [repayment({ id: 'r1', dueDate: '2026-04-01', paidOn: '2026-06-15', status: 'late', amount: 300 })];
    const events = curedArrearsEvents('app1', rows);
    expect(events).toEqual([{ applicationId: 'app1', dueDate: '2026-04-01', paidOn: '2026-06-15', monthsLate: 2 }]);
  });

  it('ignores rows paid on time or within the same month', () => {
    const rows = [
      repayment({ id: 'r1', dueDate: '2026-04-01', paidOn: '2026-04-01', status: 'paid' }),
      repayment({ id: 'r2', dueDate: '2026-04-01', paidOn: '2026-04-20', status: 'late' }),
    ];
    expect(curedArrearsEvents('app1', rows)).toEqual([]);
  });

  it('ignores rows with no paidOn (still unresolved)', () => {
    const rows = [repayment({ dueDate: '2026-04-01', status: 'missed', paidOn: null })];
    expect(curedArrearsEvents('app1', rows)).toEqual([]);
  });
});

describe('scarAcross', () => {
  it('is null with no cured arrears history', () => {
    const loans = [{ applicationId: 'a', repayments: [repayment({ dueDate: '2026-08-01', status: 'scheduled' })] }];
    expect(scarAcross(loans, NOW)).toBeNull();
  });

  it('reports the worst cured event within the trailing 12 months', () => {
    const loans = [
      {
        applicationId: 'a',
        repayments: [repayment({ id: 'r1', dueDate: '2026-02-01', paidOn: '2026-04-01', status: 'late', amount: 300 })], // 2 months late, 3 months ago
      },
    ];
    const scar = scarAcross(loans, NOW);
    expect(scar).toEqual({ bucket: 'arrears', reachedMonthsAgo: 3 });
  });

  it('drops events older than 12 months', () => {
    const loans = [
      {
        applicationId: 'a',
        repayments: [repayment({ id: 'r1', dueDate: '2024-01-01', paidOn: '2024-06-01', status: 'late', amount: 300 })],
      },
    ];
    expect(scarAcross(loans, NOW)).toBeNull();
  });
});

describe('computeRepaymentStanding', () => {
  it('is discount-eligible when clean or slipping, not when arrears or impaired', () => {
    const cleanLoans = [{ applicationId: 'a', repayments: [], defaulted: false }];
    expect(computeRepaymentStanding(cleanLoans, NOW).discountEligible).toBe(true);

    const slippingLoans = [{ applicationId: 'a', repayments: [repayment({ dueDate: '2026-06-01', status: 'scheduled' })], defaulted: false }];
    expect(computeRepaymentStanding(slippingLoans, NOW).discountEligible).toBe(true);

    const arrearsLoans = [
      {
        applicationId: 'a',
        repayments: [
          repayment({ id: 'r1', dueDate: '2026-05-01', status: 'missed' }),
          repayment({ id: 'r2', dueDate: '2026-06-01', status: 'scheduled' }),
        ],
        defaulted: false,
      },
    ];
    expect(computeRepaymentStanding(arrearsLoans, NOW).discountEligible).toBe(false);
  });

  it('recovers to clean, with the scar still present, once arrears are cured', () => {
    const loans = [
      {
        applicationId: 'a',
        repayments: [repayment({ id: 'r1', dueDate: '2026-05-01', paidOn: '2026-07-10', status: 'late', amount: 300 })],
        defaulted: false,
      },
    ];
    const standing = computeRepaymentStanding(loans, NOW);
    expect(standing.current.bucket).toBe('clean');
    expect(standing.current.adverseRecord).toBe('none');
    expect(standing.discountEligible).toBe(true);
    expect(standing.scar?.bucket).toBe('slipping');
  });
});
