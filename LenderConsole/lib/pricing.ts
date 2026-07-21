// lib/pricing.ts (Brief R)
// Deterministic risk-based pricing assistant. Computed AFTER decideLoan  it never
// changes approve/refer/decline or the affordable principal (adopting a rate re-runs
// the engine at the new APR; that lives in the console). PD reuses securitization.ts's
// band mapping. The suggested rate is clamped to the tier's ladder APR (a ceiling  the
// assistant discounts strong files, it never surcharges past the published ladder) and
// floored at the lender's cost of funds. Pure; no UI imports.

import { DEFAULT_ASSUMPTIONS, loanPD, type CreditBand } from './securitization';
import type { LoanProduct } from './loans';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export interface PricingInputs {
  band: CreditBand;
  /** The applicant's tier APR  the ceiling the suggestion is clamped to. */
  ladderApr: number;
  /** Lender's blended annual cost of funds (policy field). */
  costOfFunds: number;
  /** Target annual net return above break-even (policy field). */
  targetReturn: number;
  /** Loss given default; defaults to the securitization engine's assumption. */
  lgd?: number;
  /** Repayment standing (2026-07-21 design): the loyalty discount only applies when the
   *  applicant's current standing is clean or slipping (RepaymentStanding.discountEligible).
   *  Defaults to true for back-compat with callers that predate this input — today's behavior. */
  standingClean?: boolean;
}

/** Unit economics of writing the loan at a given annual rate (all decimals, per annum). */
export interface UnitEconomics {
  rate: number;
  expectedYield: number;   // gross annual yield on principal = rate
  expectedLoss: number;    // annual expected-loss rate = PD × LGD
  netMargin: number;       // rate − cost of funds − expected loss
}

export interface PricingSuggestion {
  pd: number;
  expectedLossRate: number;
  breakEvenRate: number;   // cost of funds + expected loss
  suggestedRate: number;   // clamp(break-even + target, costOfFunds, ladderApr)
  ladderApr: number;
  /** ladderApr − suggestedRate, in basis points (0 when clamped at the ceiling). */
  discountBps: number;
  ladder: UnitEconomics;
  suggested: UnitEconomics;
  reasons: string[];
}

export function priceLoan(inputs: PricingInputs): PricingSuggestion {
  const lgd = inputs.lgd ?? DEFAULT_ASSUMPTIONS.lgd;
  const pd = loanPD(inputs.band, 0); // approved loans cleared the fraud gate. Band-driven PD
  const expectedLossRate = pd * lgd;
  const breakEvenRate = inputs.costOfFunds + expectedLossRate;
  const standingClean = inputs.standingClean ?? true;
  const suggestedRate = standingClean
    ? clamp(breakEvenRate + inputs.targetReturn, inputs.costOfFunds, inputs.ladderApr)
    : Math.max(inputs.costOfFunds, inputs.ladderApr); // matches clamp()'s own floor-wins precedent if a policy ever sets ladderApr below cost of funds
  const discountBps = Math.max(0, Math.round((inputs.ladderApr - suggestedRate) * 10000));

  const econ = (rate: number): UnitEconomics => ({
    rate,
    expectedYield: rate,
    expectedLoss: expectedLossRate,
    netMargin: rate - inputs.costOfFunds - expectedLossRate,
  });

  const reasons: string[] = [
    `Default probability ${pct(pd)} for the ${inputs.band} band → expected loss ${pct(expectedLossRate)} (LGD ${pct(lgd)}).`,
    `Break-even ${pct(breakEvenRate)} = cost of funds ${pct(inputs.costOfFunds)} + expected loss ${pct(expectedLossRate)}.`,
    !standingClean
      ? `Ladder rate ${pct(inputs.ladderApr)} stands: current arrears on file rule out the loyalty discount until cleared.`
      : discountBps > 0
        ? `Suggested ${pct(suggestedRate)} meets the ${pct(inputs.targetReturn)} target return. A ${discountBps} bps discount on the ${pct(inputs.ladderApr)} ladder rate for a lower-risk file.`
        : `Ladder rate ${pct(inputs.ladderApr)} stands: break-even + target sits at or above it, and the assistant never prices above the published ladder.`,
  ];

  return {
    pd,
    expectedLossRate,
    breakEvenRate,
    suggestedRate,
    ladderApr: inputs.ladderApr,
    discountBps,
    ladder: econ(inputs.ladderApr),
    suggested: econ(suggestedRate),
    reasons,
  };
}

/**
 * The adoption path: replace one tier's APR so decideLoan can re-run the affordability
 * check at the adopted rate (a lower rate frees headroom; a higher rate would tighten it
 * and could reduce the offered principal). The engine itself is unchanged  this only
 * swaps the input rate for the matched tier, matched by label.
 */
export function repriceProducts(products: LoanProduct[], tierLabel: string, apr: number): LoanProduct[] {
  return products.map((p) => (p.label === tierLabel ? { ...p, apr } : p));
}
