/**
 * Judge demo acceptance tests (spec F2, F3): the coach plan compiles from the seed, and the
 * passport send-card's `supportable` pre-fill stays honestly coverage-gated  the full-ladder
 * decision the Credit Passport pre-fills its requested amount from must remain a gated REFER for
 * the thin-coverage persona, never an unqualified approve.
 *
 * F2 changed shape in the confidence-gate rework (2026-07-22): Aina's coverage-unlock hero beat
 * (REFER RM500 -> APPROVE RM3,000+) was retired on purpose  she is now referred on CONFIDENCE
 * (mixed screenshot/manual provenance, ~58%, below the new 70% auto-approve floor), and fixing
 * coverage alone can no longer clear that separate gate. The coverage lever still does something
 * real and honest, though: it substantially raises the amount an officer would consider on
 * review. See demoSeed.ts's buildAinaSeed docstring and HANDOFF.md's confidence-gate section.
 */
import { buildDemoSeed } from '../src/data/demoSeed';
import { assembleCredit, type CreditInputs } from '../src/lib/assembleCredit';
import { buildCoachPlan, type CoachPlanInput } from '../src/lib/coachPlan';
import { decideLoan, DEFAULT_PRODUCTS } from '../src/lib/loans';
import type { Account, BalanceEntry, Transaction } from '../src/lib/types';

const NOW = new Date('2026-07-13T12:00:00.000Z');

function assemble() {
  const seed = buildDemoSeed(NOW);
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
  return assembleCredit(inputs, NOW);
}

describe('demo acceptance: coach coverage lever (spec F2, retired hero-beat)', () => {
  it('coverage still substantially raises the amount an officer would consider, without flipping the decision', () => {
    const { profile, coverage, dataConfidence, confidenceTxns, expenseRatio } = assemble();
    const coachInput: CoachPlanInput = { profile, coverage, confidenceTxns, expenseRatio, products: DEFAULT_PRODUCTS };
    const plan = buildCoachPlan(coachInput);

    // Starting point: gated to Emergency (REFER)  now confidence-driven, not coverage-driven.
    expect(plan.baseline.decision).toBe('refer');

    const coverageAction = plan.actions.find((a) => a.lever === 'coverage');
    expect(coverageAction).toBeDefined();
    // `changed` is true because the OFFER improves (RM500 -> RM3,000+), which is a real, honest
    // next step — it is not because the decision itself flips to approve anymore. Confidence
    // sitting below the 70% auto-approve floor means fixing coverage alone can no longer clear
    // that separate gate, and the coach plan is honest about that rather than overclaiming.
    expect(coverageAction!.changed).toBe(true);
    expect(coverageAction!.sim.decisionTo).toBe('refer');
    expect(coverageAction!.sim.maxAmountTo).toBeGreaterThanOrEqual(3000);
    expect(coverageAction!.sim.maxAmountTo).toBeGreaterThan(coverageAction!.sim.maxAmountFrom);

    void dataConfidence; // sanity: destructured for completeness, not asserted here
  });
});

// Confidence-gate rework (2026-07-22): Aina's provenance mix was retuned so she is referred on
// CONFIDENCE (not just coverage)  see demoSeed.ts's buildAinaSeed docstring for the full
// rationale. Pins the new range here so the seed and the design it demonstrates can't silently
// drift apart again.
describe('demo acceptance: the persona stays in the spec-pinned Good band (retuned 2026-07-22)', () => {
  it('score 690-715, band Good, confidence 55-62%, referred on confidence not just coverage', () => {
    const { score, dataConfidence } = assemble();
    expect(score.band).toBe('Good');
    expect(score.score).toBeGreaterThanOrEqual(690);
    expect(score.score).toBeLessThanOrEqual(715);
    expect(dataConfidence.confidence).toBeGreaterThanOrEqual(0.55);
    expect(dataConfidence.confidence).toBeLessThanOrEqual(0.62);
    // Must sit below the 70% auto-approve floor and above the 35% decline floor  the whole
    // point of this persona is landing in the human-judgement band, not at either edge.
    expect(dataConfidence.confidence).toBeLessThan(0.7);
    expect(dataConfidence.confidence).toBeGreaterThan(0.35);
  });
});

describe('demo acceptance: the passport send-card supportable is coverage-gated (spec F3, honesty)', () => {
  it('the full-ladder coverage-gated decision the passport pre-fills from stays a gated refer for the thin-coverage persona', () => {
    const { profile, score, coverage, dataConfidence } = assemble();
    const ladderMax = Math.max(...DEFAULT_PRODUCTS.map((p) => p.maxAmount));
    // Mirrors PassportScreen.tsx's `supportable` computation (all products at once, coverage-gated).
    const gated = decideLoan({
      score: score.score,
      band: score.band,
      confidence: score.confidence,
      avgMonthlySurplus: profile.avgSurplus,
      monthlyDebtService: profile.monthlyDebtService,
      avgIncome: profile.avgIncome,
      requestedAmount: ladderMax,
      products: DEFAULT_PRODUCTS,
      coverageRatio: coverage.ratio,
      coverageDaysCovered: coverage.daysCovered,
      integrityFloorBreached: dataConfidence.integrityFloorBreached,
    });
    // Thin coverage → the honest gated outcome is a refer, never an unqualified approve
    // (the same property the removed Loans-tier test asserted, now on the passport surface).
    expect(gated.decision).toBe('refer');
  });
});
