// Pure helper for the one-click counter-offer (Brief L). No engine math  the engine
// already computes `decision.maxAmount`, the largest principal the applicant's surplus
// and DSR will support. This module only decides WHEN the counter-offer strip should
// show and extracts the human-readable constraint that drove the reduction, so the strip
// and the credit memo cite the real reason instead of inventing one.

import type { LoanDecision } from './loans';

/** What the counter-offer strip renders: the supportable amount, its installment, and
 *  the reason the request was reduced. Null when the strip must be hidden. */
export interface CounterOffer {
  amount: number;
  installment: number;
  constraint: string;
}

/**
 * Visibility rule: the strip shows when the offered amount is positive AND strictly below
 * the parsed requested amount. Hidden when the offer meets or exceeds the request (nothing
 * to counter) and  critically  when the offer is zero (a decline, including the sample's
 * below-tier-minimum case where the supportable principal sits beneath the tier floor).
 * Counter-offering into an amount the engine declined on would misrepresent the decision.
 */
export function counterOfferFor(decision: LoanDecision, requestedAmount: number): CounterOffer | null {
  if (!(requestedAmount > 0)) return null;
  if (!(decision.maxAmount > 0)) return null;
  if (decision.maxAmount >= requestedAmount) return null;
  return {
    amount: decision.maxAmount,
    installment: decision.installment,
    constraint: drivingConstraintFrom(decision),
  };
}

/**
 * The constraint that drove the reduction  taken from the engine's OWN reason strings,
 * never invented. Prefers the categorized affordability reason that names the cap
 * ("capped at ... stays within"), since that is the precise mechanism; falls back to any
 * affordability reason, then a flat-reason keyword scan, then an honest generic line so
 * the memo never cites a constraint that wasn't actually recorded.
 */
export function drivingConstraintFrom(decision: LoanDecision): string {
  const categorized = decision.categorizedReasons;
  if (categorized && categorized.length > 0) {
    const affordability = categorized.filter((r) => r.category === 'affordability');
    if (affordability.length > 0) {
      const cap = affordability.find((r) => /capped at/i.test(r.text));
      if (cap) return cap.text;
      return affordability[0].text;
    }
  }
  // Flat-reason fallback for decisions that predate categorized reasons.
  const flatCap = decision.reasons.find((r) => /capped at/i.test(r));
  if (flatCap) return flatCap;
  const flatAfford = decision.reasons.find((r) => /affordab|surplus|DSR|installment|exceeds what affordability/i.test(r));
  if (flatAfford) return flatAfford;
  return 'Affordability  the requested amount exceeds what the surplus-share and DSR caps support.';
}
