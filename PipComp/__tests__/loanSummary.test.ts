// TDD: per-loan package view + aggregate stats for My Financing (polish, 2026-07-19). Groups
// the flat repayments list by application so the screen can show one card per loan instead of
// every installment mixed together.
import { buildLoanPackages, financingTotals } from '../src/lib/loanSummary';
import type { LoanApplication, Repayment, RepaymentStatus } from '../src/db/loansRepo';
import type { LoanProduct } from '../src/lib/loans';

const PRODUCTS: LoanProduct[] = [
  { id: 'starter', label: 'Starter Capital', minScore: 500, minAmount: 2000, maxAmount: 5000, tenorMonths: 12, apr: 0.28 },
  { id: 'growth', label: 'Growth Capital', minScore: 620, minAmount: 4000, maxAmount: 10000, tenorMonths: 18, apr: 0.22 },
];

let seq = 0;
function application(overrides: Partial<LoanApplication> = {}): LoanApplication {
  const id = overrides.id ?? `app-${seq++}`;
  return {
    id,
    productId: 'starter',
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
    purpose: { category: 'emergency' },
    ...overrides,
  };
}

function repayment(applicationId: string, seqNum: number, status: RepaymentStatus, amount = 482.53, overrides: Partial<Repayment> = {}): Repayment {
  return {
    id: `${applicationId}-r${seqNum}`,
    applicationId,
    dueDate: `2026-0${seqNum}-18`,
    paidOn: status === 'paid' || status === 'late' ? `2026-0${seqNum}-18T00:00:00.000Z` : null,
    amount,
    status,
    ...overrides,
  };
}

describe('buildLoanPackages', () => {
  it('slices the flat repayments list per application', () => {
    const apps = [application({ id: 'a' }), application({ id: 'b', requestedAmount: 3000 })];
    const repayments = [repayment('a', 1, 'paid'), repayment('a', 2, 'scheduled'), repayment('b', 1, 'scheduled')];
    const [pkgA, pkgB] = buildLoanPackages(apps, repayments, PRODUCTS);
    expect(pkgA.repayments.map((r) => r.id)).toEqual(['a-r1', 'a-r2']);
    expect(pkgB.repayments.map((r) => r.id)).toEqual(['b-r1']);
  });

  it('resolves the lender, product, and purpose labels', () => {
    const app = application({ productId: 'growth', purpose: { category: 'working-capital' } });
    const [pkg] = buildLoanPackages([app], [], PRODUCTS);
    expect(pkg.lenderLabel).toBe('TEKUN Nasional');
    expect(pkg.productLabel).toBe('Growth Capital');
    expect(pkg.purposeLabel).toBe('Working capital');
  });

  it('falls back to "Not stated" when no purpose was declared', () => {
    const [pkg] = buildLoanPackages([application({ purpose: null })], [], PRODUCTS);
    expect(pkg.purposeLabel).toBe('Not stated');
  });

  it('falls back to the raw product id when unknown, mirroring the old productLabel helper', () => {
    const [pkg] = buildLoanPackages([application({ productId: 'mystery' })], [], PRODUCTS);
    expect(pkg.productLabel).toBe('mystery');
  });

  it('counts paid (incl. late), missed, and remaining instalments', () => {
    const app = application({ id: 'a' });
    const repayments = [
      repayment('a', 1, 'paid'),
      repayment('a', 2, 'late'),
      repayment('a', 3, 'missed'),
      repayment('a', 4, 'scheduled'),
      repayment('a', 5, 'scheduled'),
    ];
    const [pkg] = buildLoanPackages([app], repayments, PRODUCTS);
    expect(pkg.tenorMonths).toBe(5);
    expect(pkg.paidCount).toBe(2);
    expect(pkg.missedCount).toBe(1);
    expect(pkg.remainingCount).toBe(2);
    expect(pkg.monthlyInstallment).toBe(482.53);
  });

  it('nextDue is the earliest scheduled instalment, or null once nothing is left', () => {
    const done = buildLoanPackages([application({ id: 'a' })], [repayment('a', 1, 'paid')], PRODUCTS)[0];
    expect(done.nextDue).toBeNull();
    const pending = buildLoanPackages([application({ id: 'a' })], [repayment('a', 1, 'paid'), repayment('a', 2, 'scheduled')], PRODUCTS)[0];
    expect(pending.nextDue?.id).toBe('a-r2');
  });

  it('computes outstanding principal straight-line from paidCount, tenor, and principal', () => {
    // Good band: RM5000 principal, 5-instalment schedule, 2 paid -> 5000 * (5-2)/5 = 3000.
    const app = application({ id: 'a', requestedAmount: 5000 });
    const repayments = [repayment('a', 1, 'paid'), repayment('a', 2, 'paid'), repayment('a', 3, 'scheduled'), repayment('a', 4, 'scheduled'), repayment('a', 5, 'scheduled')];
    const [pkg] = buildLoanPackages([app], repayments, PRODUCTS);
    expect(pkg.outstandingPrincipal).toBe(3000);
  });

  it('derives status: ongoing while scheduled instalments remain', () => {
    const [pkg] = buildLoanPackages([application({ id: 'a' })], [repayment('a', 1, 'scheduled')], PRODUCTS);
    expect(pkg.status).toBe('ongoing');
  });

  it('derives status: settled once every instalment resolves with nothing missed outstanding', () => {
    const apps = [application({ id: 'a' })];
    const [pkg] = buildLoanPackages(apps, [repayment('a', 1, 'paid'), repayment('a', 2, 'paid')], PRODUCTS);
    expect(pkg.status).toBe('settled');
    expect(pkg.outstandingPrincipal).toBe(0);
  });

  it('derives status: defaulted from the application, regardless of remaining schedule', () => {
    const apps = [application({ id: 'a', status: 'defaulted', defaultedAt: '2026-08-01T00:00:00.000Z', defaultedSource: 'lender' })];
    const [pkg] = buildLoanPackages(apps, [repayment('a', 1, 'missed'), repayment('a', 2, 'missed')], PRODUCTS);
    expect(pkg.status).toBe('defaulted');
  });
});

