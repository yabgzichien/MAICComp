/**
 * Acceptance: the three demo personas must demonstrate the three distinct lender outcomes
 * (2026-07-21). A judge stepping through them should see an instant approval, a referral to a
 * human, and an outright rejection — without editing anything.
 *
 * Pinned here because each outcome is produced by a DIFFERENT gate, and each is one seed tweak
 * away from collapsing into its neighbour:
 *   Ravi    → approve, on clean confidence and enough coverage for the full ladder.
 *   Aina    → refer, CONFIDENCE-gated (retuned 2026-07-22): a genuine mix of screenshot-
 *             extracted and hand-logged spend leaves her provenance trust below the 70%
 *             auto-approve floor — an honest "less fully verified", not a fraud signal (Benford,
 *             round-number ratio, and duplicate checks all stay clean). Her coverage is thin too
 *             (a real, secondary reason), but confidence is the one that decides this now; see
 *             demoSeed.ts's buildAinaSeed docstring for the full rationale, including why the
 *             old coverage-only-unlock coach demo beat was retired.
 *   Faizal  → decline, confidence-gated much further down: plenty of apparent income, almost
 *             none of it credible.
 * If a seed change flips any of these, the demo silently stops making its point.
 */
import { canStartWith, DEMO_PROFILES, RECOMMENDED_DEMO_PROFILE, TOUR_PATH, type DemoProfileId } from '../src/data/demoPersonas';
import { BORROWER_TOUR_STEPS, branchForDecision, stepsForBranch } from '../src/lib/tourSteps';
import { buildAinaSeed, buildFaizalSeed, buildRaviSeed, type DemoSeed } from '../src/data/demoSeed';
import { assembleCredit, type CreditInputs } from '../src/lib/assembleCredit';
import { decideLoan, DEFAULT_POLICY, DEFAULT_PRODUCTS } from '../src/lib/loans';
import type { Account, BalanceEntry, Transaction } from '../src/lib/types';

const NOW = new Date('2026-07-21T12:00:00.000Z');
const REQUESTED = 5000;

function assess(seed: DemoSeed) {
  const transactions: Transaction[] = seed.transactions.map((t, i) => ({
    id: String(i),
    merchantRaw: t.merchantRaw,
    merchantKey: t.merchantKey,
    amount: t.amount,
    currency: 'MYR',
    type: t.type,
    date: t.date,
    categoryId: t.categoryId,
    createdAt: `${t.date}T12:00:00.000Z`,
    source: t.source ?? 'extracted',
  }));
  const accounts: Account[] = seed.accounts.map((a, i) => ({
    id: String(i),
    name: a.name,
    kind: a.kind,
    cls: a.cls,
    archived: false,
    createdAt: a.entries[0].asOf,
    sub: null,
    symbol: null,
    ticker: null,
    quantity: null,
    cost: null,
  }));
  const balanceEntries: BalanceEntry[] = seed.accounts.flatMap((a, i) =>
    a.entries.map((e, j) => ({ id: `${i}-${j}`, accountId: String(i), value: e.value, asOf: e.asOf, createdAt: e.asOf }))
  );
  const accountValues: Record<string, number> = {};
  seed.accounts.forEach((a, i) => {
    accountValues[String(i)] = a.entries.at(-1)!.value;
  });
  const inputs: CreditInputs = {
    transactions,
    snapshotMonths: [],
    allocations: seed.budget.allocations,
    accounts,
    balanceEntries,
    accountValues,
    repaymentSummary: { onTime: 0, total: 0 },
  };
  const a = assembleCredit(inputs, NOW);
  const decision = decideLoan({
    score: a.score.score,
    band: a.score.band,
    confidence: a.score.confidence,
    avgMonthlySurplus: a.profile.avgSurplus,
    monthlyDebtService: a.profile.monthlyDebtService,
    avgIncome: a.profile.avgIncome,
    requestedAmount: REQUESTED,
    products: DEFAULT_PRODUCTS,
    coverageRatio: a.coverage.ratio,
    coverageDaysCovered: a.coverage.daysCovered,
    integrityFloorBreached: a.dataConfidence.integrityFloorBreached,
  });
  return { ...a, decision };
}

