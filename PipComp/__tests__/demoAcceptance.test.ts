/**
 * Judge demo acceptance tests (spec F2, F3): the coach's hero beat compiles from the seed, and
 * the Loans screen's per-tier preview never contradicts the real gated decision (regression
 * guard for UI/UX P0-3  the Loans screen used to show "Likely approved" tier cards a
 * thin-coverage borrower would actually be REFERred on).
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

describe('demo acceptance: Loans screen never contradicts the engine (spec F3, regression guard for UI/UX P0-3)', () => {
  it('every tier preview equals the real coverage-gated decision, and Emergency alone is the reachable tier', () => {
    const { profile, score, coverage, dataConfidence } = assemble();

    // Mirrors LoansScreen.tsx's `previews` computation exactly.
    const previews = DEFAULT_PRODUCTS.map((product) => ({
      product,
      decision: decideLoan({
        score: score.score,
        band: score.band,
        confidence: score.confidence,
        avgMonthlySurplus: profile.avgSurplus,
        monthlyDebtService: profile.monthlyDebtService,
        avgIncome: profile.avgIncome,
        requestedAmount: product.maxAmount,
        products: [product],
        coverageRatio: coverage.ratio,
        coverageDaysCovered: coverage.daysCovered,
        integrityFloorBreached: dataConfidence.integrityFloorBreached,
      }),
    }));

    // The seed's coverage is deliberately thin (<30 days)  every tier card must show the
    // honest coverage-gated outcome, never an unqualified "Likely approved".
    for (const { product, decision } of previews) {
      if (product.id === 'emergency') {
        expect(decision.decision).toBe('refer');
        expect(decision.maxAmount).toBeGreaterThan(0);
      } else {
        expect(decision.decision).not.toBe('approve');
      }
      // The false "Score X is below the minimum tier threshold" misattribution (UI/UX P0-3)
      // must never appear when the real blocker is coverage.
      const hasFalseScoreReason = decision.reasons.some((r) => /below the minimum tier threshold/.test(r));
      const hasCoverageReason = decision.reasons.some((r) => /Coverage \d+%/.test(r));
      if (hasCoverageReason) expect(hasFalseScoreReason).toBe(false);
    }
  });
});
