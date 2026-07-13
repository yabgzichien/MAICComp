/**
 * Judge demo seed acceptance tests (Fable5Evaluation/2026-07-12-demo-data-spec.md A1-A5, B).
 * Runs the pure `buildDemoSeed` through the real engines  the numbers here define "done" for
 * demo-seed coherence, not eyeballing the UI.
 */
import { buildDemoSeed } from '../src/data/demoSeed';
import { DEFAULT_EXPENSE_ID } from '../src/data/categories';
import { benfordConformity, computeDataConfidence, type ConfidenceTxn } from '../src/lib/dataConfidence';
import { computeCoverage, type CoverageInput } from '../src/lib/coverage';
import { detectObligations } from '../src/lib/obligations';
import { netWorthSeries } from '../src/lib/networth';
import type { Account, BalanceEntry } from '../src/lib/types';

const NOW = new Date('2026-07-13T12:00:00.000Z');

function toConfidenceTxns(seed: ReturnType<typeof buildDemoSeed>): ConfidenceTxn[] {
  return seed.transactions.map((t) => ({
    amount: t.amount,
    source: t.source ?? 'extracted',
    merchantKey: t.merchantKey,
    date: t.date,
    type: t.type,
    merchantRaw: t.merchantRaw,
  }));
}

function toCoverageInputs(seed: ReturnType<typeof buildDemoSeed>): CoverageInput[] {
  return seed.transactions.map((t) => ({
    date: t.date,
    createdAt: t.date ? `${t.date}T12:00:00.000Z` : NOW.toISOString(),
    source: t.source ?? 'extracted',
  }));
}

