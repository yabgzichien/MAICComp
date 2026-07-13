// src/lib/coachPlan.ts
// Pure, deterministic "Passport Builder Coach" simulator. Given a borrower's current profile,
// it re-runs the real engines (computeDataConfidence, computeCreditScore, decideLoan) under a
// candidate action and reports the honest before→after deltas. The AI never computes these
// numbers; it only narrates the plan this module produces. No UI/DB imports  unit-tested.
import { computeCreditScore, type CreditBand, type CreditProfile } from './creditScore';
import type { Coverage } from './coverage';
import { computeDataConfidence, type ConfidenceTxn } from './dataConfidence';
import { decideLoan, type AdverseRecord, type Decision, type LenderPolicy, type LoanDecision, type LoanProduct } from './loans';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export interface CoachPlanInput {
  profile: CreditProfile;
  coverage: Coverage;
  confidenceTxns: ConfidenceTxn[];
  expenseRatio: number;
  products: LoanProduct[];
  adverseRecord?: AdverseRecord;
  /** The lender's published thresholds (Brief N flywheel). Omitted → engine defaults. */
  policy?: LenderPolicy;
}

export interface CoachSim {
  scoreFrom: number;
  scoreTo: number;
  bandFrom: CreditBand;
  bandTo: CreditBand;
  confidenceFrom: number;
  confidenceTo: number;
  decisionFrom: Decision;
  decisionTo: Decision;
  maxAmountFrom: number;
  maxAmountTo: number;
}

export type CoachLever = 'coverage' | 'surplus' | 'track';

export interface CoachAction {
  lever: CoachLever;
  /** Human action label, e.g. "Reach 30 days of recorded history". */
  label: string;
  /** Compact magnitude chip, e.g. "+10 days" or "−RM300/mo". */
  magnitude: string;
  sim: CoachSim;
  /** Ranking metric  higher is a bigger win. Decision jump ≫ amount gain ≫ score gain. */
  impact: number;
  /** Whether this action actually moves the offer (score, decision, or amount). */
  changed: boolean;
  /** When it doesn't move the offer, the honest reason why (e.g. blocked by the coverage gate). */
  note?: string;
  /** For an action that yields an approved offer: the largest income dip (%) that offer survives. */
  survivesDipPct?: number;
}

export interface CoachPlan {
  baseline: {
    score: number;
    band: CreditBand;
    confidence: number;
    decision: Decision;
    maxAmount: number;
  };
  /** The single policy constraint most binding the borrower right now (drives the headline). */
  diagnosis: ConstraintDiagnosis;
  /** Levers that actually improve the outcome, ranked most-valuable first. */
  actions: CoachAction[];
  /** Preset what-if chips the borrower can tap; stable order, may include flat results. */
  whatIfs: CoachAction[];
}

export interface Evaluation {
  score: number;
  band: CreditBand;
  confidence: number;
  loan: LoanDecision;
}

/** The requested amount we probe `decideLoan` with  the top of the ladder, so the returned
 *  `maxAmount` reveals the true ceiling the applicant qualifies for under this scenario. */
function probeAmount(products: LoanProduct[]): number {
  return products.reduce((m, p) => Math.max(m, p.maxAmount), 0);
}

/**
 * Re-run the real engines under a candidate scenario. Confidence is always recomputed from the
 * borrower's own transactions at the given coverage ratio (so a coverage change flows through to
 * confidence, the score dampener, and the loan decision exactly as production would). An optional
 * surplus override models "free up RM x/month of spending".
 */
