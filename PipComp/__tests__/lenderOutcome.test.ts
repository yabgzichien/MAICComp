// TDD: borrower-facing per-lender outcome copy (per-lender outcome preview, 2026-07-21).
import { filedFootText, lenderOutcome } from '../src/lib/lenderOutcome';
import { decideLoan, DEFAULT_PRODUCTS, type LoanDecision } from '../src/lib/loans';

function decision(over: Partial<LoanDecision> = {}): LoanDecision {
  return { decision: 'approve', maxAmount: 5000, installment: 482, reasons: [], ...over };
}

describe('lenderOutcome', () => {
  it('an approve says plainly that nobody has to sign off', () => {
    const o = lenderOutcome(decision(), 5000);
    expect(o.headline).toBe('Approved on the spot');
    expect(o.detail).toContain('RM5,000');
    expect(o.detail).toContain('no loan officer has to sign off');
  });

  it('an approve quotes the OFFERED amount, not the requested one, when they differ', () => {
    // Asking for 8,000 and being approved for 5,000 must not read as "approves RM8,000".
    expect(lenderOutcome(decision({ maxAmount: 5000 }), 8000).detail).toContain('RM5,000');
  });

  it('a refer quotes the engine’s own driving reason rather than inventing one', () => {
    const o = lenderOutcome(
      decision({
        decision: 'refer',
        maxAmount: 0,
        categorizedReasons: [
          { category: 'policy', text: 'Qualifies for the "Emergency Micro" tier.' },
          { category: 'data-quality', text: 'Coverage 17% (15 days of last 90) → Emergency Micro tier only; routed to manual review.' },
        ],
      }),
      500
    );
    expect(o.headline).toBe('A loan officer decides');
    expect(o.detail).toContain('Coverage 17%');
  });

  it('ranks a binding gate above a bare tier line', () => {
    const o = lenderOutcome(
      decision({
        decision: 'decline',
        maxAmount: 0,
        categorizedReasons: [
          { category: 'policy', text: 'Qualifies for the "Starter Capital" tier.' },
          { category: 'integrity', text: 'Income integrity floor breached.' },
        ],
      }),
      3000
    );
    expect(o.detail).toBe('Income integrity floor breached.');
  });

  it('falls back to an honest generic line when the engine gave no categorized reasons', () => {
    const refer = lenderOutcome(decision({ decision: 'refer', maxAmount: 0 }), 2000);
    expect(refer.detail).toContain('reviews RM2,000 by hand');
    const declined = lenderOutcome(decision({ decision: 'decline', maxAmount: 0 }), 2000);
    expect(declined.detail).toContain("can't fund RM2,000");
  });

  it('never claims a cause the engine did not give (regression: the invented "over what they approve automatically" line)', () => {
    const coverageGated = decideLoan({
      score: 736,
      band: 'Good',
      confidence: 0.71,
      avgMonthlySurplus: 1500,
      monthlyDebtService: 120,
      avgIncome: 2496,
      requestedAmount: 500,
      products: DEFAULT_PRODUCTS,
      coverageRatio: 0.17,
      coverageDaysCovered: 15,
    });
    // This borrower can comfortably afford 500 — the hold-up is thin coverage, at any amount.
    expect(coverageGated.decision).toBe('refer');
    const o = lenderOutcome(coverageGated, 500);
    expect(o.detail).toMatch(/coverage/i);
    expect(o.detail).not.toMatch(/over what they approve/i);
  });
});

describe('filedFootText', () => {
  it('an approval is not described as being in a review queue', () => {
    const t = filedFootText('approve', 'TEKUN Nasional');
    expect(t).toContain('no officer review needed');
    expect(t).toContain('nothing is borrowed until you accept it');
    expect(t).not.toMatch(/for review/i);
  });

  it('a refer says a person is looking at it', () => {
    expect(filedFootText('refer', 'TEKUN Nasional')).toContain('loan officer to review');
  });

  it('a decline reassures that nothing was borrowed and the score is untouched', () => {
    const t = filedFootText('decline', 'TEKUN Nasional');
    expect(t).toContain('Nothing was borrowed');
    expect(t).toContain('score is unaffected');
  });
});
