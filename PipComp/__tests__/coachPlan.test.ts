import {
  buildCoachPlan,
  diagnoseConstraint,
  simulateCoverage,
  simulateStress,
  simulateSurplus,
  simulateTrackRecord,
  stressIncome,
  survivesDipPct,
  type CoachPlanInput,
} from '../src/lib/coachPlan';
import { DEFAULT_PRODUCTS } from '../src/lib/loans';
import type { CreditProfile } from '../src/lib/creditScore';
import type { Coverage } from '../src/lib/coverage';
import type { ConfidenceTxn } from '../src/lib/dataConfidence';

/** A small, clean set of verified transactions → solid baseline confidence, no integrity flags. */
function txns(): ConfidenceTxn[] {
  const amounts = [312, 47, 128, 8, 233, 61, 19, 540, 87, 156, 24, 402];
  return amounts.map((amount) => ({ amount, source: 'verified' as const }));
}

function baseProfile(over: Partial<CreditProfile> = {}): CreditProfile {
  return {
    months: 3,
    avgIncome: 2500,
    incomeMonths: 3,
    avgSurplus: 900,
    positiveMonths: 3,
    savingsRate: 900 / 2500,
    monthlyDebtService: 0,
    adherenceWithinRatio: 1,
    netWorthSlope: 0,
    repaymentOnTime: 0,
    repaymentTotal: 0,
    confidence: 0.7,
    ...over,
  };
}

function coverageOf(daysCovered: number): Coverage {
  return { daysCovered, ratio: daysCovered / 90, recencyDays: 1, windowDays: 90 };
}

describe('simulateCoverage', () => {
  it('unlocks a real loan offer when a thin file extends past the Emergency-only floor', () => {
    // Baseline: 20 covered days → Emergency Micro only, forced to REFER (Phase 6 coverage gate).
    const input: CoachPlanInput = {
      profile: baseProfile(),
      coverage: coverageOf(20),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const sim = simulateCoverage(input, 30);

    // Projecting to 30 covered days opens the Starter tier and a genuine approvable offer.
    expect(sim.decisionFrom).toBe('refer');
    expect(sim.decisionTo).toBe('approve');
    expect(sim.maxAmountTo).toBeGreaterThan(sim.maxAmountFrom);
    expect(sim.maxAmountTo).toBeGreaterThanOrEqual(2000);
    // More coverage never lowers the underlying score.
    expect(sim.scoreTo).toBeGreaterThanOrEqual(sim.scoreFrom);
  });
});

describe('simulateSurplus', () => {
  it('raises the approvable amount when affordability is the binding constraint', () => {
    // 45 covered days → Starter tier; a thin surplus caps the offer below the tier ceiling.
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 700, savingsRate: 700 / 2500 }),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const sim = simulateSurplus(input, 300); // free up RM300/mo of spending

    expect(sim.decisionFrom).toBe('approve');
    expect(sim.decisionTo).toBe('approve');
    expect(sim.maxAmountTo).toBeGreaterThan(sim.maxAmountFrom);
    // Widening the income–spending gap never lowers the score.
    expect(sim.scoreTo).toBeGreaterThanOrEqual(sim.scoreFrom);
  });
});

