import {
  BENCHMARK_LINES,
  DEFAULT_GUIDE_CITY,
  DEFAULT_HOUSEHOLD_PROFILE,
  benchmarkedCategoryIds,
  getBenchmark,
  lineForCategory,
  publishedTotal,
} from '../src/lib/belanjawanku';
import {
  BELANJAWANKU_BASKETS,
  GUIDE_CITIES,
  HOUSEHOLD_PROFILES,
  type BasketId,
  type GuideCityId,
  type HouseholdProfileId,
} from '../src/data/belanjawanku';
import { EXPENSE_CATEGORIES } from '../src/data/categories';

const ALL_BASKETS = Object.keys(BELANJAWANKU_BASKETS) as BasketId[];

describe('Belanjawanku benchmark mapping', () => {
  it('only maps onto categories that actually exist in the app', () => {
    const known = new Set(EXPENSE_CATEGORIES.map((c) => c.id));
    for (const id of benchmarkedCategoryIds()) {
      expect(known.has(id)).toBe(true);
    }
  });

  it('never maps two lines onto the same category', () => {
    const seen = benchmarkedCategoryIds();
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('spends every guide basket exactly once, so no published figure is dropped or double counted', () => {
    const used = BENCHMARK_LINES.flatMap((l) => l.baskets);
    expect(new Set(used).size).toBe(used.length);
    // Savings is deliberately not a spending line; every other basket must be covered.
    expect([...used, 'savings'].sort()).toEqual([...ALL_BASKETS].sort());
  });

  it('leaves debt-service and other unbenchmarked, since the guide publishes no counterpart', () => {
    const mapped = new Set(benchmarkedCategoryIds());
    expect(mapped.has('debt-service')).toBe(false);
    expect(mapped.has('other')).toBe(false);
  });
});

describe('getBenchmark', () => {
  it('reproduces the guide published total for all 108 city and household combinations', () => {
    let checked = 0;
    for (const city of GUIDE_CITIES) {
      for (const profile of HOUSEHOLD_PROFILES) {
        const bm = getBenchmark(profile.id, city.id);
        expect(bm.total).toBe(publishedTotal(profile.id, city.id));
        checked++;
      }
    }
    expect(checked).toBe(108);
  });

  it('carries the published Klang Valley single figures on the right lines', () => {
    const bm = getBenchmark('single-vehicle', 'klang-valley');
    const amount = (id: string): number => bm.lines.find((l) => l.id === id)?.amount ?? 0;
    expect(amount('food')).toBe(660); // Table 1
    expect(amount('home')).toBe(500); // Table 2 housing 400 + Table 4 utility 100
    expect(amount('transport')).toBe(840); // Table 3
    expect(amount('healthcare')).toBe(30); // Table 6
    expect(amount('household')).toBe(310); // Table 5 personal 90 + Table 8 ad hoc 220
    expect(amount('lifestyle')).toBe(310); // Table 9 social 180 + Table 10 discretionary 130
    expect(bm.savings).toBe(150); // Table 11
    expect(bm.total).toBe(2800); // Table 12
  });

  it('drops the childcare line for a household the guide gives no childcare figure', () => {
    const single = getBenchmark('single-vehicle', 'klang-valley');
    expect(single.lines.some((l) => l.id === 'childcare')).toBe(false);

    const family = getBenchmark('couple-2-children', 'klang-valley');
    expect(family.lines.find((l) => l.id === 'childcare')?.amount).toBe(1210);
  });

  it('carries the guide savings line: 150 single, 300 for two adults, 0 for seniors', () => {
    expect(getBenchmark('single-transit', 'ipoh').savings).toBe(150);
    expect(getBenchmark('couple-2-children', 'ipoh').savings).toBe(300);
    expect(getBenchmark('senior-single', 'ipoh').savings).toBe(0);
  });

  it('prices the same household differently across cities', () => {
    const kv = getBenchmark('single-vehicle', 'klang-valley');
    const alorSetar = getBenchmark('single-vehicle', 'alor-setar');
    expect(kv.total).toBeGreaterThan(alorSetar.total);
    expect(kv.cityLabel).toBe('Klang Valley');
    expect(alorSetar.cityLabel).toBe('Alor Setar');
  });

  it('falls back to the defaults for an unknown or missing profile and city', () => {
    const fallback = getBenchmark(
      'not-a-profile' as HouseholdProfileId,
      'not-a-city' as GuideCityId
    );
    const expected = getBenchmark(DEFAULT_HOUSEHOLD_PROFILE, DEFAULT_GUIDE_CITY);
    expect(fallback).toEqual(expected);
    expect(getBenchmark(undefined, undefined)).toEqual(expected);
  });

  it('always cites its source', () => {
    expect(getBenchmark('single-vehicle', 'klang-valley').source).toContain('Belanjawanku');
  });
});

describe('lineForCategory', () => {
  const bm = getBenchmark('single-vehicle', 'klang-valley');

  it('resolves both halves of a combined line to the same benchmark', () => {
    expect(lineForCategory(bm, 'food')?.id).toBe('food');
    expect(lineForCategory(bm, 'dining')?.id).toBe('food');
    expect(lineForCategory(bm, 'housing')?.id).toBe('home');
    expect(lineForCategory(bm, 'communications')?.id).toBe('home');
  });

  it('returns null for a category the guide has no opinion on', () => {
    expect(lineForCategory(bm, 'debt-service')).toBeNull();
    expect(lineForCategory(bm, 'other')).toBeNull();
  });

  it('returns null for a line dropped as zero for this household', () => {
    expect(lineForCategory(bm, 'education')).toBeNull();
    expect(lineForCategory(getBenchmark('couple-2-children', 'klang-valley'), 'education')?.id).toBe(
      'childcare'
    );
  });
});
