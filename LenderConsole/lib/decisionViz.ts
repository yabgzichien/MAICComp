// Pure layout math for the decision visuals (Brief K). No React, no SVG  these
// helpers turn numbers the engine already computed into segment/tick/step layouts,
// so the components stay dumb and the geometry stays unit-tested.

import { DEFAULT_POLICY, type LenderPolicy, type DecisionBreakdown } from './loans';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

// ── 1. Affordability headroom bar ─────────────────────────────────────────────

export interface HeadroomSegment {
  key: 'debtService' | 'installment' | 'remainingSurplus' | 'other';
  label: string;
  frac: number; // share of monthly income, 0..1
}

export interface HeadroomTick {
  key: 'dsr' | 'surplusShare';
  label: string;
  frac: number; // x-position as a share of income
}

export interface HeadroomLayout {
  segments: HeadroomSegment[];
  ticks: HeadroomTick[];
  /** True when the installment respects both caps  the "inside the safe zone" state. */
  safe: boolean;
}

/**
 * One bar = one month of income. From the left: existing debt service, then the
 * proposed installment, then what remains of the surplus, then all other spending.
 * Debt service + installment sit adjacent so both cap ticks bound where the
 * installment segment must END: the DSR tick at 40% of income, the surplus-share
 * tick at debtService + 35% of surplus.
 */
export function headroomLayout(
  a: { avgIncome: number; avgMonthlySurplus: number; monthlyDebtService: number },
  installment: number,
  policy: LenderPolicy = DEFAULT_POLICY,
): HeadroomLayout | null {
  const income = a.avgIncome;
  if (!(income > 0)) return null;
  const surplus = Math.max(0, a.avgMonthlySurplus);

  const ds = clamp(a.monthlyDebtService / income, 0, 1);
  const inst = clamp(installment / income, 0, 1 - ds);
  const remaining = clamp((surplus - installment) / income, 0, 1 - ds - inst);
  const other = Math.max(0, 1 - ds - inst - remaining);

  const dsrTick = policy.maxDsr;
  const surplusTick = clamp(ds + (policy.maxInstallmentShareOfSurplus * surplus) / income, 0, 1);
  const eps = 1e-9;
  const safe = ds + inst <= dsrTick + eps && inst <= (policy.maxInstallmentShareOfSurplus * surplus) / income + eps;

  return {
    segments: [
      { key: 'debtService', label: 'Existing debt service', frac: ds },
      { key: 'installment', label: 'Proposed installment', frac: inst },
      { key: 'remainingSurplus', label: 'Remaining surplus', frac: remaining },
      { key: 'other', label: 'Other spending', frac: other },
    ],
    ticks: [
      { key: 'dsr', label: `${Math.round(policy.maxDsr * 100)}% DSR cap`, frac: dsrTick },
      { key: 'surplusShare', label: `${Math.round(policy.maxInstallmentShareOfSurplus * 100)}% of surplus`, frac: surplusTick },
    ],
    safe,
  };
}

// ── 2. Decision waterfall ─────────────────────────────────────────────────────

export interface WaterfallStep {
  key: 'requested' | 'tier' | 'surplus' | 'dsr' | 'offered';
  label: string;
  /** Running supportable principal after this rule was applied. */
  amount: number;
  /** True when this rule actually changed the running value. */
  bit: boolean;
  /** Plain-language annotation of the rule that bit; absent when it didn't. */
  note?: string;
}

export interface Waterfall {
  steps: WaterfallStep[];
  final: number;
}

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