describe('simulateTrackRecord', () => {
  it('lifts the score when an on-time repayment record is built', () => {
    const input: CoachPlanInput = {
      profile: baseProfile({ repaymentOnTime: 0, repaymentTotal: 0 }),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const sim = simulateTrackRecord(input, 3);

    expect(sim.scoreTo).toBeGreaterThan(sim.scoreFrom);
  });
});

describe('buildCoachPlan', () => {
  it('ranks the coverage unlock first for a thin file and offers what-if chips', () => {
    const input: CoachPlanInput = {
      profile: baseProfile(),
      coverage: coverageOf(20),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const plan = buildCoachPlan(input);

    expect(plan.baseline.decision).toBe('refer');
    // The coverage lever flips refer→approve, so it must be the top-ranked action.
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions[0].lever).toBe('coverage');
    // Only genuinely-improving actions appear, and they are sorted by impact desc.
    for (const a of plan.actions) expect(a.impact).toBeGreaterThan(0);
    const impacts = plan.actions.map((a) => a.impact);
    expect([...impacts].sort((x, y) => y - x)).toEqual(impacts);
    // What-if chips include several tappable surplus presets.
    expect(plan.whatIfs.filter((w) => w.lever === 'surplus').length).toBeGreaterThanOrEqual(2);
  });

  it('offers the coverage unlock and a forward-looking repayment lever for a thin file', () => {
    const input: CoachPlanInput = {
      profile: baseProfile(),
      coverage: coverageOf(20),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const plan = buildCoachPlan(input);

    // The 30-day milestone (Starter) is a genuine unlock and must be offered.
    const coverageChips = plan.whatIfs.filter((w) => w.lever === 'coverage');
    expect(coverageChips.map((c) => c.label)).toContain('Reach 30 days of recorded history');
    // Any coverage milestone that is offered actually improves the offer (never a decline).
    for (const w of coverageChips) expect(w.sim.decisionTo).not.toBe('decline');
    // And a forward-looking track-record lever is available.
    expect(plan.whatIfs.some((w) => w.lever === 'track')).toBe(true);
  });

  it('explains the coverage gate instead of a generic hint when spending cuts are blocked', () => {
    // <30 covered days → Emergency tier caps the offer no matter how much spending is cut.
    const input: CoachPlanInput = {
      profile: baseProfile(),
      coverage: coverageOf(20),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const plan = buildCoachPlan(input);
    const surplus = plan.whatIfs.filter((w) => w.lever === 'surplus');

    expect(surplus.length).toBeGreaterThan(0);
    for (const s of surplus) {
      expect(s.changed).toBe(false);
      expect(s.note).toMatch(/30 days|history/i);
    }
  });

  it('derives surplus magnitudes from actual spending, not fixed amounts', () => {
    const reductionOf = (a: { magnitude: string }) => Number(a.magnitude.replace(/[^\d]/g, ''));
    const maxSurplus = (input: CoachPlanInput) =>
      Math.max(...buildCoachPlan(input).whatIfs.filter((w) => w.lever === 'surplus').map(reductionOf));

    const bigSpender = maxSurplus({
      profile: baseProfile({ avgSurplus: 200, savingsRate: 200 / 2500 }),
      coverage: coverageOf(45), confidenceTxns: txns(), expenseRatio: 0.9, products: DEFAULT_PRODUCTS,
    });
    const smallSpender = maxSurplus({
      profile: baseProfile({ avgSurplus: 2300, savingsRate: 2300 / 2500 }),
      coverage: coverageOf(45), confidenceTxns: txns(), expenseRatio: 0.1, products: DEFAULT_PRODUCTS,
    });

    expect(bigSpender).toBeGreaterThan(smallSpender);
  });

  it('never offers a coverage milestone that would decline the offer', () => {
    // A Strong score on a thin surplus: reaching 90 days qualifies the top tier the surplus can't
    // afford, which would decline  so that milestone must not be surfaced as an "unlock".
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 900, savingsRate: 900 / 2500 }),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };
    const plan = buildCoachPlan(input);
    for (const w of plan.whatIfs.filter((w) => w.lever === 'coverage')) {
      expect(w.sim.decisionTo).not.toBe('decline');
    }
  });

  it('offers no coverage action once the trailing window is already fully covered', () => {
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 700, savingsRate: 700 / 2500 }),
      coverage: coverageOf(90),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const plan = buildCoachPlan(input);

    expect(plan.actions.some((a) => a.lever === 'coverage')).toBe(false);
    expect(plan.whatIfs.some((a) => a.lever === 'coverage')).toBe(false);
  });
});

describe('stressIncome', () => {
  it('reports an approved offer weakening as income is shocked downward', () => {
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 900, savingsRate: 900 / 2500 }),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };
    const scenario = { coverageDays: 45, coverageRatio: 45 / 90, avgSurplus: 900 };

    const points = stressIncome(input, scenario);

    expect(points.map((p) => p.dipPct)).toEqual([10, 20, 30]);
    // The offer holds a small dip but a large one erodes it (monotonic: never improves under stress).
    expect(points[0].maxAmount).toBeGreaterThanOrEqual(points[2].maxAmount);
    expect(survivesDipPct(points)).toBeGreaterThanOrEqual(10);
    expect(survivesDipPct(points)).toBeLessThan(100);
  });
});

