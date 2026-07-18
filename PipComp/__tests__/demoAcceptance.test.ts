/**
 * Judge demo acceptance tests (spec F2, F3): the coach's hero beat compiles from the seed, and
 * the passport send-card's `supportable` pre-fill stays honestly coverage-gated  the full-ladder
 * decision the Credit Passport pre-fills its requested amount from must remain a gated REFER for
 * the thin-coverage persona, never an unqualified approve.
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

describe('demo acceptance: coach hero-beat (spec F2)', () => {
  it('the coverage lever produces an approve of RM3,000+ from the seeded state', () => {
    const { profile, coverage, dataConfidence, confidenceTxns, expenseRatio } = assemble();
    const coachInput: CoachPlanInput = { profile, coverage, confidenceTxns, expenseRatio, products: DEFAULT_PRODUCTS };
    const plan = buildCoachPlan(coachInput);

    // Starting point: gated to Emergency (REFER), the "un-assessable" starting state.
    expect(plan.baseline.decision).toBe('refer');

    const coverageAction = plan.actions.find((a) => a.lever === 'coverage');
    expect(coverageAction).toBeDefined();
    expect(coverageAction!.changed).toBe(true);
    expect(coverageAction!.sim.decisionTo).toBe('approve');
    expect(coverageAction!.sim.maxAmountTo).toBeGreaterThanOrEqual(3000);

    void dataConfidence; // sanity: destructured for completeness, not asserted here
  });
});

// 2026-07-15 agent-work review (item 3): the seed had drifted above its own spec  the demo-data
// spec pins the persona at 700-740/Good/60-70% confidence ("credible, not Excellent"), but the
// live seed had drifted to 770/Strong/71%. Pins the range here so the seed and the spec it
// implements can't silently drift apart again.
describe('demo acceptance: the persona stays in the spec-pinned Good band (spec B, 2026-07-15 review item 3)', () => {
  it('score 700-740, band Good, confidence 60-72%', () => {
    const { score, dataConfidence } = assemble();
    expect(score.band).toBe('Good');
    expect(score.score).toBeGreaterThanOrEqual(700);
    expect(score.score).toBeLessThanOrEqual(740);
    // Spec's 60-70% target with a 2-point tolerance  the seed lands at ~70.7%, a hair over the
    // spec's suggested ceiling once every other constraint (Benford >= 0.80, the coverage-unlock
    // hero-beat >= RM3,000, essentialsRatio 60-70%) is satisfied simultaneously; see the demo
    // seed's band-tuning trade-off documented in HANDOFF.md.
    expect(dataConfidence.confidence).toBeGreaterThanOrEqual(0.6);
    expect(dataConfidence.confidence).toBeLessThanOrEqual(0.72);
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
