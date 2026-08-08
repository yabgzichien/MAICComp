import { getBenchmark } from '../src/lib/belanjawanku';
import {
  benchmarkGaps,
  buildBelanjawankuBudget,
  gapTrend,
  type BenchmarkGap,
  type BudgetTemplateInput,
} from '../src/lib/belanjawankuBudget';
import { allocatedTotal } from '../src/lib/budget';
import { EXPENSE_CATEGORIES } from '../src/data/categories';

const ALL_CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id);
const KV_SINGLE = getBenchmark('single-vehicle', 'klang-valley'); // total 2800, savings 150

function build(over: Partial<BudgetTemplateInput> = {}) {
  return buildBelanjawankuBudget({
    income: 3500,
    benchmark: KV_SINGLE,
    actualByCategory: {},
    categoryIds: ALL_CATEGORY_IDS,
    ...over,
  });
}

describe('buildBelanjawankuBudget', () => {
  it('never allocates more than the income, savings included', () => {
    for (const income of [0, 400, 1200, 2650, 2800, 3500, 9000]) {
      const t = build({ income });
      expect(allocatedTotal(t.allocations) + t.savings).toBeLessThanOrEqual(income);
      expect(t.unallocated).toBeGreaterThanOrEqual(0);
    }
  });

  it('reproduces the guide budget exactly when income comfortably covers it', () => {
    const t = build({ income: 3500 });
    expect(t.belowGuideIncome).toBe(false);
    expect(t.savings).toBe(150);
    expect(allocatedTotal(t.allocations)).toBe(2650); // the guide total minus its savings line
    expect(t.unallocated).toBe(3500 - 2800);
  });

  it('funds essentials at the guide figure before anything discretionary', () => {
    const t = build({ income: 2400 }); // 400 short of the full guide budget
    const byLine = new Map(t.lines.map((l) => [l.id, l]));
    expect(byLine.get('food')?.amount).toBe(660);
    expect(byLine.get('home')?.amount).toBe(500);
    expect(byLine.get('transport')?.amount).toBe(840);
    expect(byLine.get('healthcare')?.amount).toBe(30);
    // Savings still funded in full; the squeeze lands on the flexible lines.
    expect(t.savings).toBe(150);
    expect((byLine.get('household')?.amount ?? 0) + (byLine.get('lifestyle')?.amount ?? 0)).toBe(220);
    expect(t.belowGuideIncome).toBe(false);
  });

  it('pays savings before discretionary, not after', () => {
    // Exactly enough for essentials plus savings and nothing else.
    const t = build({ income: 2030 + 150 });
    expect(t.savings).toBe(150);
    expect(t.lines.filter((l) => l.id === 'household' || l.id === 'lifestyle')).toEqual([]);
  });

  it('flags an income below the guide essentials instead of pretending it balances', () => {
    const t = build({ income: 1500 });
    expect(t.belowGuideIncome).toBe(true);
    expect(t.shortfall).toBe(2030 - 1500); // guide essentials for this household total 2030
    expect(t.savings).toBe(0); // nothing left to save once essentials are already short
    expect(allocatedTotal(t.allocations)).toBeLessThanOrEqual(1500);
  });

  it('scales essentials proportionally when income cannot reach them', () => {
    const t = build({ income: 1015 }); // exactly half the guide essentials
    const byLine = new Map(t.lines.map((l) => [l.id, l]));
    expect(byLine.get('food')?.amount).toBe(330); // half of 660
    expect(byLine.get('transport')?.amount).toBe(420); // half of 840
    expect(t.belowGuideIncome).toBe(true);
  });

  it('funds a committed obligation the guide does not model, ahead of everything else', () => {
    const t = build({
      income: 1200,
      actualByCategory: { 'debt-service': 300 },
      categoryLabels: { 'debt-service': 'Loan Repayment' },
    });
    expect(t.allocations['debt-service']).toBe(300);
    expect(t.lines[0]).toMatchObject({ id: 'debt-service', label: 'Loan Repayment', guideAmount: null });
    expect(t.belowGuideIncome).toBe(true);
    expect(t.shortfall).toBe(2030 - 900); // essentials measured against income net of the obligation
  });

  it('splits a combined line across its categories by what the borrower actually spends', () => {
    const t = build({
      income: 3500,
      actualByCategory: { food: 300, dining: 100 }, // 3:1
    });
    expect(t.allocations.food).toBe(495); // 660 * 0.75
    expect(t.allocations.dining).toBe(165);
    expect(t.allocations.food + t.allocations.dining).toBe(660);
  });

  it('puts a combined line on its primary category when there is no spending to split on', () => {
    const t = build({ income: 3500, actualByCategory: {} });
    expect(t.allocations.food).toBe(660);
    expect(t.allocations.dining).toBeUndefined();
    expect(t.allocations.housing).toBe(500);
    expect(t.allocations.communications).toBeUndefined();
  });

  it('honours an explicit savings target over the guide figure', () => {
    expect(build({ income: 3500, savingsTarget: 50 }).savings).toBe(50);
    expect(build({ income: 3500, savingsTarget: 400 }).savings).toBe(400);
    // A target beyond what is left after essentials is capped, never negative.
    expect(build({ income: 2100, savingsTarget: 900 }).savings).toBe(2100 - 2030);
  });

  it('allocates a childcare line only for a household the guide gives one', () => {
    const family = build({
      income: 9000,
      benchmark: getBenchmark('couple-2-children', 'klang-valley'),
    });
    expect(family.allocations.education).toBe(1210);
    expect(build({ income: 9000 }).allocations.education).toBeUndefined();
  });

  it('skips categories this borrower does not have', () => {
    const t = build({ income: 3500, categoryIds: ['food', 'housing', 'transport'] });
    expect(Object.keys(t.allocations).sort()).toEqual(['food', 'housing', 'transport']);
  });

  it('is deterministic', () => {
    const input = { income: 2345, actualByCategory: { food: 210, dining: 90, 'debt-service': 180 } };
    expect(build(input)).toEqual(build(input));
  });

  it('produces nothing at all on zero income rather than a negative budget', () => {
    const t = build({ income: 0 });
    expect(t.allocations).toEqual({});
    expect(t.savings).toBe(0);
    expect(t.unallocated).toBe(0);
    expect(t.belowGuideIncome).toBe(true);
  });
});