describe('demo personas cover all three lender outcomes', () => {
  it('Ravi is approved outright — enough coverage and credible data', () => {
    const { decision, dataConfidence } = assess(buildRaviSeed(NOW));
    expect(decision.decision).toBe('approve');
    expect(decision.maxAmount).toBeGreaterThan(0);
    expect(dataConfidence.confidence).toBeGreaterThanOrEqual(DEFAULT_POLICY.minConfidenceToApprove);
  });

  it('Aina is referred to a human on CONFIDENCE — genuine, mixed-provenance, not fraud-flagged', () => {
    const { decision, dataConfidence, coverage } = assess(buildAinaSeed(NOW));
    expect(decision.decision).toBe('refer');
    // Confidence must sit in the human-judgement band: below the 70% auto-approve floor (this
    // IS her referral reason now), but comfortably above the 35% decline floor and nowhere near
    // the integrity rings' 0.39 hard cap — she is thin-provenance, not a caught fraud case.
    expect(dataConfidence.confidence).toBeLessThan(DEFAULT_POLICY.minConfidenceToApprove);
    expect(dataConfidence.confidence).toBeGreaterThan(0.5);
    expect(dataConfidence.integrityFloorBreached).toBeFalsy();
    // Coverage stays genuinely thin too (a real, secondary factor) — but the stated reason for
    // THIS decision is confidence, since that gate is checked first in decideLoan.
    expect(coverage.daysCovered).toBeLessThan(DEFAULT_POLICY.emergencyOnlyBelowDays);
    expect(decision.reasons.join(' ')).toMatch(/could not verify enough/i);
  });

  it('Faizal is declined outright on the confidence floor', () => {
    const { decision, dataConfidence } = assess(buildFaizalSeed(NOW));
    expect(decision.decision).toBe('decline');
    expect(decision.maxAmount).toBe(0);
    expect(dataConfidence.confidence).toBeLessThan(DEFAULT_POLICY.minConfidenceToConsider);
    // Told the truth about WHY, and given something curable to do about it.
    expect(decision.reasons.join(' ')).toMatch(/could be corroborated/i);
  });

  it('the decline is confidence-driven, not an accident of his (ample) affordability', () => {
    const { profile, decision } = assess(buildFaizalSeed(NOW));
    // He shows a large apparent surplus — on affordability alone he would sail through. The
    // whole point of this persona is that the money looks fine and the evidence does not.
    expect(profile.avgSurplus).toBeGreaterThan(1000);
    expect(decision.decision).toBe('decline');
  });
});

describe('the outcome each persona ADVERTISES matches what the engine actually does', () => {
  // The onboarding front door prints a verdict pill per persona ("Approved" / "Referred to a
  // human" / "Declined") so a judge can see at a glance that one engine produces three
  // different answers. That copy is declared data on DEMO_PROFILES rather than computed at
  // render, so this is the pin that stops a seed tweak leaving the welcome screen advertising
  // an outcome the engine no longer produces.
  const BUILDERS: Record<DemoProfileId, (now: Date) => DemoSeed> = {
    aina: buildAinaSeed,
    ravi: buildRaviSeed,
    faizal: buildFaizalSeed,
  };

  it.each(DEMO_PROFILES.map((p) => [p.name, p.outcome.decision, p.id] as const))(
    '%s advertises → %s',
    (_name, advertised, id) => {
      expect(assess(BUILDERS[id](NOW)).decision.decision).toBe(advertised);
    }
  );

  it('advertises all three distinct outcomes — that is the whole point of the picker', () => {
    expect(new Set(DEMO_PROFILES.map((p) => p.outcome.decision)).size).toBe(3);
  });
});

describe('the confidence decline floor stays clear of the integrity rings', () => {
  it('sits below the rings’ 0.39 hard cap, so a fraud catch still escalates to a human', () => {
    // dataConfidence's Trust Dampener caps a caught asymmetric-fraud profile at exactly 0.39,
    // chosen so it lands in REFER via the 0.50 approve floor. A decline floor at or above 0.39
    // would turn every one of those catches into a silent auto-rejection.
    expect(DEFAULT_POLICY.minConfidenceToConsider).toBeLessThan(0.39);
  });

  it('leaves a real band for human review between decline and auto-approve', () => {
    expect(DEFAULT_POLICY.minConfidenceToConsider).toBeLessThan(DEFAULT_POLICY.minConfidenceToApprove);
    expect(DEFAULT_POLICY.minConfidenceToApprove - DEFAULT_POLICY.minConfidenceToConsider).toBeGreaterThanOrEqual(0.1);
  });
});

/**
 * The front door labels each ending with what the tour actually does on it (TOUR_PATH) and badges
 * one as the place to start. Both are derived from `outcome.decision`, which the suite above pins
 * against the real engine — these tests guard the derivation itself.
 */
describe('front-door tour-path labels', () => {
  it('labels every outcome, with no empty line', () => {
    for (const persona of DEMO_PROFILES) {
      expect(TOUR_PATH[persona.outcome.decision].line.length).toBeGreaterThan(0);
    }
  });

  it('recommends exactly one ending', () => {
    const recommended = DEMO_PROFILES.filter((p) => TOUR_PATH[p.outcome.decision].recommended);
    expect(recommended).toHaveLength(1);
    expect(RECOMMENDED_DEMO_PROFILE).toBe(recommended[0].id);
  });

  // Every ending is startable from the front door (2026-08-06). The console's finale card sends
  // a judge who wants another ending through Profile → Reset & go to setup, which lands them
  // right back here — so a row that could not be picked would make that instruction a dead end.
  // The badge still names where to start; it no longer gates it.
  it('lets any ending be the opening move, with the recommended one still badged', () => {
    const startable = DEMO_PROFILES.filter(canStartWith);
    expect(startable).toHaveLength(DEMO_PROFILES.length);
    expect(startable.map((p) => p.id)).toContain(RECOMMENDED_DEMO_PROFILE);
  });

  // The point of the badge is "this one plays the whole story". An ending that never reaches
  // taking the loan is the one thing it must never point at — which is exactly what would happen
  // if `recommended` were moved onto the decline.
  it('never recommends an ending that cannot reach the offer', () => {
    const persona = DEMO_PROFILES.find((p) => p.id === RECOMMENDED_DEMO_PROFILE)!;
    const run = stepsForBranch(BORROWER_TOUR_STEPS, branchForDecision(persona.outcome.decision));
    expect(run.map((s) => s.id)).toContain('accept-offer');
  });
});
