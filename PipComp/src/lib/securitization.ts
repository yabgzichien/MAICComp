// src/lib/securitization.ts
// Pure, deterministic securitization engine: turns a pool of scored Pip Credit loans
// into sized, rated Sukuk/ABS tranches. No UI/DB imports — unit-tested.
//
// Principle (matching the rest of the system): the AI supplies the upstream risk signals
// (credit-score band + ML fraud probability); this engine only structures and rates, using
// transparent math. Tranche thicknesses are a fixed structural credit-enhancement stack;
// the *rating* of each tranche responds to the pool's actual expected loss, so a poor pool
// is honestly downgraded rather than rubber-stamped AAA.

import type { CreditBand } from './creditScore';

export type Rating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'Equity';

export interface PoolLoan {
  id: string;
  principal: number;     // RM outstanding (exposure at default)
  apr: number;           // annual rate as a decimal
  tenorMonths: number;
  score: number;         // borrower credit score (300..900)
  band: CreditBand;      // borrower credit band
  fraudProb: number;     // 0..1 ML fraud/fabrication probability for this borrower's data
}

export interface Tranche {
  name: 'Senior' | 'Mezzanine' | 'Subordinated';
  attachmentPct: number;   // 0..1 fraction of pool loss where this tranche starts absorbing
  detachmentPct: number;   // 0..1 fraction where it is exhausted
  thicknessPct: number;    // 0..1 (detachment - attachment)
  thicknessRM: number;     // thicknessPct * totalPrincipal
  coverageMultiple: number; // attachment / expectedLossRate (Infinity when EL is 0)
  rating: Rating;
  profitRate: number;      // decimal, Shariah profit rate = base + spread by rating
  reason: string;
}

export interface PoolSummary {
  totalPrincipal: number;
  loanCount: number;
  weightedAvgScore: number;   // principal-weighted
  weightedAvgPD: number;      // principal-weighted, 0..1
  expectedLossRate: number;   // Σ(PD·LGD·principal) / Σ principal, 0..1
}

export interface SecuritizationResult {
  summary: PoolSummary;
  tranches: Tranche[];
}

