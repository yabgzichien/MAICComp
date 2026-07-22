// Decide + price a direct-apply submission (POST /api/apply), the same way Console.tsx's
// "adopt" strip already does for a manually-resolved file: merge this lender's own
// applications with the passport's signed cross-lender standing, and re-decide at the
// discounted rate priceLoan finds (if any). Pulled out of app/api/apply/route.ts (rather
// than left as a local helper there) for two reasons: Next.js's route-handler typegen
// rejects any export from a route.ts file that isn't a recognized handler/config name, so a
// helper worth unit-testing on its own can't live there; and this composition is pure once
// the caller has already read the lender's own applications  no request/response or fs
// imports, matching decidePriced.ts and repaymentStanding.ts's own lib-module shape.

import { decideLoan, type LoanDecision, type LoanDecisionInput } from './loans';
import { decidePriced } from './decidePriced';
import { mergedStanding } from './repaymentStanding';
import type { ApplicationRecord } from './applications';
import type { CreditPassport, PassportAssessment } from './passport';
import type { StoredPolicy } from './policyStore';
import type { PricingSuggestion } from './pricing';
import type { CreditBand } from './securitization';

export interface PriceDecisionResult {
  /** The decision to actually offer: discounted when standing/pricing allow it. */
  priced: LoanDecision;
  /** The pricing suggestion behind `priced`, or null when the discount path didn't run
   *  (fallback engaged) or found nothing below the ladder. */
  pricing: PricingSuggestion | null;
}

/** Falls back to a plain ladder-rate decideLoan  today's pre-Task-4 exact behaviour, with no
 *  adverseRecord/band/standingClean involved  on any throw from mergedStanding/decidePriced,
 *  so a bug in either degrades gracefully instead of blocking the applicant. */
export function priceDecision(
  passport: CreditPassport,
  assessment: PassportAssessment,
  requestedAmount: number,
  stored: StoredPolicy,
  lenderApps: ApplicationRecord[],
): PriceDecisionResult {
  const baseInput: LoanDecisionInput = {
    score: passport.score,
    confidence: assessment.confidence,
    avgMonthlySurplus: assessment.avgMonthlySurplus,
    monthlyDebtService: assessment.monthlyDebtService,
    avgIncome: assessment.avgIncome,
    requestedAmount,
    products: stored.products,
    coverageRatio: assessment.coverageRatio,
    coverageDaysCovered: assessment.coverageDays,
    policy: stored.policy,
  };
  try {
    const standing = mergedStanding(passport, lenderApps, stored);
    const { pricing, priced } = decidePriced({
      ...baseInput,
      adverseRecord: standing.current.adverseRecord,
      band: passport.band as CreditBand,
      standingClean: standing.discountEligible,
    });
    return { priced, pricing };
  } catch {
    return { priced: decideLoan(baseInput), pricing: null };
  }
}