/** Requested → tier clamp → surplus cap → DSR cap → offered, each annotated when it bit. */
export function waterfallSteps(b: DecisionBreakdown, policy: LenderPolicy = DEFAULT_POLICY): Waterfall {
  const steps: WaterfallStep[] = [];
  steps.push({ key: 'requested', label: 'Requested', amount: b.requestedAmount, bit: false });

  const tierBit = b.tierCeiling !== b.requestedAmount;
  steps.push({
    key: 'tier',
    label: `${b.tierLabel} range`,
    amount: b.tierCeiling,
    bit: tierBit,
    ...(tierBit
      ? {
          note:
            b.tierCeiling > b.requestedAmount
              ? `raised to the tier minimum (${rm(b.tierCeiling)})`
              : `capped at the tier ceiling (${rm(b.tierCeiling)})`,
        }
      : {}),
  });

  const afterSurplus = Math.min(b.tierCeiling, b.surplusCapPrincipal);
  const surplusBit = afterSurplus < b.tierCeiling;
  steps.push({
    key: 'surplus',
    label: `Surplus cap (${Math.round(policy.maxInstallmentShareOfSurplus * 100)}%)`,
    amount: afterSurplus,
    bit: surplusBit,
    ...(surplusBit ? { note: `installment must stay within ${Math.round(policy.maxInstallmentShareOfSurplus * 100)}% of monthly surplus` } : {}),
  });

  const afterDsr = Math.min(afterSurplus, b.dsrCapPrincipal);
  const dsrBit = afterDsr < afterSurplus;
  steps.push({
    key: 'dsr',
    label: `DSR cap (${Math.round(policy.maxDsr * 100)}%)`,
    amount: afterDsr,
    bit: dsrBit,
    ...(dsrBit ? { note: `total debt service must stay within ${Math.round(policy.maxDsr * 100)}% of income` } : {}),
  });

  const offeredBit = b.offered !== afterDsr;
  steps.push({
    key: 'offered',
    label: b.offered > 0 ? 'Offered' : 'No offer',
    amount: b.offered,
    bit: offeredBit,
    ...(offeredBit && b.offered === 0
      ? { note: `supportable amount fell below the tier minimum (${rm(b.tierMinAmount)})` }
      : {}),
  });

  return { steps, final: b.offered };
}

// ── 3. Benford forensic chart ─────────────────────────────────────────────────

export interface BenfordChartData {
  /** Observed share of each leading digit 1–9 (sums to 1). */
  bars: number[];
  /** Benford's expected share for each digit: log10(1 + 1/d). */
  expected: number[];
}

/** Null when the histogram is absent, malformed, or empty  the chart hides gracefully. */
export function benfordChart(histogram: number[] | undefined): BenfordChartData | null {
  if (!histogram || histogram.length !== 9) return null;
  const total = histogram.reduce((s, c) => s + c, 0);
  if (!(total > 0)) return null;
  return {
    bars: histogram.map((c) => c / total),
    expected: Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1))),
  };
}

// ── 4. Coverage strip (Brief K stretch) ────────────────────────────────────────

/** One segment of the 90-day coverage strip: filled = a distinct recorded day. */
export interface CoverageSegment {
  filled: boolean;
}

/** `daysCovered` out of `windowDays` (default 90, matching the borrower app's fixed
 *  coverage window), left-to-right oldest-first. Clamped so a malformed input never
 *  produces a negative or over-full strip. */
export function coverageStrip(daysCovered: number, windowDays: number = 90): CoverageSegment[] {
  const filled = clamp(Math.round(daysCovered), 0, windowDays);
  return Array.from({ length: windowDays }, (_, i) => ({ filled: i < filled }));
}

// ── 5. Confidence-ceiling notch (Brief K stretch) ──────────────────────────────

/** Mirrors PipComp's src/lib/creditScore.ts `confidenceScoreCeiling`  same four
 *  thresholds/ceilings, kept in sync by hand since the two apps don't share code.
 *  Below 0.30 confidence caps display at the top of Building; 0.40 at Fair; 0.60 at
 *  Strong; at or above 0.60 the score is uncapped (Excellent reachable). */
function confidenceScoreCeiling(confidence: number): number {
  if (confidence < 0.3) return 499;
  if (confidence < 0.4) return 619;
  if (confidence < 0.6) return 819;
  return 900;
}

export interface ConfidenceCeilingNotch {
  /** Position on the 300900 band bar as a 01 fraction. Null when confidence is high
   *  enough that nothing is capped (ceiling === 900)  the notch hides entirely. */
  frac: number | null;
  ceiling: number;
}

export function confidenceCeilingNotch(confidence: number): ConfidenceCeilingNotch {
  const ceiling = confidenceScoreCeiling(confidence);
  if (ceiling >= 900) return { frac: null, ceiling };
  return { frac: (ceiling - 300) / (900 - 300), ceiling };
}

// ── 6. Affordability check ────────────────────────────────────────────────────
// The affordability verdict used to exist only as one sentence in the audit trail,
// which is where the single most common decline reason went to hide. This re-derives
// the same arithmetic decideLoan ran  the two installment caps, the tighter one that
// actually binds, and the principal it buys against the tier's minimum  so the check
// can be SHOWN rather than narrated. Re-derived, not read back, because the engine
// keeps only the principals on the breakdown; every figure below uses the same policy
// values and the same formulas, so the card and the reason string cannot disagree.

