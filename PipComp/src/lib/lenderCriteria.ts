// src/lib/lenderCriteria.ts (lender requirements + rates, 2026-08-03)
// Pure: turns a published lender profile (ladder + policy) into the plain-English "what this
// lender asks for, and what they charge" the borrower sees before they ever send a passport.
//
// Everything here is READ OFF the lender's own published criteria — the same `products` and
// `policy` their console decides with (lenderDirectory.ts) — so a requirement shown to the
// borrower can never drift from the bar the engine actually applies. Nothing is invented: a
// threshold the lender did not publish falls back to DEFAULT_POLICY, which is exactly what
// `decideLoan` would use for them.
//
// The amount-dependent caps (surplus share, DSR) are deliberately reported as 'info' rather
// than pass/fail: whether they bite depends on the amount being asked for, so marking them
// met or unmet against a borrower's standing alone would be a claim this module can't back.

import { DEFAULT_POLICY, type LenderPolicy, type LoanProduct } from './loans';
import type { LenderProfile } from './lenderDirectory';

/** The borrower's own standing, when the caller has it, so each row can be marked met/unmet. */
export interface BorrowerStanding {
  score: number;
  /** 0..1 data confidence. */
  confidence: number;
  /** Distinct covered days in the trailing 90-day window. */
  daysCovered: number;
  /** 0..1 coverage ratio over that window. */
  coverageRatio: number;
}

/** 'info' means the rule exists but isn't a bar the borrower either clears or doesn't today. */
export type RequirementStatus = 'met' | 'unmet' | 'info';

export interface RequirementRow {
  id: 'score' | 'assessable' | 'instant' | 'history' | 'full-ladder' | 'surplus' | 'dsr';
  /** What the lender requires, in their published numbers. */
  label: string;
  /** Where the borrower stands against it; null when no standing was supplied. */
  detail: string | null;
  status: RequirementStatus;
}

/** One rung of the lender's published ladder, with the borrower's reach against it. */
export interface TierRow extends LoanProduct {
  /** True when the borrower's score clears this rung's bar (false when no standing given). */
  qualified: boolean;
}

export interface LenderCriteria {
  aprLow: number;
  aprHigh: number;
  /** Lowest score bar on the ladder, i.e. the score to get in the door at all. */
  minScore: number;
  amountLow: number;
  amountHigh: number;
  tenorLow: number;
  tenorHigh: number;
  /** The ladder sorted low to high, so a rate table reads entry tier first. */
  tiers: LoanProduct[];
  /** The thresholds this lender decides with; DEFAULT_POLICY when they published none. */
  policy: LenderPolicy;
}

const pct = (x: number): number => Math.round(x * 100);
const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

/** APR as a percentage with at most one decimal: 0.29 → "29%", 0.285 → "28.5%". */
export function aprPct(apr: number): string {
  return `${Math.round(apr * 1000) / 10}%`;
}

/** Summarise a published lender profile. Pure; safe on an empty ladder (never thrown at). */
export function lenderCriteria(lender: LenderProfile): LenderCriteria {
  const tiers = [...lender.products].sort((a, b) => a.minScore - b.minScore);
  const nums = (pick: (p: LoanProduct) => number): number[] => tiers.map(pick);
  const low = (pick: (p: LoanProduct) => number): number => (tiers.length > 0 ? Math.min(...nums(pick)) : 0);
  const high = (pick: (p: LoanProduct) => number): number => (tiers.length > 0 ? Math.max(...nums(pick)) : 0);
  return {
    aprLow: low((p) => p.apr),
    aprHigh: high((p) => p.apr),
    minScore: low((p) => p.minScore),
    amountLow: low((p) => p.minAmount),
    amountHigh: high((p) => p.maxAmount),
    tenorLow: low((p) => p.tenorMonths),
    tenorHigh: high((p) => p.tenorMonths),
    tiers,
    policy: lender.policy ?? DEFAULT_POLICY,
  };
}

/** "10–29% APR" (or "18% APR" when every rung is priced the same). */
export function aprRangeLabel(c: LenderCriteria): string {
  if (c.tiers.length === 0) return 'Rates not published';
  return c.aprLow === c.aprHigh ? `${aprPct(c.aprLow)} APR` : `${aprPct(c.aprLow)}–${aprPct(c.aprHigh)} APR`;
}

/** "RM300–15,000" (or a single figure when the ladder offers one amount). */
export function amountRangeLabel(c: LenderCriteria): string {
  if (c.tiers.length === 0) return '';
  if (c.amountLow === c.amountHigh) return rm(c.amountLow);
  return `${rm(c.amountLow)}–${Math.round(c.amountHigh).toLocaleString('en-MY')}`;
}

/** "6–24 months" (or "12 months" for a single tenor). */
export function tenorRangeLabel(c: LenderCriteria): string {
  if (c.tiers.length === 0) return '';
  return c.tenorLow === c.tenorHigh ? `${c.tenorLow} months` : `${c.tenorLow}–${c.tenorHigh} months`;
}