function evaluate(
  input: CoachPlanInput,
  opts: {
    coverageRatio: number;
    coverageDays: number;
    avgSurplus?: number;
    repaymentOnTime?: number;
    repaymentTotal?: number;
    /** Override average income (models an income shock, or relaxing the DSR/score income input). */
    avgIncome?: number;
    /** Override the recomputed data confidence (used to relax the confidence gate in diagnosis). */
    confidence?: number;
  }
): Evaluation {
  const dc = computeDataConfidence(input.confidenceTxns, opts.coverageRatio, input.expenseRatio);
  const confidence = opts.confidence ?? dc.confidence;
  const avgIncome = opts.avgIncome ?? input.profile.avgIncome;
  const avgSurplus = opts.avgSurplus ?? input.profile.avgSurplus;
  const savingsRate = avgIncome > 0 ? avgSurplus / avgIncome : 0;
  const profile: CreditProfile = {
    ...input.profile,
    avgIncome,
    confidence,
    avgSurplus,
    savingsRate,
    repaymentOnTime: opts.repaymentOnTime ?? input.profile.repaymentOnTime,
    repaymentTotal: opts.repaymentTotal ?? input.profile.repaymentTotal,
  };
  const score = computeCreditScore(profile);
  const loan = decideLoan({
    score: score.score,
    band: score.band,
    confidence,
    avgMonthlySurplus: avgSurplus,
    monthlyDebtService: profile.monthlyDebtService,
    avgIncome,
    requestedAmount: probeAmount(input.products),
    products: input.products,
    adverseRecord: input.adverseRecord,
    coverageRatio: opts.coverageRatio,
    coverageDaysCovered: opts.coverageDays,
    integrityFloorBreached: dc.integrityFloorBreached,
    policy: input.policy,
  });
  return { score: score.score, band: score.band, confidence, loan };
}

/** Package a baseline vs projected evaluation into a before→after CoachSim. */
function simOf(from: Evaluation, to: Evaluation): CoachSim {
  return {
    scoreFrom: from.score,
    scoreTo: to.score,
    bandFrom: from.band,
    bandTo: to.band,
    confidenceFrom: from.confidence,
    confidenceTo: to.confidence,
    decisionFrom: from.loan.decision,
    decisionTo: to.loan.decision,
    maxAmountFrom: from.loan.maxAmount,
    maxAmountTo: to.loan.maxAmount,
  };
}

/** Baseline evaluation at the borrower's current coverage and surplus. Exported so the
 *  Coach's lender strip can cheaply badge each published ladder without building a full plan. */
export function baseline(input: CoachPlanInput): Evaluation {
  return evaluate(input, {
    coverageRatio: input.coverage.ratio,
    coverageDays: input.coverage.daysCovered,
  });
}

/** Simulate extending recorded history to `targetDays` covered days in the trailing window. */
export function simulateCoverage(input: CoachPlanInput, targetDays: number): CoachSim {
  const win = input.coverage.windowDays || 90;
  const to = evaluate(input, {
    coverageRatio: clamp(targetDays / win, 0, 1),
    coverageDays: targetDays,
  });
  return simOf(baseline(input), to);
}

/** Simulate freeing up `monthlyExpenseReduction` RM/month of spending (raising the surplus). */
export function simulateSurplus(input: CoachPlanInput, monthlyExpenseReduction: number): CoachSim {
  const to = evaluate(input, {
    coverageRatio: input.coverage.ratio,
    coverageDays: input.coverage.daysCovered,
    avgSurplus: input.profile.avgSurplus + monthlyExpenseReduction,
  });
  return simOf(baseline(input), to);
}

/** Simulate building an on-time repayment record of `onTimeCount` repayments (all paid on time). */
export function simulateTrackRecord(input: CoachPlanInput, onTimeCount: number): CoachSim {
  const to = evaluate(input, {
    coverageRatio: input.coverage.ratio,
    coverageDays: input.coverage.daysCovered,
    repaymentOnTime: input.profile.repaymentOnTime + onTimeCount,
    repaymentTotal: input.profile.repaymentTotal + onTimeCount,
  });
  return simOf(baseline(input), to);
}

// ── B: forward-looking income stress test ─────────────────────────────────────

export interface StressPoint {
  dipPct: number; // income dip applied, as a whole-number %
  decision: Decision;
  maxAmount: number;
}

const STRESS_DIPS = [0.1, 0.2, 0.3];