describe('buildDemoSeed', () => {
  it('is deterministic: two calls at the same `now` produce identical output', () => {
    const a = buildDemoSeed(NOW);
    const b = buildDemoSeed(NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('never categorizes a transaction as the generic "Other" fallback', () => {
    const seed = buildDemoSeed(NOW);
    const other = seed.transactions.filter((t) => t.categoryId === DEFAULT_EXPENSE_ID);
    expect(other).toHaveLength(0);
  });

  it('spans at least 15 distinct expense merchants', () => {
    const seed = buildDemoSeed(NOW);
    const merchants = new Set(seed.transactions.filter((t) => t.type === 'expense').map((t) => t.merchantKey));
    expect(merchants.size).toBeGreaterThanOrEqual(15);
  });

  it('passes the product\'s own authenticity checks: Benford >= 0.80, round-amount ratio <= 5%', () => {
    const seed = buildDemoSeed(NOW);
    const amounts = seed.transactions.map((t) => t.amount);
    expect(benfordConformity(amounts)).toBeGreaterThanOrEqual(0.8);
    const roundRatio = amounts.filter((a) => a > 0 && a % 100 === 0).length / amounts.length;
    expect(roundRatio).toBeLessThanOrEqual(0.05);
  });

  it('lands 90-day coverage at 15-17 distinct days', () => {
    const seed = buildDemoSeed(NOW);
    const coverage = computeCoverage(toCoverageInputs(seed), NOW);
    expect(coverage.daysCovered).toBeGreaterThanOrEqual(15);
    expect(coverage.daysCovered).toBeLessThanOrEqual(17);
  });

  it('detects exactly 3 recurring obligations (TNB, Unifi, the motorbike installment)', () => {
    const seed = buildDemoSeed(NOW);
    const asTxns = seed.transactions.map((t, i) => ({
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
    const obligations = detectObligations(asTxns);
    expect(obligations.obligations).toHaveLength(3);
    const labels = obligations.obligations.map((o) => o.label).sort();
    expect(labels).toEqual(['Motorbike Installment', 'TNB', 'Unifi'].sort());
    const sum = obligations.obligations.reduce((s, o) => s + o.monthlyAmount, 0);
    expect(obligations.evidencedMonthlyDebtService).toBeCloseTo(sum, 5);
  });

  it('yields overall data confidence >= 0.65', () => {
    const seed = buildDemoSeed(NOW);
    const coverage = computeCoverage(toCoverageInputs(seed), NOW);
    const dc = computeDataConfidence(toConfidenceTxns(seed), coverage.ratio, 1);
    expect(dc.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('pays 4-5 uneven income amounts per full month (no two equal within a month)', () => {
    const seed = buildDemoSeed(NOW);
    const income = seed.transactions.filter((t) => t.type === 'income');
    const currentMonthKey = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;
    const byMonth = new Map<string, number[]>();
    for (const t of income) {
      const mk = (t.date ?? '').slice(0, 7);
      const arr = byMonth.get(mk) ?? [];
      arr.push(t.amount);
      byMonth.set(mk, arr);
    }
    expect(byMonth.size).toBeGreaterThan(0);
    for (const [monthKey, amounts] of byMonth) {
      // The current (possibly partial) month naturally has fewer payouts so far  every
      // completed month must land in the 4-5 range.
      if (monthKey !== currentMonthKey) {
        expect(amounts.length).toBeGreaterThanOrEqual(4);
        expect(amounts.length).toBeLessThanOrEqual(5);
      } else {
        expect(amounts.length).toBeLessThanOrEqual(5);
      }
      expect(new Set(amounts).size).toBe(amounts.length);
    }
  });

  // ── Task 2: accounts, balance history, budget ───────────────────────────────────────────

  it('seeds a Touch \'n Go asset (~RM800) and a Maybank asset (~RM2,400), each with >=4 rising monthly entries', () => {
    const seed = buildDemoSeed(NOW);
    const tng = seed.accounts.find((a) => a.name.includes("Touch 'n Go"));
    const mbb = seed.accounts.find((a) => a.name.includes('Maybank'));
    expect(tng).toBeDefined();
    expect(mbb).toBeDefined();
    for (const acc of [tng!, mbb!]) {
      expect(acc.kind).toBe('asset');
      expect(acc.entries.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < acc.entries.length; i++) {
        expect(acc.entries[i].value).toBeGreaterThanOrEqual(acc.entries[i - 1].value);
      }
    }
    expect(tng!.entries.at(-1)!.value).toBeCloseTo(800, -1);
    expect(mbb!.entries.at(-1)!.value).toBeCloseTo(2400, -1);
  });

  it('seeds the motorbike-loan liability (~RM7,200) with 6 monthly entries declining by the installment', () => {
    const seed = buildDemoSeed(NOW);
    const loan = seed.accounts.find((a) => a.name.includes('Motor Loan'));
    expect(loan).toBeDefined();
    expect(loan!.kind).toBe('liability');
    expect(loan!.entries).toHaveLength(6);
    for (let i = 1; i < loan!.entries.length; i++) {
      expect(loan!.entries[i].value).toBeLessThan(loan!.entries[i - 1].value);
    }
    expect(loan!.entries.at(-1)!.value).toBeCloseTo(7200, -1);
  });

  it('never lets month-over-month net worth swing by an RM10k+ cliff, and keeps the net-worth factor positive', () => {
    const seed = buildDemoSeed(NOW);
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
    const entries: BalanceEntry[] = seed.accounts.flatMap((a, i) =>
      a.entries.map((e, j) => ({ id: `${i}-${j}`, accountId: String(i), value: e.value, asOf: e.asOf, createdAt: e.asOf }))
    );
    const monthKeys = Array.from(new Set(seed.accounts.flatMap((a) => a.entries.map((e) => e.asOf.slice(0, 7))))).sort();
    const series = netWorthSeries(accounts, entries, monthKeys);
    for (let i = 1; i < series.length; i++) {
      expect(Math.abs(series[i].net - series[i - 1].net)).toBeLessThan(10_000);
    }
    const slope = series.length > 1 ? (series.at(-1)!.net - series[0].net) / (series.length - 1) : 0;
    const netWorthFactorSubScore = Math.max(0, Math.min(100, 50 + slope / 25));
    expect(netWorthFactorSubScore).toBeGreaterThan(0);
  });

  it('sets a budget across 4-5 categories with no category over-allocated relative to itself', () => {
    const seed = buildDemoSeed(NOW);
    const entries = Object.entries(seed.budget.allocations);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries.length).toBeLessThanOrEqual(5);
    for (const [, amount] of entries) expect(amount).toBeGreaterThan(0);
    expect(seed.budget.expectedIncome).toBeCloseTo(2595, 0);
  });
});
