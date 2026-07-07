// Pure layout math for the decision visuals (Brief K). No React, no SVG — these
// helpers turn numbers the engine already computed into segment/tick/step layouts,
// so the components stay dumb and the geometry stays unit-tested.

import { MAX_DSR, MAX_INSTALLMENT_SHARE_OF_SURPLUS, type DecisionBreakdown } from './loans';

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
  /** True when the installment respects both caps — the "inside the safe zone" state. */
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
): HeadroomLayout | null {
  const income = a.avgIncome;
  if (!(income > 0)) return null;
  const surplus = Math.max(0, a.avgMonthlySurplus);

  const ds = clamp(a.monthlyDebtService / income, 0, 1);
  const inst = clamp(installment / income, 0, 1 - ds);
  const remaining = clamp((surplus - installment) / income, 0, 1 - ds - inst);
  const other = Math.max(0, 1 - ds - inst - remaining);

  const dsrTick = MAX_DSR;
  const surplusTick = clamp(ds + (MAX_INSTALLMENT_SHARE_OF_SURPLUS * surplus) / income, 0, 1);
  const eps = 1e-9;
  const safe = ds + inst <= dsrTick + eps && inst <= (MAX_INSTALLMENT_SHARE_OF_SURPLUS * surplus) / income + eps;

  return {
    segments: [
      { key: 'debtService', label: 'Existing debt service', frac: ds },
      { key: 'installment', label: 'Proposed installment', frac: inst },
      { key: 'remainingSurplus', label: 'Remaining surplus', frac: remaining },
      { key: 'other', label: 'Other spending', frac: other },
    ],
    ticks: [
      { key: 'dsr', label: `${Math.round(MAX_DSR * 100)}% DSR cap`, frac: dsrTick },
      { key: 'surplusShare', label: `${Math.round(MAX_INSTALLMENT_SHARE_OF_SURPLUS * 100)}% of surplus`, frac: surplusTick },
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
export function waterfallSteps(b: DecisionBreakdown): Waterfall {
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
    label: `Surplus cap (${Math.round(MAX_INSTALLMENT_SHARE_OF_SURPLUS * 100)}%)`,
    amount: afterSurplus,
    bit: surplusBit,
    ...(surplusBit ? { note: `installment must stay within ${Math.round(MAX_INSTALLMENT_SHARE_OF_SURPLUS * 100)}% of monthly surplus` } : {}),
  });

  const afterDsr = Math.min(afterSurplus, b.dsrCapPrincipal);
  const dsrBit = afterDsr < afterSurplus;
  steps.push({
    key: 'dsr',
    label: `DSR cap (${Math.round(MAX_DSR * 100)}%)`,
    amount: afterDsr,
    bit: dsrBit,
    ...(dsrBit ? { note: `total debt service must stay within ${Math.round(MAX_DSR * 100)}% of income` } : {}),
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

/** Null when the histogram is absent, malformed, or empty — the chart hides gracefully. */
export function benfordChart(histogram: number[] | undefined): BenfordChartData | null {
  if (!histogram || histogram.length !== 9) return null;
  const total = histogram.reduce((s, c) => s + c, 0);
  if (!(total > 0)) return null;
  return {
    bars: histogram.map((c) => c / total),
    expected: Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1))),
  };
}