/** The one-line strip shown next to a lender's name: rate, entry bar, amounts. */
export function criteriaSummary(c: LenderCriteria): string {
  if (c.tiers.length === 0) return 'No published ladder';
  return `${aprRangeLabel(c)} · score ${c.minScore}+ · ${amountRangeLabel(c)}`;
}

/** The same strip without the rate, for a header that already carries a rate chip. */
export function criteriaBarsSummary(c: LenderCriteria): string {
  if (c.tiers.length === 0) return 'No published ladder';
  return `Score ${c.minScore}+ · ${amountRangeLabel(c)} · ${tenorRangeLabel(c)}`;
}

/** Highest rung the score clears, or null when it clears none. Mirrors the engine's tier pick. */
export function tierForScore(score: number, tiers: LoanProduct[]): LoanProduct | null {
  const eligible = tiers.filter((p) => p.minScore <= score);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, p) => (p.minScore > best.minScore ? p : best));
}

/**
 * The rungs coverage leaves open, mirroring `applyCoverageTierFilter` in loans.ts: thin history
 * caps the ladder to the emergency rung, a partial window (or sparse coverage over a full one)
 * caps it to starter and below. Pinned to the engine by test, because a rung shown as reachable
 * that the console then refuses is the one mistake this whole panel exists to prevent.
 */
function coverageAllowedTiers(c: LenderCriteria, you: BorrowerStanding): LoanProduct[] {
  const p = c.policy;
  const keep = (ids: string[]): LoanProduct[] => c.tiers.filter((t) => ids.includes(t.id));
  if (you.daysCovered < p.emergencyOnlyBelowDays) return keep(['emergency']);
  if (you.daysCovered < p.fullLadderFromDays) return keep(['emergency', 'starter']);
  if (you.coverageRatio < p.minCoverageRatioForFullLadder) return keep(['emergency', 'starter']);
  return c.tiers;
}

/**
 * The rung the borrower would actually land on today: score AND coverage, the two gates the
 * engine applies before affordability sizes the amount. Null when nothing is open to them.
 */
export function reachableTier(c: LenderCriteria, you: BorrowerStanding): LoanProduct | null {
  return tierForScore(you.score, coverageAllowedTiers(c, you));
}

/** The ladder with each rung marked reachable today (all false without a standing). */
export function tierRows(c: LenderCriteria, you?: BorrowerStanding): TierRow[] {
  const open = you ? new Set(coverageAllowedTiers(c, you).map((t) => t.id)) : null;
  return c.tiers.map((p) => ({ ...p, qualified: you !== undefined && open!.has(p.id) && you.score >= p.minScore }));
}

/**
 * The lender's requirements as displayable rows, in the order they bite: who they'll look at,
 * what they need verified, how much history they want, then the affordability caps that size
 * the offer. Without a `you` standing every row still lists the bar, just with no verdict.
 */
export function requirementRows(c: LenderCriteria, you?: BorrowerStanding): RequirementRow[] {
  const p = c.policy;
  const mark = (ok: boolean): RequirementStatus => (ok ? 'met' : 'unmet');
  const rows: RequirementRow[] = [
    {
      id: 'score',
      label: `Pip Score of ${c.minScore} or higher`,
      detail: you ? `Yours: ${you.score}` : null,
      status: you ? mark(you.score >= c.minScore) : 'info',
    },
    {
      id: 'assessable',
      label: `Data confidence of at least ${pct(p.minConfidenceToConsider)}%, or they can't assess you at all`,
      detail: you ? `Yours: ${pct(you.confidence)}%` : null,
      status: you ? mark(you.confidence >= p.minConfidenceToConsider) : 'info',
    },
    {
      id: 'instant',
      label: `Data confidence of ${pct(p.minConfidenceToApprove)}% or more to be approved without a loan officer`,
      detail: you ? `Yours: ${pct(you.confidence)}%` : null,
      status: you ? mark(you.confidence >= p.minConfidenceToApprove) : 'info',
    },
    {
      id: 'history',
      label: `${p.emergencyOnlyBelowDays} days or more of recorded history, otherwise only the emergency tier and a manual review`,
      detail: you ? `Yours: ${you.daysCovered} days of the last 90` : null,
      status: you ? mark(you.daysCovered >= p.emergencyOnlyBelowDays) : 'info',
    },
    {
      id: 'full-ladder',
      label: `${p.fullLadderFromDays} days of history at ${pct(p.minCoverageRatioForFullLadder)}% coverage or better to reach their top tiers`,
      detail: you ? `Yours: ${pct(you.coverageRatio)}% coverage` : null,
      status: you
        ? mark(you.daysCovered >= p.fullLadderFromDays && you.coverageRatio >= p.minCoverageRatioForFullLadder)
        : 'info',
    },
    {
      id: 'surplus',
      label: `Your repayment stays within ${pct(p.maxInstallmentShareOfSurplus)}% of your average monthly surplus`,
      detail: 'Caps the amount, not your eligibility',
      status: 'info',
    },
    {
      id: 'dsr',
      label: `All your debt repayments together stay under ${pct(p.maxDsr)}% of your income`,
      detail: 'Caps the amount, not your eligibility',
      status: 'info',
    },
  ];
  return rows;
}
