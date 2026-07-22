// lib/decidePriced.ts (Brief R follow-up, 2026-07-22)
// Composes decideLoan and priceLoan so an auto-approval can get the same risk-based
// discount an officer could already give a referred file by hand (Console.tsx's "adopt"
// button: reprice one tier, re-run decideLoan at the new rate). Neither engine changes
// this only calls them in sequence. Pure; no UI/DB/fs imports.
//
// Why re-decide rather than just report the discounted rate: a lower APR can free
// affordability headroom (same surplus/DSR cap, smaller installment per ringgit of
// principal), so the discounted terms can offer MORE than the ladder-rate decision did,
// not just the same amount at a friendlier rate.

import { DEFAULT_POLICY, decideLoan, type LoanDecision, type LoanDecisionInput } from './loans';
import { priceLoan, repriceProducts, type PricingSuggestion } from './pricing';
import type { CreditBand } from './securitization';

/**
 * decideLoan doesn't consume credit band (Brief R's pricing assistant is the only
 * consumer), so it isn't part of LoanDecisionInput. decidePriced needs it purely to call
 * priceLoan  it's threaded in here rather than added to LoanDecisionInput itself, which
 * would be an unrelated change to the decision engine's contract.
 */
export interface PricedLoanDecisionInput extends LoanDecisionInput {
  band: CreditBand;
}

export interface PricedLoanDecision {
  /** The ladder-rate decision, exactly as decideLoan returned it. */
  decision: LoanDecision;
  /** The pricing suggestion behind `priced`, or null when no tier was priced (decision
   *  wasn't an approve with a breakdown). */
  pricing: PricingSuggestion | null;
  /** The decision to actually offer: re-decided at the discounted rate when priceLoan found
   *  one below the ladder, otherwise identical to `decision` (same reference). */
  priced: LoanDecision;
}

export function decidePriced(input: PricedLoanDecisionInput, standingClean: boolean): PricedLoanDecision {
  const decision = decideLoan(input);
  if (decision.decision !== 'approve' || !decision.breakdown) {
    return { decision, pricing: null, priced: decision };
  }

  const tier = input.products.find((p) => p.label === decision.breakdown!.tierLabel);
  if (!tier) {
    // Should not happen  decideLoan selected this tier's label from input.products  but
    // fail safe rather than throw, matching Console.tsx's same lookup for the adopt strip.
    return { decision, pricing: null, priced: decision };
  }

  const policy = input.policy ?? DEFAULT_POLICY;
  const pricing = priceLoan({
    band: input.band,
    ladderApr: tier.apr,
    costOfFunds: policy.costOfFunds,
    targetReturn: policy.targetReturn,
    standingClean,
  });

  if (pricing.suggestedRate < tier.apr) {
    const priced = decideLoan({ ...input, products: repriceProducts(input.products, tier.label, pricing.suggestedRate) });
    return { decision, pricing, priced };
  }
  return { decision, pricing, priced: decision };
}