/**
 * Stress-test a scenario's loan offer against downward income shocks. A dip cuts income and  since
 * spending is unchanged  the surplus by the same ringgit amount, then re-runs the real decision
 * engine. This is the forward-looking affordability check the CCA-2025 duty points at: not just
 * "can they afford it today" but "does the offer still hold if the gig economy softens".
 */
export function stressIncome(
  input: CoachPlanInput,
  scenario: { coverageDays: number; coverageRatio: number; avgSurplus?: number },
  dips: number[] = STRESS_DIPS
): StressPoint[] {
  const baseIncome = input.profile.avgIncome;
  const baseSurplus = scenario.avgSurplus ?? input.profile.avgSurplus;
  return dips.map((d) => {
    const ev = evaluate(input, {
      coverageRatio: scenario.coverageRatio,
      coverageDays: scenario.coverageDays,
      avgIncome: baseIncome * (1 - d),
      avgSurplus: baseSurplus - baseIncome * d,
    });
    return { dipPct: Math.round(d * 100), decision: ev.loan.decision, maxAmount: ev.loan.maxAmount };
  });
}

/** The largest income dip (%) at which the stressed offer still stands (not declined). 0 if none. */
export function survivesDipPct(points: StressPoint[]): number {
  let best = 0;
  for (const p of points) {
    if (p.decision !== 'decline' && p.maxAmount > 0) best = Math.max(best, p.dipPct);
  }
  return best;
}

// ── C: binding-constraint diagnosis ───────────────────────────────────────────

export type Constraint = 'coverage' | 'confidence' | 'affordability' | 'none';

export interface ConstraintDiagnosis {
  constraint: Constraint;
  /** Short human label for the binding constraint (or that none binds). */
  label: string;
}

const CONSTRAINT_LABEL: Record<Constraint, string> = {
  coverage: 'Thin data coverage',
  confidence: 'Low data confidence',
  affordability: 'A tight monthly surplus',
  none: 'Nothing  you already reach the top offer',
};

/**
 * Find the single policy constraint that, if relaxed on its own, most improves the offer  the
 * borrower's binding constraint. Each is relaxed by overriding just its input and re-running the
 * real engine; the largest genuine improvement over the baseline wins. A relaxation that overshoots
 * into an unaffordable tier (a worse outcome) scores zero, so it never masquerades as the blocker.
 */
export function diagnoseConstraint(input: CoachPlanInput): ConstraintDiagnosis {
  const base = baseline(input);
  const win = input.coverage.windowDays || 90;

  // Coverage: the best genuinely-improving milestone (mirrors the coach's own non-declining filter).
  const coverageImpact = coverageMilestones(input.coverage.daysCovered, win, gateDaysOf(input))
    .map((t) => coverageActionAt(input, t))
    .filter((a) => a.sim.decisionTo !== 'decline')
    .reduce((m, a) => Math.max(m, a.impact), 0);

  const confidenceImpact = Math.max(
    0,
    impactOf(
      simOf(
        base,
        evaluate(input, {
          coverageRatio: input.coverage.ratio,
          coverageDays: input.coverage.daysCovered,
          confidence: 1,
        })
      )
    )
  );

  const affordabilityImpact = Math.max(
    0,
    impactOf(
      simOf(
        base,
        evaluate(input, {
          coverageRatio: input.coverage.ratio,
          coverageDays: input.coverage.daysCovered,
          avgSurplus: Math.max(input.profile.avgSurplus, input.profile.avgIncome),
        })
      )
    )
  );

  const ranked: [Constraint, number][] = [
    ['coverage', coverageImpact],
    ['confidence', confidenceImpact],
    ['affordability', affordabilityImpact],
  ];
  let best: Constraint = 'none';
  let bestImpact = 0;
  for (const [c, imp] of ranked) {
    if (imp > bestImpact) {
      bestImpact = imp;
      best = c;
    }
  }
  return { constraint: best, label: CONSTRAINT_LABEL[best] };
}

