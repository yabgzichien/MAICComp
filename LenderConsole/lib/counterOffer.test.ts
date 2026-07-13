// Pure helper for the one-click counter-offer (Brief L) the visibility rule and the
// driving-constraint extraction, tested before the strip UI exists.
import { describe, expect, it } from 'vitest';
import { counterOfferFor, drivingConstraintFrom } from './counterOffer';
import type { LoanDecision } from './loans';

const CAP_REASON = 'Approved amount capped at RM3,445 so the installment (RM329/mo over 12 months at 28% APR) stays within 35% of avg surplus and a 40% DSR cap.';
const EXCEEDS_REASON = 'Requested RM4,000 exceeds what affordability supports; offering RM3,445 instead.';
const REFER_REASON = 'We could not verify enough of the recorded data (confidence 44%, below the 50% auto-approval floor) routed to manual review.';

function makeDecision(overrides: Partial<LoanDecision> = {}): LoanDecision {
  return {
    decision: 'approve',
    maxAmount: 3445,
    installment: 329,
    reasons: [CAP_REASON, EXCEEDS_REASON],
    categorizedReasons: [
      { category: 'policy', text: 'Qualifies for the "Starter Capital" tier.' },
      { category: 'affordability', text: CAP_REASON },
      { category: 'affordability', text: EXCEEDS_REASON },
    ],
    ...overrides,
  };
}

describe('counterOfferFor visibility rule', () => {
  it('shows when the offered amount is positive and strictly below the request', () => {
    const c = counterOfferFor(makeDecision(), 4000);
    expect(c).not.toBeNull();
    expect(c!.amount).toBe(3445);
    expect(c!.installment).toBe(329);
  });

  it('is hidden when the offer meets the request (no reduction)', () => {
    expect(counterOfferFor(makeDecision({ maxAmount: 4000 }), 4000)).toBeNull();
  });

  it('is hidden when the offer exceeds the request (offer covers the ask)', () => {
    expect(counterOfferFor(makeDecision({ maxAmount: 5000 }), 4000)).toBeNull();
  });

  it('is hidden when no offer was made the below-tier-minimum decline (sample case)', () => {
    // The sample passport's supportable RM2,769 sits below the Growth tier minimum (RM4,000),
    // so the engine declines with maxAmount 0 no counter-offer to make.
    expect(counterOfferFor(makeDecision({ decision: 'decline', maxAmount: 0, installment: 0 }), 10000)).toBeNull();
  });

  it('is hidden when the requested amount is zero / unparsed', () => {
    expect(counterOfferFor(makeDecision(), 0)).toBeNull();
  });

  it('is shown for a refer whose offer was still reduced (low-confidence refer with a positive offer)', () => {
    const c = counterOfferFor(makeDecision({ decision: 'refer' }), 8000);
    expect(c).not.toBeNull();
    expect(c!.amount).toBe(3445);
  });
});

describe('drivingConstraintFrom', () => {
  it('quotes the affordability cap reason that names the surplus-share / DSR cap', () => {
    expect(drivingConstraintFrom(makeDecision())).toBe(CAP_REASON);
  });

  it('falls back to the first affordability reason when no "capped" reason is present', () => {
    const onlyExceeds = makeDecision({
      categorizedReasons: [
        { category: 'policy', text: 'Qualifies for the "Starter Capital" tier.' },
        { category: 'affordability', text: EXCEEDS_REASON },
      ],
      reasons: [EXCEEDS_REASON],
    });
    expect(drivingConstraintFrom(onlyExceeds)).toBe(EXCEEDS_REASON);
  });

  it('falls back to a keyword scan of flat reasons when categorizedReasons is absent', () => {
    const flat = makeDecision({ categorizedReasons: undefined, reasons: [CAP_REASON, EXCEEDS_REASON] });
    expect(drivingConstraintFrom(flat)).toBe(CAP_REASON);
  });

  it('returns an honest generic line when no affordability reason exists at all', () => {
    const none = makeDecision({
      categorizedReasons: [{ category: 'data-quality', text: REFER_REASON }],
      reasons: [REFER_REASON],
    });
    const constraint = drivingConstraintFrom(none);
    expect(constraint.length).toBeGreaterThan(0);
    expect(constraint.toLowerCase()).toContain('affordability');
  });
});