export interface SecuritizationAssumptions {
  lgd: number;                              // loss given default, 0..1
  bandPD: Record<CreditBand, number>;       // annualised base PD per band, 0..1
  subordinatedThickness: number;            // 0..1 fixed first-loss equity thickness
  mezzanineThickness: number;               // 0..1 fixed mezzanine thickness (senior = remainder)
  profitRateBase: number;                   // decimal base profit rate
  ratingSpreads: Record<Rating, number>;    // decimal spread added to base, by rating
  ratingThresholds: { rating: Rating; minCoverage: number }[]; // desc by minCoverage
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export const DEFAULT_ASSUMPTIONS: SecuritizationAssumptions = {
  lgd: 0.6,
  bandPD: {
    Building: 0.25,
    Fair: 0.15,
    Good: 0.08,
    Strong: 0.04,
    Excellent: 0.02,
  },
  subordinatedThickness: 0.12,
  mezzanineThickness: 0.16,
  profitRateBase: 0.05,
  ratingSpreads: {
    AAA: 0.01,
    AA: 0.02,
    A: 0.035,
    BBB: 0.055,
    BB: 0.085,
    Equity: 0.14,
  },
  // Highest threshold first; rateTranche picks the first whose minCoverage <= coverage.
  ratingThresholds: [
    { rating: 'AAA', minCoverage: 6 },
    { rating: 'AA', minCoverage: 4 },
    { rating: 'A', minCoverage: 3 },
    { rating: 'BBB', minCoverage: 2 },
    { rating: 'BB', minCoverage: 1 },
  ],
};

/** Probability of default for one loan: band base rate, nudged up by ML fraud probability. */
export function loanPD(
  band: CreditBand,
  fraudProb: number,
  a: SecuritizationAssumptions = DEFAULT_ASSUMPTIONS
): number {
  const base = a.bandPD[band] ?? 0.25;
  const f = clamp(fraudProb, 0, 1);
  return clamp(base + (1 - base) * f, 0, 1);
}

/** Principal-weighted pool aggregates + expected-loss rate. Empty pool → all zeros. */
export function summarizePool(
  loans: PoolLoan[],
  a: SecuritizationAssumptions = DEFAULT_ASSUMPTIONS
): PoolSummary {
  const totalPrincipal = loans.reduce((s, l) => s + l.principal, 0);
  if (totalPrincipal <= 0) {
    return { totalPrincipal: 0, loanCount: loans.length, weightedAvgScore: 0, weightedAvgPD: 0, expectedLossRate: 0 };
  }
  let wScore = 0;
  let wPD = 0;
  let expectedLoss = 0;
  for (const l of loans) {
    const pd = loanPD(l.band, l.fraudProb, a);
    wScore += l.score * l.principal;
    wPD += pd * l.principal;
    expectedLoss += pd * a.lgd * l.principal;
  }
  return {
    totalPrincipal,
    loanCount: loans.length,
    weightedAvgScore: wScore / totalPrincipal,
    weightedAvgPD: wPD / totalPrincipal,
    expectedLossRate: expectedLoss / totalPrincipal,
  };
}

/** Map a coverage multiple (subordination below a tranche ÷ expected loss) to a rating. */
export function rateTranche(
  coverageMultiple: number,
  a: SecuritizationAssumptions = DEFAULT_ASSUMPTIONS
): Rating {
  for (const t of a.ratingThresholds) {
    if (coverageMultiple >= t.minCoverage) return t.rating;
  }
  return 'Equity';
}

function rmRound(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}

/** Structure the pool into Senior/Mezzanine/Subordinated tranches with ratings + profit rates. */
export function structurePool(
  loans: PoolLoan[],
  a: SecuritizationAssumptions = DEFAULT_ASSUMPTIONS
): SecuritizationResult {
  const summary = summarizePool(loans, a);
  if (summary.totalPrincipal <= 0) return { summary, tranches: [] };

  const el = summary.expectedLossRate;
  const subThick = clamp(a.subordinatedThickness, 0, 1);
  const mezThick = clamp(a.mezzanineThickness, 0, 1 - subThick);
  const senThick = clamp(1 - subThick - mezThick, 0, 1);

  // Attachment points (bottom-up): Subordinated absorbs first losses, Senior last.
  const subAttach = 0;
  const subDetach = subThick;
  const mezAttach = subDetach;
  const mezDetach = subDetach + mezThick;
  const senAttach = mezDetach;
  const senDetach = 1;

  const coverage = (attach: number): number => (el > 0 ? attach / el : Infinity);

  const mk = (
    name: Tranche['name'],
    attach: number,
    detach: number,
    thickness: number
  ): Tranche => {
    const cov = coverage(attach);
    const rating = rateTranche(cov, a);
    const profitRate = a.profitRateBase + (a.ratingSpreads[rating] ?? 0);
    const covLabel = cov === Infinity ? 'fully' : `${cov.toFixed(1)}×`;
    const reason =
      name === 'Subordinated'
        ? `First-loss equity (absorbs initial ${(thickness * 100).toFixed(0)}% of losses) → ${rating}.`
        : `${name}: ${covLabel} expected-loss coverage beneath it → ${rating}.`;
    return {
      name,
      attachmentPct: attach,
      detachmentPct: detach,
      thicknessPct: thickness,
      thicknessRM: thickness * summary.totalPrincipal,
      coverageMultiple: cov,
      rating,
      profitRate,
      reason,
    };
  };

  const tranches: Tranche[] = [
    mk('Senior', senAttach, senDetach, senThick),
    mk('Mezzanine', mezAttach, mezDetach, mezThick),
    mk('Subordinated', subAttach, subDetach, subThick),
  ];

  return { summary, tranches };
}
