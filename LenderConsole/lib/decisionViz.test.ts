// Pure layout helpers for the decision visuals (Brief K) — tested before the SVG exists.
import { describe, expect, it } from 'vitest';
import { affordabilityCheck, benfordChart, confidenceCeilingNotch, coverageStrip, headroomLayout, waterfallSteps } from './decisionViz';
import { DEFAULT_POLICY, type DecisionBreakdown } from './loans';

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

describe('affordabilityCheck', () => {
  // The reported figures: RM2,540 income, RM520 surplus, RM120 debt service, Growth Capital.
  const assessment = { avgIncome: 2540, avgMonthlySurplus: 520, monthlyDebtService: 120 };
  const declined: DecisionBreakdown = {
    requestedAmount: 10000,
    tierLabel: 'Growth Capital',
    tierMinAmount: 4000,
    tierCeiling: 10000,
    surplusCapPrincipal: 2783,
    dsrCapPrincipal: 13700,
    offered: 0,
  };

  it('derives both caps from policy and marks the tighter one as binding', () => {
    const c = affordabilityCheck(assessment, declined, 0);
    expect(c.caps.map((x) => x.key)).toEqual(['surplus', 'dsr']);
    expect(c.caps[0].installment).toBeCloseTo(0.35 * 520, 9); // RM182
    expect(c.caps[1].installment).toBeCloseTo(0.4 * 2540 - 120, 9); // RM896
    expect(c.caps[0].binding).toBe(true);
    expect(c.caps[1].binding).toBe(false);
    expect(c.room).toBeCloseTo(182, 9);
  });

  it('fails with the tier-minimum shortfall when the room buys less than the tier allows', () => {
    const c = affordabilityCheck(assessment, declined, 0);
    expect(c.passed).toBe(false);
    expect(c.outcome).toBe('below-tier-minimum');
    expect(c.supportable).toBe(2783);
    expect(c.shortfall).toBe(4000 - 2783);
    expect(c.headline).toContain('Growth Capital');
  });

  it('reports the repayment ÷ net cash flow ratio and the cap it is measured against', () => {
    const c = affordabilityCheck(assessment, { ...declined, tierMinAmount: 2000, offered: 2400 }, 91);
    expect(c.surplusShare).toBeCloseTo(91 / 520, 9); // 17.5% of net cash flow
    expect(c.shareCap).toBe(0.35);
    expect(c.headline).toContain('18%');
    expect(c.headline).toContain('net cash flow');
  });

  it('scales the tier minimum into the installment it would demand when nothing was offered', () => {
    const c = affordabilityCheck(assessment, declined, 0);
    // Installment is linear in principal at a fixed rate/tenor: RM182/mo buys RM2,783,
    // so the RM4,000 minimum needs 4000/2783 of that installment.
    expect(c.requiredInstallment).toBeCloseTo((182 * 4000) / 2783, 6);
    expect(c.requiredSurplusShare).toBeCloseTo((182 * 4000) / 2783 / 520, 6);
    expect(c.requiredSurplusShare!).toBeGreaterThan(c.shareCap); // it is precisely why it failed
    expect(c.headline).toContain('past the 35% cap');
  });

  it('leaves the required-installment fields null on an approval', () => {
    const c = affordabilityCheck(assessment, { ...declined, tierMinAmount: 2000, offered: 2400 }, 91);
    expect(c.requiredInstallment).toBeNull();
    expect(c.requiredSurplusShare).toBeNull();
  });

  it('reports a ratio above 100% rather than clamping it', () => {
    // A file whose tier minimum needs more than the whole surplus: the number has to
    // survive intact, because "112% of net cash flow" is the point being made.
    const c = affordabilityCheck(assessment, { ...declined, tierMinAmount: 20000 }, 0);
    expect(c.requiredSurplusShare!).toBeGreaterThan(1);
  });

  it('has no ratio to report when there is no net cash flow to divide by', () => {
    const c = affordabilityCheck(
      { avgIncome: 2540, avgMonthlySurplus: 0, monthlyDebtService: 100 },
      { ...declined, surplusCapPrincipal: 0, dsrCapPrincipal: 0 },
      0,
    );
    expect(c.surplusShare).toBeNull();
    expect(c.requiredSurplusShare).toBeNull();
  });

  it('reports no headroom at all when neither cap leaves room for an installment', () => {
    const c = affordabilityCheck(
      { avgIncome: 2540, avgMonthlySurplus: 0, monthlyDebtService: 1200 },
      { ...declined, surplusCapPrincipal: 0, dsrCapPrincipal: 0 },
      0,
    );
    expect(c.outcome).toBe('no-headroom');
    expect(c.room).toBe(0);
    expect(c.headline.toLowerCase()).toContain('no room');
  });

  it('lets the DSR cap bind when existing debt service is the constraint', () => {
    const c = affordabilityCheck({ avgIncome: 2540, avgMonthlySurplus: 1800, monthlyDebtService: 900 }, declined, 0);
    expect(c.caps[1].binding).toBe(true);
    expect(c.caps[0].binding).toBe(false);
    expect(c.room).toBeCloseTo(0.4 * 2540 - 900, 9); // RM116
  });

  it('passes when the tier minimum is within reach', () => {
    const c = affordabilityCheck(assessment, { ...declined, tierMinAmount: 2000, offered: 2400 }, 91);
    expect(c.passed).toBe(true);
    expect(c.outcome).toBe('fits');
    expect(c.shortfall).toBe(0);
    expect(c.headline).toContain('inside the 35% cap');
  });

  it('cites the lender’s own caps when policy is customised', () => {
    const custom = { ...DEFAULT_POLICY, maxInstallmentShareOfSurplus: 0.25, maxDsr: 0.3 };
    const c = affordabilityCheck(assessment, declined, 0, custom);
    expect(c.caps[0].label).toContain('25%');
    expect(c.caps[1].label).toContain('30%');
    expect(c.caps[0].installment).toBeCloseTo(0.25 * 520, 9);
    expect(c.caps[1].installment).toBeCloseTo(0.3 * 2540 - 120, 9);
  });

  it('never reports a negative cap, room, or supportable principal', () => {
    const c = affordabilityCheck(
      { avgIncome: 1000, avgMonthlySurplus: -50, monthlyDebtService: 900 },
      { ...declined, surplusCapPrincipal: -10, dsrCapPrincipal: 5 },
      0,
    );
    expect(c.caps.every((x) => x.installment >= 0)).toBe(true);
    expect(c.room).toBe(0);
    expect(c.supportable).toBe(0);
    expect(c.surplus).toBe(0);
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
    minConfidenceToConsider: 0.35,
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

describe('coverageStrip', () => {
  it('produces 90 segments by default, filled left-to-right up to daysCovered', () => {
    const s = coverageStrip(30);
    expect(s).toHaveLength(90);
    expect(s.slice(0, 30).every((seg) => seg.filled)).toBe(true);
    expect(s.slice(30).every((seg) => !seg.filled)).toBe(true);
  });

  it('respects a custom window', () => {
    expect(coverageStrip(5, 10)).toHaveLength(10);
  });

  it('clamps a negative or over-full input rather than throwing', () => {
    expect(coverageStrip(-5).every((s) => !s.filled)).toBe(true);
    expect(coverageStrip(999).every((s) => s.filled)).toBe(true);
  });

  it('rounds a fractional day count', () => {
    expect(coverageStrip(30.6).filter((s) => s.filled)).toHaveLength(31);
  });
});

describe('confidenceCeilingNotch', () => {
  it('caps at the Building ceiling below 30% confidence', () => {
    const n = confidenceCeilingNotch(0.2);
    expect(n.ceiling).toBe(499);
    expect(n.frac).toBeCloseTo((499 - 300) / 600, 9);
  });

  it('caps at the Fair ceiling between 30% and 40%', () => {
    expect(confidenceCeilingNotch(0.35).ceiling).toBe(619);
  });

  it('caps at the Strong ceiling between 40% and 60%', () => {
    expect(confidenceCeilingNotch(0.55).ceiling).toBe(819);
  });

  it('is uncapped (null frac) at or above 60% confidence', () => {
    const n = confidenceCeilingNotch(0.6);
    expect(n.ceiling).toBe(900);
    expect(n.frac).toBeNull();
  });

  it('is uncapped at full confidence', () => {
    expect(confidenceCeilingNotch(1).frac).toBeNull();
  });
});