describe('financingTotals', () => {
  it('sums monthly instalment and outstanding principal across ongoing packages only', () => {
    const ongoing = buildLoanPackages(
      [application({ id: 'a', requestedAmount: 5000 })],
      [repayment('a', 1, 'paid'), repayment('a', 2, 'scheduled'), repayment('a', 3, 'scheduled'), repayment('a', 4, 'scheduled'), repayment('a', 5, 'scheduled')],
      PRODUCTS
    );
    const totals = financingTotals(ongoing);
    expect(totals.totalMonthlyRepayment).toBe(482.53);
    expect(totals.totalUnpaidPrincipal).toBe(4000); // 5000 * (5-1)/5
  });

  it('excludes a settled (fully resolved) loan from both totals', () => {
    const settled = buildLoanPackages([application({ id: 'a' })], [repayment('a', 1, 'paid'), repayment('a', 2, 'paid')], PRODUCTS);
    expect(financingTotals(settled)).toEqual({ totalMonthlyRepayment: 0, totalUnpaidPrincipal: 0 });
  });

  it('excludes a defaulted loan from both totals', () => {
    const apps = [application({ id: 'a', status: 'defaulted', defaultedAt: '2026-08-01T00:00:00.000Z', defaultedSource: 'lender' })];
    const defaulted = buildLoanPackages(apps, [repayment('a', 1, 'missed'), repayment('a', 2, 'missed')], PRODUCTS);
    expect(financingTotals(defaulted)).toEqual({ totalMonthlyRepayment: 0, totalUnpaidPrincipal: 0 });
  });

  it('sums across multiple ongoing loans', () => {
    const apps = [application({ id: 'a', requestedAmount: 5000 }), application({ id: 'b', requestedAmount: 2000 })];
    const repayments = [
      repayment('a', 1, 'scheduled', 500),
      repayment('b', 1, 'scheduled', 200),
    ];
    const totals = financingTotals(buildLoanPackages(apps, repayments, PRODUCTS));
    expect(totals.totalMonthlyRepayment).toBe(700);
    expect(totals.totalUnpaidPrincipal).toBe(5000 + 2000);
  });

  it('an empty list sums to zero', () => {
    expect(financingTotals([])).toEqual({ totalMonthlyRepayment: 0, totalUnpaidPrincipal: 0 });
  });
});
