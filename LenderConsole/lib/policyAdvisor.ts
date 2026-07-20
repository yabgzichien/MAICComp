// lib/policyAdvisor.ts (2026-07-18 stats/advisor design)
// Pure, deterministic policy suggestions over buildPerformance's cohort rows  the
// realized-vs-expected loss validation loop turned into an action, never a mutation.
// This module owns the actual decision logic; an LLM (separate server route) may only
// narrate an already-formed suggestion into one grounded sentence. No ML  training a
// model on a dozen demo loans would repeat the synthetic-AUC-1.0 mistake Phase 10 killed;
// real ML recalibration is roadmap. No UI/DB imports.

import type { ApplicationRecord } from './applications';
import { buildPerformance, type CohortRow } from './performance';
import type { CreditBand } from './securitization';

/** Below this many loans in a band, its rates are a small sample (same rule as the
 *  Portfolio cohort table)  never confident enough to drive a policy suggestion. */
export { SMALL_SAMPLE_MIN_LOANS as SUGGESTION_EVIDENCE_MIN_LOANS } from './performance';

/** A band's realized loss must sit at least this fraction below the risk model's
 *  prediction before it reads as a genuine outperformance rather than sampling noise. */
export const RATE_REVIEW_MARGIN = 0.25;

/** A band's realized loss must sit at least this fraction above the risk model's
 *  prediction before it's flagged as underperforming  a small overshoot is normal
 *  variance, not a signal. */
export const UNDERPERFORM_MARGIN = 0.25;

/** Below this collection rate, a band's shortfall reads as concentrated across the
 *  cohort rather than one or two isolated late payers. */
export const DELINQUENCY_COLLECTION_THRESHOLD = 0.85;

export type AdvisorRuleKind = 'tighten' | 'threshold-review' | 'rate-review-down' | 'no-evidence';

export interface AdvisorSuggestion {
  kind: AdvisorRuleKind;
  band: CreditBand | null;
  headline: string;
  evidence: string[];
  /** Always phrased as "Consider…"  the officer applies changes manually in the Policy
   *  tab; this module never mutates a policy or product. */
  action: string;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

const NO_EVIDENCE_EMPTY: AdvisorSuggestion = {
  kind: 'no-evidence',
  band: null,
  headline: 'Not enough repayment history yet to suggest policy changes',
  evidence: [],
  action: 'Consider checking back once more instalments have been recorded across the approved book.',
};

const NO_EVIDENCE_ALL_QUIET: AdvisorSuggestion = {
  kind: 'no-evidence',
  band: null,
  headline: 'No policy changes suggested right now',
  evidence: [],
  action: 'Consider nothing yet — every band with enough evidence is performing in line with its risk model.',
};

/** One band's suggestion, or null if it's performing in line with its risk model.
 *  Checked in priority order  a genuine underperformance always outranks a milder
 *  collection concern, which in turn outranks a positive rate-review signal. */
function suggestionForBand(row: CohortRow): AdvisorSuggestion | null {
  if (row.smallSample) return null;
  const { band, expectedLossRate: expected, realizedLossRate: realized, collectionRate, loanCount } = row;

  if (expected > 0 && realized > expected * (1 + UNDERPERFORM_MARGIN)) {
    return {
      kind: 'tighten',
      band,
      headline: `${band} band is underperforming its risk model`,
      evidence: [`Realized loss ${pct(realized)} vs expected ${pct(expected)} across ${loanCount} loans`],
      action: `Consider tightening the ${band} tier's score, confidence, or coverage threshold, or reviewing its rate upward.`,
    };
  }

  if (collectionRate < DELINQUENCY_COLLECTION_THRESHOLD) {
    return {
      kind: 'threshold-review',
      band,
      headline: `${band} band's collection shortfall is concentrated, not isolated`,
      evidence: [`Collection rate ${pct(collectionRate)} across ${loanCount} loans`],
      action: `Consider reviewing the ${band} tier's coverage or confidence threshold — the shortfall spans the cohort, not one file.`,
    };
  }

  if (expected > 0 && realized < expected * (1 - RATE_REVIEW_MARGIN)) {
    return {
      kind: 'rate-review-down',
      band,
      headline: `${band} band is performing better than its risk model predicted`,
      evidence: [`Realized loss ${pct(realized)} vs expected ${pct(expected)} across ${loanCount} loans`],
      action: `Consider a rate review for the ${band} tier — the pricing assistant's math would support a modest discount.`,
    };
  }

  return null;
}

/** Build the Policy Advisor's suggestions from the applications store. Never returns an
 *  empty array  a book with no usable evidence yields an honest no-evidence entry rather
 *  than silence, and a book where every band is in line with its risk model says so
 *  explicitly rather than showing nothing. */
export function buildPolicyAdvisor(apps: ApplicationRecord[], now: Date = new Date()): AdvisorSuggestion[] {
  const perf = buildPerformance(apps, now);
  if (perf.bands.length === 0 || perf.bands.every((b) => b.smallSample)) {
    return [NO_EVIDENCE_EMPTY];
  }
  const suggestions = perf.bands.map(suggestionForBand).filter((s): s is AdvisorSuggestion => s !== null);
  return suggestions.length > 0 ? suggestions : [NO_EVIDENCE_ALL_QUIET];
}
