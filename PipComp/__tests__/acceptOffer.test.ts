import { productForOffer, buildBookedLoan, outstandingAfter } from '../src/lib/acceptOffer';
import type { DirectApplyDecision } from '../src/lib/directApply';
import type { LoanProduct } from '../src/lib/loans';

// Ascending by minScore, as real ladders are ordered.
const PRODUCTS: LoanProduct[] = [
  { id: 'emergency', label: 'Emergency Micro', minScore: 300, minAmount: 100, maxAmount: 500, tenorMonths: 6, apr: 0.36 },
  { id: 'starter', label: 'Starter Capital', minScore: 500, minAmount: 2000, maxAmount: 5000, tenorMonths: 12, apr: 0.28 },
  { id: 'growth', label: 'Growth Capital', minScore: 620, minAmount: 4000, maxAmount: 10000, tenorMonths: 18, apr: 0.22 },
  { id: 'scale', label: 'Scale Capital', minScore: 740, minAmount: 8000, maxAmount: 20000, tenorMonths: 24, apr: 0.16 },
];

const approveOffer = (overrides: Partial<DirectApplyDecision> = {}): DirectApplyDecision => ({
  decision: 'approve',
  maxAmount: 4500,
  installment: 410.5,
  reasons: [],
  ...overrides,
});

describe('productForOffer', () => {
  it('returns the product whose range contains the amount when only one range matches', () => {
    // 300 is only within emergency's [100, 500] range.
    const p = productForOffer(approveOffer({ maxAmount: 300 }), PRODUCTS);
    expect(p?.id).toBe('emergency');
  });

  it('returns the highest-minScore product among several whose ranges contain the amount', () => {
    // 4500 is within starter [2000,5000] AND growth [4000,10000]. growth has the higher minScore.
    const p = productForOffer(approveOffer({ maxAmount: 4500 }), PRODUCTS);
    expect(p?.id).toBe('growth');
  });

  it('ties on minScore are broken by the largest maxAmount', () => {
    const tiedProducts: LoanProduct[] = [
      { id: 'a', label: 'A', minScore: 600, minAmount: 100, maxAmount: 1000, tenorMonths: 6, apr: 0.2 },
      { id: 'b', label: 'B', minScore: 600, minAmount: 100, maxAmount: 2000, tenorMonths: 6, apr: 0.2 },
    ];
    const p = productForOffer(approveOffer({ maxAmount: 500 }), tiedProducts);
    expect(p?.id).toBe('b');
  });

  it('falls back to the largest-maxAmount product when the amount is below all ranges', () => {
    const p = productForOffer(approveOffer({ maxAmount: 50 }), PRODUCTS);
    expect(p?.id).toBe('scale'); // scale has the largest maxAmount (20000)
  });

  it('falls back to the largest-maxAmount product when the amount is above all ranges', () => {
    const p = productForOffer(approveOffer({ maxAmount: 999999 }), PRODUCTS);
    expect(p?.id).toBe('scale');
  });

  it('returns null when products is empty', () => {
    const p = productForOffer(approveOffer(), []);
    expect(p).toBeNull();
  });
});

describe('buildBookedLoan', () => {
  const acceptedAt = new Date(Date.UTC(2026, 0, 15)); // 2026-01-15

  it('produces a schedule of length tenorMonths with every amount equal to offer.installment', () => {
    const offer = approveOffer({ maxAmount: 4500, installment: 410.5 });
    const loan = buildBookedLoan(offer, PRODUCTS, acceptedAt);
    expect(loan).not.toBeNull();
    const product = PRODUCTS.find((p) => p.id === loan!.productId)!;
    expect(loan!.schedule.length).toBe(product.tenorMonths);
    for (const entry of loan!.schedule) {
      expect(entry.amount).toBe(410.5);
    }
    expect(loan!.principal).toBe(4500);
    expect(loan!.productId).toBe('growth');
  });

  it('first due date is one month after acceptedAt and dates step monthly', () => {
    const offer = approveOffer({ maxAmount: 4500, installment: 410.5 });
    const loan = buildBookedLoan(offer, PRODUCTS, acceptedAt);
    expect(loan!.schedule[0].dueDate).toBe('2026-02-15');
    expect(loan!.schedule[1].dueDate).toBe('2026-03-15');
    expect(loan!.schedule[2].dueDate).toBe('2026-04-15');
  });

  it('clamps month-end dates: accepting on Jan 31 schedules first due Feb 28 (non-leap year)', () => {
    const jan31 = new Date(Date.UTC(2026, 0, 31));
    const offer = approveOffer({ maxAmount: 300 }); // -> emergency tier
    const loan = buildBookedLoan(offer, PRODUCTS, jan31);
    expect(loan).not.toBeNull();
    expect(loan!.schedule[0].dueDate).toBe('2026-02-28');
    expect(loan!.schedule[1].dueDate).toBe('2026-03-31');
  });

  it('returns null for a refer decision', () => {
    const offer = approveOffer({ decision: 'refer' });
    expect(buildBookedLoan(offer, PRODUCTS, acceptedAt)).toBeNull();
  });

  it('returns null for a decline decision', () => {
    const offer = approveOffer({ decision: 'decline' });
    expect(buildBookedLoan(offer, PRODUCTS, acceptedAt)).toBeNull();
  });

  it('returns null when maxAmount is 0', () => {
    const offer = approveOffer({ maxAmount: 0 });
    expect(buildBookedLoan(offer, PRODUCTS, acceptedAt)).toBeNull();
  });

  it('returns null when products is empty', () => {
    const offer = approveOffer();
    expect(buildBookedLoan(offer, [], acceptedAt)).toBeNull();
  });

  it('is deterministic: same inputs produce identical output', () => {
    const offer = approveOffer({ maxAmount: 4500, installment: 410.5 });
    const a = buildBookedLoan(offer, PRODUCTS, acceptedAt);
    const b = buildBookedLoan(offer, PRODUCTS, acceptedAt);
    expect(a).toEqual(b);
  });
});

describe('outstandingAfter', () => {
  it('is the full principal when nothing has been paid', () => {
    expect(outstandingAfter(2000, 12, 0)).toBe(2000);
  });

  it('falls straight-line by principal/tenor per payment', () => {
    // 2400 over 12 months = 200 principal retired per payment.
    expect(outstandingAfter(2400, 12, 1)).toBe(2200);
    expect(outstandingAfter(2400, 12, 6)).toBe(1200);
    expect(outstandingAfter(2400, 12, 11)).toBe(200);
  });

  it('reaches exactly zero on the final payment and never goes negative', () => {
    expect(outstandingAfter(2000, 12, 12)).toBe(0);
    expect(outstandingAfter(2000, 12, 15)).toBe(0); // over-paid guard
  });

  it('rounds to whole RM', () => {
    // 2000 / 12 = 166.67; after 1 paid, 11/12 * 2000 = 1833.33 -> 1833
    expect(outstandingAfter(2000, 12, 1)).toBe(1833);
  });

  it('guards a zero/negative tenor', () => {
    expect(outstandingAfter(2000, 0, 0)).toBe(0);
  });
});