describe('benchmarkGaps', () => {
  it('returns only lines the borrower is over the guide on, largest gap first', () => {
    const gaps = benchmarkGaps(KV_SINGLE, {
      food: 700,
      dining: 300, // 1000 vs a 660 guide, over by 340
      transport: 900, // vs 840, over by 60
      housing: 300,
      communications: 80, // 380 vs 500, under
      healthcare: 10, // under
    });
    expect(gaps.map((g) => g.lineId)).toEqual(['food', 'transport']);
    expect(gaps[0]).toMatchObject({
      label: 'Food & Dining',
      guideAmount: 660,
      actualAmount: 1000,
      overBy: 340,
    });
    expect(gaps[1].overBy).toBe(60);
  });

  it('is empty when the borrower is within the guide everywhere', () => {
    expect(benchmarkGaps(KV_SINGLE, { food: 500, transport: 400 })).toEqual([]);
    expect(benchmarkGaps(KV_SINGLE, {})).toEqual([]);
  });

  it('never reports a category the guide has no figure for', () => {
    const gaps = benchmarkGaps(KV_SINGLE, { 'debt-service': 5000, other: 5000, education: 5000 });
    expect(gaps).toEqual([]);
  });

  it('tags each gap as essential or flexible, so advice can skip the ones that are minimums', () => {
    const gaps = benchmarkGaps(KV_SINGLE, { healthcare: 400, recreation: 900 });
    expect(gaps.find((g) => g.lineId === 'healthcare')?.kind).toBe('essential');
    expect(gaps.find((g) => g.lineId === 'lifestyle')?.kind).toBe('flexible');
  });

  it('compares a combined line against the sum of its categories, not either half', () => {
    // Neither half alone exceeds 660, but together they do.
    const gaps = benchmarkGaps(KV_SINGLE, { food: 400, dining: 400 });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ lineId: 'food', actualAmount: 800, overBy: 140 });
  });
});

describe('gapTrend', () => {
  const gap = (overBy: number): BenchmarkGap => ({
    lineId: 'lifestyle',
    label: 'Recreation & Social',
    kind: 'flexible',
    categoryIds: ['recreation'],
    guideAmount: 310,
    actualAmount: 310 + overBy,
    overBy,
  });

  it('reports a first-time gap as new', () => {
    expect(gapTrend(gap(200), undefined)).toBe('new');
  });

  it('reports a standing gap as unchanged so the same warning is not repeated verbatim', () => {
    expect(gapTrend(gap(200), gap(200))).toBe('unchanged');
    expect(gapTrend(gap(200), gap(215))).toBe('unchanged'); // within the noise band
  });

  it('distinguishes a shrinking gap from a growing one', () => {
    expect(gapTrend(gap(100), gap(300))).toBe('improving');
    expect(gapTrend(gap(300), gap(100))).toBe('worsening');
  });
});
