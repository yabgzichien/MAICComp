/**
 * Demo acceptance tests — Profile 3: Faizal.
 * Same stated need as Aina but uploaded screenshots are suspiciously clean: round numbers,
 * thin merchant variety, manual provenance, near-duplicate entries.
 * Target: confidence < 50%, REFER decision via confidence cap, ML reasons present in badge.
 */
import { buildFaizalSeed } from '../src/data/demoSeed';
import { assembleCredit, type CreditInputs } from '../src/lib/assembleCredit';
import { decideLoan, DEFAULT_PRODUCTS } from '../src/lib/loans';
import type { Account, BalanceEntry, Transaction } from '../src/lib/types';

const NOW = new Date('2026-07-13T12:00:00.000Z');

function assemble() {
  const seed = buildFaizalSeed(NOW);
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
    source: t.source ?? 'manual',
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

describe('demo acceptance: Faizal — low confidence, fraud layer intervenes', () => {
  it('data confidence is below 50%', () => {
    const { dataConfidence } = assemble();
    expect(dataConfidence.confidence).toBeLessThan(0.50);
  });

  it('loan decision is refer on every product (confidence cap blocks approval)', () => {
    const { profile, score, coverage, dataConfidence } = assemble();
    for (const product of DEFAULT_PRODUCTS) {
      const d = decideLoan({
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
      });
      expect(d.decision).not.toBe('approve');
    }
  });

  it('ML fraud reasons are present in the confidence badge', () => {
    const { dataConfidence } = assemble();
    const mlReasons = dataConfidence.reasons.filter((r) => r.key.startsWith('ml_'));
    expect(mlReasons.length).toBeGreaterThan(0);
    // At least one ML reason should be flagged as a fraud signal (ok: false)
    const mlFraudSignals = mlReasons.filter((r) => !r.ok);
    expect(mlFraudSignals.length).toBeGreaterThan(0);
  });

  it('confidence is meaningfully below Aina\'s 60% floor', () => {
    // The fraud/confidence story only lands if the gap is visible, not just technically < 0.50.
    const { dataConfidence } = assemble();
    expect(dataConfidence.confidence).toBeLessThan(0.45);
  });
});
