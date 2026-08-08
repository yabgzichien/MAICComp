/**
 * Demo-persona acceptance for the Belanjawanku budgeting method.
 *
 * These run the REAL engines over the committed demo seeds, so the beats a judge is shown cannot
 * silently go flat: if a seed retune ever leaves Aina with nothing actionable against the guide,
 * or makes Faizal's income read as steady, these fail rather than the demo quietly losing a step.
 */
import { buildAinaSeed, buildFaizalSeed, buildRaviSeed } from '../src/data/demoSeed';
import { getBenchmark } from '../src/lib/belanjawanku';
import { benchmarkGaps, buildBelanjawankuBudget } from '../src/lib/belanjawankuBudget';
import { surplusSourceHint } from '../src/lib/coachPlan';
import { computeIncomeBaseline } from '../src/lib/incomeBaseline';
import { computeSavingsHabit, DEFAULT_SAVINGS_TARGET } from '../src/lib/savingsHabit';
import { averageMonthlySpend } from '../src/lib/budget';
import { EXPENSE_CATEGORIES } from '../src/data/categories';
import { GLOSSARY } from '../src/lib/glossary';
import type { Transaction } from '../src/lib/types';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const KV_SINGLE = getBenchmark('single-vehicle', 'klang-valley');

function txnsOf(seed: ReturnType<typeof buildAinaSeed>): Transaction[] {
  return seed.transactions.map((t, i) => ({
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
}

const aina = txnsOf(buildAinaSeed(NOW));
const ravi = txnsOf(buildRaviSeed(NOW));
const faizal = txnsOf(buildFaizalSeed(NOW));

const avgOf = (t: Transaction[]) => averageMonthlySpend(t, NOW, 3);

describe('Aina, the gig-worker persona', () => {
  const gaps = benchmarkGaps(KV_SINGLE, avgOf(aina));

  it('has a real, actionable gap against the guide, so the coach hint is never empty on the demo path', () => {
    const flexible = gaps.filter((g) => g.kind === 'flexible');
    expect(flexible.length).toBeGreaterThan(0);
    expect(flexible[0].overBy).toBeGreaterThan(0);
  });

  it('produces a coach hint naming that category and citing the guide', () => {
    const hint = surplusSourceHint(gaps, 200);
    expect(hint).toBeDefined();
    expect(hint).toContain(gaps.filter((g) => g.kind === 'flexible')[0].label);
    expect(hint).toContain('Belanjawanku');
  });

  it('never points her at an essential, even though her healthcare is the largest gap', () => {
    // Her seed genuinely spends well above the guide's minimal healthcare basket. That must show
    // up in the informational comparison but must never become "spend less on healthcare".
    expect(gaps[0].kind).toBe('essential');
    expect(surplusSourceHint(gaps, 200)).not.toContain(gaps[0].label);
  });

  it('builds a budget from the guide that fits her income without flagging a false shortfall', () => {
    const income = computeIncomeBaseline(aina, NOW).average;
    const t = buildBelanjawankuBudget({
      income,
      benchmark: KV_SINGLE,
      actualByCategory: avgOf(aina),
      categoryIds: EXPENSE_CATEGORIES.map((c) => c.id),
    });
    expect(t.belowGuideIncome).toBe(false);
    expect(t.savings).toBeGreaterThan(0);
    expect(Object.values(t.allocations).reduce((s, v) => s + v, 0) + t.savings).toBeLessThanOrEqual(
      Math.floor(income)
    );
  });

  it('shows the savings habit with a real best run on record', () => {
    const habit = computeSavingsHabit(aina, DEFAULT_SAVINGS_TARGET, NOW);
    expect(habit.monthsObserved).toBeGreaterThanOrEqual(3);
    expect(habit.bestRun).toBeGreaterThan(0);
  });
});

describe('Faizal, the volatile-income persona', () => {
  it('reads as irregular, so the safe-income chip has something to demonstrate', () => {
    const b = computeIncomeBaseline(faizal, NOW);
    expect(b.irregular).toBe(true);
    expect(b.baseline).toBeLessThan(b.average);
    expect(b.high).toBeGreaterThan(b.low);
  });
});

describe('Ravi, the steady-income persona', () => {
  it('does not read as irregular, so the chip stays off for a borrower who does not need it', () => {
    expect(computeIncomeBaseline(ravi, NOW).irregular).toBe(false);
  });

  it('keeps a long pay-yourself-first run, the healthy contrast to Aina', () => {
    expect(computeSavingsHabit(ravi, DEFAULT_SAVINGS_TARGET, NOW).monthsKept).toBeGreaterThanOrEqual(3);
  });
});

describe('judge-facing explanation', () => {
  it('can cite what Belanjawanku is and who publishes it', () => {
    expect(GLOSSARY.belanjawanku.body).toContain('Universiti Malaya');
    expect(GLOSSARY.belanjawanku.body).toContain('EPF');
  });

  it('states plainly that the safe income figure is not used for credit', () => {
    expect(GLOSSARY.safe_income.body).toContain('budgeting figure only');
  });
});