const DECISION_RANK: Record<Decision, number> = { decline: 0, refer: 1, approve: 2 };

/** Ranking metric for an action. A decision jump (decline→refer→approve) dominates any RM gain,
 *  which in turn dominates a raw score gain  so the plan leads with what changes the outcome. */
function impactOf(sim: CoachSim): number {
  const decisionGain = DECISION_RANK[sim.decisionTo] - DECISION_RANK[sim.decisionFrom];
  const amountGain = sim.maxAmountTo - sim.maxAmountFrom;
  const scoreGain = sim.scoreTo - sim.scoreFrom;
  return decisionGain * 1_000_000 + amountGain * 100 + scoreGain;
}

function rm(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}

/** Below this many covered days the Emergency-tier gate caps the offer no matter the surplus.
 *  The engine default; a lender's published policy (Brief N) may move it. */
const COVERAGE_GATE_DAYS = 30;

/** The Emergency-only gate in force for this input  the lender's published gate when present. */
function gateDaysOf(input: CoachPlanInput): number {
  return input.policy?.emergencyOnlyBelowDays ?? COVERAGE_GATE_DAYS;
}

/** True when an action moves the offer in any observable way (score, decision, or amount). */
function simChanged(sim: CoachSim): boolean {
  return (
    sim.scoreTo > sim.scoreFrom ||
    sim.decisionTo !== sim.decisionFrom ||
    sim.maxAmountTo > sim.maxAmountFrom
  );
}

/**
 * Surplus what-if magnitudes derived from the borrower's *actual* monthly spending, so the chips
 * mean something for this person (not hardcoded RM100/300/500). Steps at ~10/25/50% of expenses,
 * rounded to RM50, de-duplicated; falls back to a single small step when spending is tiny.
 */
function surplusPresets(profile: CreditProfile): number[] {
  const expenses = Math.max(0, profile.avgIncome - profile.avgSurplus);
  const steps = [0.1, 0.25, 0.5]
    .map((f) => Math.round((expenses * f) / 50) * 50)
    .filter((x) => x >= 50);
  const uniq = [...new Set(steps)];
  return uniq.length > 0 ? uniq : [50];
}

/** How many on-time repayments the track-record what-if models. */
const TRACK_RECORD_COUNT = 3;

/** The coverage milestones still ahead of the borrower (Emergency-gate floor → Starter,
 *  full-window → full ladder), under the gate actually in force for this lender. */
function coverageMilestones(daysCovered: number, windowDays: number, gateDays: number): number[] {
  const targets: number[] = [];
  if (daysCovered < gateDays) targets.push(gateDays); // Emergency-only floor → Starter
  if (daysCovered < windowDays) targets.push(windowDays); // Starter cap → full ladder
  return targets;
}

/** For an approved offer, the largest income dip it survives  otherwise undefined. */
function stressOf(
  input: CoachPlanInput,
  sim: CoachSim,
  scenario: { coverageDays: number; coverageRatio: number; avgSurplus?: number }
): number | undefined {
  if (sim.decisionTo !== 'approve') return undefined;
  return survivesDipPct(stressIncome(input, scenario));
}

function coverageActionAt(input: CoachPlanInput, target: number): CoachAction {
  const win = input.coverage.windowDays || 90;
  const sim = simulateCoverage(input, target);
  return {
    lever: 'coverage',
    label: `Reach ${target} days of recorded history`,
    magnitude: `+${target - input.coverage.daysCovered} days`,
    sim,
    impact: impactOf(sim),
    changed: simChanged(sim),
    survivesDipPct: stressOf(input, sim, {
      coverageDays: target,
      coverageRatio: clamp(target / win, 0, 1),
      avgSurplus: input.profile.avgSurplus,
    }),
  };
}