describe('simulateStress', () => {
  it('holds or weakens the offer as income is cut  never improves it', () => {
    // A genuine approve baseline (coverage 45 → Starter, surplus 700 → an affordable offer).
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 700, savingsRate: 700 / 2500 }),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const sim = simulateStress(input, 0.2);

    expect(sim.maxAmountTo).toBeLessThanOrEqual(sim.maxAmountFrom);
    expect(sim.scoreTo).toBeLessThanOrEqual(sim.scoreFrom);
  });
});

describe('buildCoachPlan income-stress what-ifs', () => {
  it('offers protective income-dip chips to probe a real offer against a downturn', () => {
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 700, savingsRate: 700 / 2500 }),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };

    const plan = buildCoachPlan(input);
    const stress = plan.whatIfs.filter((w) => w.lever === 'stress');

    expect(stress.length).toBeGreaterThanOrEqual(2);
    for (const s of stress) {
      expect(s.magnitude).toMatch(/−\d+% income/);
      // A downside test is never dressed up as an improvement, and always carries an honest note.
      expect(s.changed).toBe(false);
      expect(s.note).toBeTruthy();
      expect(s.sim.maxAmountTo).toBeLessThanOrEqual(s.sim.maxAmountFrom);
    }
    // Stress probes never enter the ranked "next steps"  those are genuine improvements only.
    expect(plan.actions.some((a) => a.lever === 'stress')).toBe(false);
  });

  it('omits income-stress chips when there is no supportable offer to protect', () => {
    const input: CoachPlanInput = {
      profile: baseProfile(),
      coverage: coverageOf(90),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
      adverseRecord: 'hard', // hard-adverse → decline, nothing to stress-test
    };

    const plan = buildCoachPlan(input);

    expect(plan.baseline.maxAmount).toBe(0);
    expect(plan.whatIfs.some((w) => w.lever === 'stress')).toBe(false);
  });
});

describe('diagnoseConstraint', () => {
  it('identifies thin coverage as the binding constraint for a gated file', () => {
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 900, savingsRate: 900 / 2500 }),
      coverage: coverageOf(18), // < 30 → Emergency gate dominates
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };
    expect(diagnoseConstraint(input).constraint).toBe('coverage');
  });

  it('identifies a tight surplus as the binding constraint when coverage is full', () => {
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 150, savingsRate: 150 / 2500 }),
      coverage: coverageOf(90), // full coverage → affordability is what bites
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };
    expect(diagnoseConstraint(input).constraint).toBe('affordability');
  });
});

// ── Published lender policy pass-through (Brief N) ────────────────────────────

describe('lender policy pass-through', () => {
  it('a fetched lender policy changes what the coach simulates  "what TEKUN would say" tracks the live policy', () => {
    const input: CoachPlanInput = {
      profile: baseProfile({ avgSurplus: 700, savingsRate: 700 / 2500 }),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };
    const dflt = buildCoachPlan(input);
    // The same lender, now publishing a confidence floor above this profile's confidence:
    const strict = buildCoachPlan({
      ...input,
      policy: {
        minConfidenceToApprove: 0.99,
        maxInstallmentShareOfSurplus: 0.35,
        maxDsr: 0.4,
        emergencyOnlyBelowDays: 30,
        fullLadderFromDays: 90,
        minCoverageRatioForFullLadder: 0.5,
        costOfFunds: 0.05,
        targetReturn: 0.06,
      },
    });
    expect(dflt.baseline.decision).toBe('approve');
    expect(strict.baseline.decision).toBe('refer');
  });

  it('omitted policy keeps the default simulation (back-compat with lenders that publish none)', () => {
    const input: CoachPlanInput = {
      profile: baseProfile(),
      coverage: coverageOf(45),
      confidenceTxns: txns(),
      expenseRatio: 0.6,
      products: DEFAULT_PRODUCTS,
    };
    expect(buildCoachPlan(input)).toEqual(buildCoachPlan({ ...input, policy: undefined }));
  });
});