export interface AffordabilityCap {
  key: 'surplus' | 'dsr';
  /** Short axis label, e.g. "35% of surplus". */
  label: string;
  /** How the figure was derived, in the borrower's own numbers. */
  basis: string;
  /** Ringgit per month this cap alone would allow. */
  installment: number;
  /** True on the tighter of the two  the cap that actually decides the room. */
  binding: boolean;
}

export type AffordabilityOutcome = 'fits' | 'below-tier-minimum' | 'no-headroom';

export interface AffordabilityCheck {
  passed: boolean;
  outcome: AffordabilityOutcome;
  income: number;
  surplus: number;
  debtService: number;
  /** Both caps, always in surplus-then-DSR order so the chart rows never reshuffle. */
  caps: AffordabilityCap[];
  /** The binding cap: the largest installment this file can service. */
  room: number;
  /** Principal that `room` buys at this tier's rate and tenor. */
  supportable: number;
  tierLabel: string;
  tierMinAmount: number;
  /** How far `supportable` falls short of the tier minimum; 0 when it clears. */
  shortfall: number;
  /** The installment actually offered; 0 on a decline. */
  installment: number;
  /** Share of `room` the offered installment consumes; null when nothing was offered. */
  usedShare: number | null;
  /** One-line verdict, citing the same figures as the audit-trail reason. */
  headline: string;
}

export function affordabilityCheck(
  a: { avgIncome: number; avgMonthlySurplus: number; monthlyDebtService: number },
  b: DecisionBreakdown,
  installment: number,
  policy: LenderPolicy = DEFAULT_POLICY,
): AffordabilityCheck {
  const income = Math.max(0, a.avgIncome);
  const surplus = Math.max(0, a.avgMonthlySurplus);
  const debtService = Math.max(0, a.monthlyDebtService);

  const surplusCap = surplus * policy.maxInstallmentShareOfSurplus;
  const dsrCap = Math.max(0, income * policy.maxDsr - debtService);
  const room = Math.min(surplusCap, dsrCap);
  // Ties go to the surplus cap: when both allow the same installment, the surplus
  // share is the more conservative of the two to cite (it's the tighter constraint
  // as soon as either figure moves).
  const surplusBinds = surplusCap <= dsrCap;

  const caps: AffordabilityCap[] = [
    {
      // Kept short deliberately: these are chart-axis labels in a ~326px column, and a
      // longer phrase wraps mid-sentence ("35% of" / "surplus"). The line under the chart
      // carries the full derivation, so the axis only has to name the cap.
      key: 'surplus',
      label: `Surplus ${Math.round(policy.maxInstallmentShareOfSurplus * 100)}%`,
      basis: `${Math.round(policy.maxInstallmentShareOfSurplus * 100)}% of ${rm(surplus)} monthly surplus`,
      installment: surplusCap,
      binding: surplusBinds,
    },
    {
      key: 'dsr',
      label: `DSR ${Math.round(policy.maxDsr * 100)}%`,
      basis: `${Math.round(policy.maxDsr * 100)}% of ${rm(income)} income, less ${rm(debtService)} existing debt service`,
      installment: dsrCap,
      binding: !surplusBinds,
    },
  ];

  // Both per-cap principals come off the breakdown, so the "what it buys" figure is the
  // engine's own, not a re-run of the annuity formula against a rate the card can't see.
  const supportable = Math.max(0, Math.min(b.surplusCapPrincipal, b.dsrCapPrincipal));
  const passed = b.offered > 0;
  const outcome: AffordabilityOutcome = passed ? 'fits' : room <= 0 ? 'no-headroom' : 'below-tier-minimum';
  const shortfall = Math.max(0, b.tierMinAmount - supportable);
  const usedShare = passed && room > 0 ? clamp(installment / room, 0, 1) : null;

  const headline =
    outcome === 'fits'
      ? `${rm(installment)}/mo fits — it uses ${Math.round((usedShare ?? 0) * 100)}% of the ${rm(room)} a month this file can service.`
      : outcome === 'no-headroom'
        ? `No room for any installment: ${rm(surplus)} monthly surplus and ${rm(debtService)} of existing debt service leave nothing to repay from.`
        : `${rm(room)} a month is all this file can service. That buys ${rm(supportable)} — ${rm(shortfall)} short of the ${rm(b.tierMinAmount)} ${b.tierLabel} minimum.`;

  return {
    passed,
    outcome,
    income,
    surplus,
    debtService,
    caps,
    room,
    supportable,
    tierLabel: b.tierLabel,
    tierMinAmount: b.tierMinAmount,
    shortfall,
    installment,
    usedShare,
    headline,
  };
}