/** Build an on-time repayment record  omitted when it changes nothing (e.g. record already perfect). */
function trackRecordAction(input: CoachPlanInput): CoachAction | null {
  const sim = simulateTrackRecord(input, TRACK_RECORD_COUNT);
  if (!simChanged(sim)) return null;
  return {
    lever: 'track',
    label: `Build a ${TRACK_RECORD_COUNT}-month on-time repayment record`,
    magnitude: `On-time ×${TRACK_RECORD_COUNT}`,
    sim,
    impact: impactOf(sim),
    changed: true,
  };
}

/**
 * Assemble the full coach plan: a ranked list of levers that genuinely improve the outcome, plus
 * the preset what-if chips. Pure  every number comes from the deterministic engines via `evaluate`.
 * Flat surplus chips carry an honest reason: blocked by the coverage gate, too small a step, or
 * already at the tier ceiling  never a misleading "try a bigger step" when nothing would help.
 */
export function buildCoachPlan(input: CoachPlanInput): CoachPlan {
  const b = baseline(input);
  const win = input.coverage.windowDays || 90;

  // A coverage milestone that would *decline* (e.g. more history qualifies a higher tier the
  // borrower's surplus can't yet afford) is misleading to offer as an unlock  drop it. The honest
  // path in that case is the surplus lever, which stays available.
  const gateDays = gateDaysOf(input);
  const coverageActions = coverageMilestones(input.coverage.daysCovered, win, gateDays)
    .map((t) => coverageActionAt(input, t))
    .filter((a) => a.sim.decisionTo !== 'decline');
  const nearestCoverage = coverageActions[0] ?? null;

  const coverageBlocks = input.coverage.daysCovered < gateDays;
  const raw = surplusPresets(input.profile).map((reduction) => ({
    reduction,
    sim: simulateSurplus(input, reduction),
  }));
  const anyStepHelps = raw.some((r) => simChanged(r.sim));

  const surpluses: CoachAction[] = raw.map(({ reduction, sim }) => {
    const changed = simChanged(sim);
    let note: string | undefined;
    if (!changed) {
      if (coverageBlocks) {
        note = `Reach ${gateDays} days of recorded history first  trimming spending can't lift an Emergency-tier offer.`;
      } else if (anyStepHelps) {
        note = 'Free up a little more to move your offer.';
      } else {
        note = 'You can already afford your tier maximum  history and score are your levers now.';
      }
    }
    return {
      lever: 'surplus',
      label: `Free up ${rm(reduction)}/mo of spending`,
      magnitude: `−${rm(reduction)}/mo`,
      sim,
      impact: impactOf(sim),
      changed,
      note,
      survivesDipPct: stressOf(input, sim, {
        coverageDays: input.coverage.daysCovered,
        coverageRatio: input.coverage.ratio,
        avgSurplus: input.profile.avgSurplus + reduction,
      }),
    };
  });

  const track = trackRecordAction(input);
  const bestSurplus = surpluses.reduce((best, s) => (s.impact > best.impact ? s : best));

  // The ranked plan surfaces only levers that move the *offer* (decision or amount)  the nearest
  // coverage milestone, the best surplus step, a repayment record  most-valuable first. Levers that
  // only nudge the score (e.g. an early repayment record while coverage still gates the tier) stay in
  // the explorable what-ifs rather than cluttering "your next steps".
  const movesOffer = (a: CoachAction) =>
    a.sim.decisionTo !== a.sim.decisionFrom || a.sim.maxAmountTo > a.sim.maxAmountFrom;
  const actions = [...(nearestCoverage ? [nearestCoverage] : []), bestSurplus, ...(track ? [track] : [])]
    .filter((a) => a.impact > 0 && movesOffer(a))
    .sort((x, y) => y.impact - x.impact);

  return {
    baseline: {
      score: b.score,
      band: b.band,
      confidence: b.confidence,
      decision: b.loan.decision,
      maxAmount: b.loan.maxAmount,
    },
    diagnosis: diagnoseConstraint(input),
    actions,
    whatIfs: [...coverageActions, ...surpluses, ...(track ? [track] : [])],
  };
}
