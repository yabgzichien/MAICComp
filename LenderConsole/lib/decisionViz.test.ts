// Pure layout helpers for the decision visuals (Brief K) — tested before the SVG exists.
import { describe, expect, it } from 'vitest';
import { benfordChart, headroomLayout, waterfallSteps } from './decisionViz';
import type { DecisionBreakdown } from './loans';

describe('headroomLayout', () => {
  const assessment = { avgIncome: 2540, avgMonthlySurplus: 520, monthlyDebtService: 120 };

  it('splits income into debt service, installment, remaining surplus, and other spending, summing to 1', () => {
    const l = headroomLayout(assessment, 100)!;
    expect(l).not.toBeNull();
    const total = l.segments.reduce((s, x) => s + x.frac, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(l.segments.map((s) => s.key)).toEqual(['debtService', 'installment', 'remainingSurplus', 'other']);
    expect(l.segments[1].frac).toBeCloseTo(100 / 2540, 9);
  });

  it('places the DSR tick at 40% of income and the surplus tick after debt service', () => {
    const l = headroomLayout(assessment, 100)!;
    const dsr = l.ticks.find((t) => t.key === 'dsr')!;
    const surplus = l.ticks.find((t) => t.key === 'surplusShare')!;
    expect(dsr.frac).toBeCloseTo(0.4, 9);
    expect(surplus.frac).toBeCloseTo((120 + 0.35 * 520) / 2540, 9);
  });

  it('is safe when the installment fits both caps, unsafe when it breaches either', () => {
    expect(headroomLayout(assessment, 100)!.safe).toBe(true);
    expect(headroomLayout(assessment, 400)!.safe).toBe(false); // > 35% of RM520 surplus
    expect(headroomLayout({ avgIncome: 1000, avgMonthlySurplus: 900, monthlyDebtService: 350 }, 100)!.safe).toBe(false); // DSR 45%
  });

  it('returns null when income is not positive', () => {
    expect(headroomLayout({ avgIncome: 0, avgMonthlySurplus: 0, monthlyDebtService: 0 }, 100)).toBeNull();
  });
});

describe('waterfallSteps', () => {
  const base: DecisionBreakdown = {
    requestedAmount: 10000,
    tierLabel: 'Growth Capital',
    tierMinAmount: 4000,
    tierCeiling: 10000,
    surplusCapPrincipal: 2750,
    dsrCapPrincipal: 13000,
    offered: 0,
  };

  it('walks requested → tier → surplus cap → DSR cap → offered with a running value', () => {
    const w = waterfallSteps(base);
    expect(w.steps.map((s) => s.key)).toEqual(['requested', 'tier', 'surplus', 'dsr', 'offered']);
    expect(w.steps[0].amount).toBe(10000);
    expect(w.steps[2].amount).toBe(2750); // surplus cap bit
    expect(w.steps[4].amount).toBe(0); // below tier minimum → no offer
  });

  it('marks exactly the rules that bit', () => {
    const w = waterfallSteps(base);
    const bitKeys = w.steps.filter((s) => s.bit).map((s) => s.key);
    expect(bitKeys).toContain('surplus');
    expect(bitKeys).not.toContain('dsr'); // DSR cap was above the running value
    expect(bitKeys).toContain('offered'); // below-minimum floor zeroed the offer
  });

  it('annotates a clamp that RAISES the request to the tier minimum', () => {
    const w = waterfallSteps({ ...base, requestedAmount: 1000, tierCeiling: 4000, surplusCapPrincipal: 9000, dsrCapPrincipal: 9000, offered: 4000 });
    const tier = w.steps.find((s) => s.key === 'tier')!;
    expect(tier.amount).toBe(4000);
    expect(tier.bit).toBe(true);
    expect(tier.note!.toLowerCase()).toContain('minimum');
  });

  it('a clean approval bites nothing after the tier step', () => {
    const w = waterfallSteps({ ...base, requestedAmount: 5000, tierCeiling: 5000, surplusCapPrincipal: 9000, dsrCapPrincipal: 9000, offered: 5000 });
    expect(w.steps.filter((s) => s.bit)).toHaveLength(0);
    expect(w.steps[4].amount).toBe(5000);
  });
});

describe('benfordChart', () => {
  it('normalizes the nine counts to shares and pairs them with the expected curve', () => {
    const c = benfordChart([30, 18, 12, 10, 8, 7, 6, 5, 4])!;
    expect(c.bars).toHaveLength(9);
    expect(c.bars.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
    expect(c.expected[0]).toBeCloseTo(Math.log10(2), 9);
    expect(c.expected[8]).toBeCloseTo(Math.log10(1 + 1 / 9), 9);
  });

  it('returns null for a missing, malformed, or empty histogram', () => {
    expect(benfordChart(undefined)).toBeNull();
    expect(benfordChart([1, 2, 3])).toBeNull();
    expect(benfordChart([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
});

// ── Lender policy threading (Brief N) ─────────────────────────────────────────

describe('policy-aware cap labels', () => {
  const assessment = { avgIncome: 2540, avgMonthlySurplus: 520, monthlyDebtService: 120 };
  const custom = {
    minConfidenceToApprove: 0.5,
    maxInstallmentShareOfSurplus: 0.25,
    maxDsr: 0.3,
    emergencyOnlyBelowDays: 30,
    fullLadderFromDays: 90,
    minCoverageRatioForFullLadder: 0.5,
    costOfFunds: 0.05,
    targetReturn: 0.06,
  };

  it('headroomLayout ticks move and relabel under a custom policy', () => {
    const dflt = headroomLayout(assessment, 100)!;
    const tight = headroomLayout(assessment, 100, custom)!;
    expect(dflt.ticks[0].label).toContain('40%');
    expect(tight.ticks[0].label).toContain('30%');
    expect(tight.ticks[0].frac).toBeCloseTo(0.3, 9);
    expect(tight.ticks[1].label).toContain('25%');
    expect(tight.ticks[1].frac).toBeLessThan(dflt.ticks[1].frac);
  });

  it('waterfallSteps cap labels cite the custom shares', () => {
    const b: DecisionBreakdown = {
      requestedAmount: 10000,
      tierLabel: 'Growth Capital',
      tierMinAmount: 4000,
      tierCeiling: 10000,
      surplusCapPrincipal: 6000,
      dsrCapPrincipal: 8000,
      offered: 6000,
    };
    const w = waterfallSteps(b, custom);
    expect(w.steps.find((s) => s.key === 'surplus')!.label).toContain('25%');
    expect(w.steps.find((s) => s.key === 'dsr')!.label).toContain('30%');
  });
});
