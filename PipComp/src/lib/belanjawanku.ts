// src/lib/belanjawanku.ts
// Maps the Belanjawanku reference budget onto this app's own expense categories, and looks up
// the benchmark for a given household profile and city. Pure, unit-tested, no UI or DB imports.
//
// WHY A BENCHMARK AT ALL. The borrower app's users are credit-invisible micro-entrepreneurs.
// Telling one of them "you spend too much on food" is only defensible if the comparison points
// at something published and neutral. Belanjawanku is Malaysia's official reference budget
// (Universiti Malaya's Social Wellbeing Research Centre with the EPF), so every hint this app
// shows can name its source instead of asserting a number the app made up.
//
// THE MAPPING IS EDITORIAL, AND LOSSY IN BOTH DIRECTIONS. The guide's eleven baskets were built
// for a cost-of-living study, not for bookkeeping, so they do not line up one-to-one with the
// COICOP divisions `src/data/categories.ts` uses. Rather than split a published figure into
// invented parts, a benchmark LINE covers a SET of this app's categories and is compared against
// the sum of that set. The compromises, each deliberate:
//
//   - The guide's Food basket is groceries AND eating out in one figure, so the Food line spans
//     both `food` and `dining`.
//   - The guide's Utility basket is water and electricity AND phone/internet in one figure, so
//     it is folded in with Housing to cover `housing` (COICOP 04) plus `communications` (08).
//   - The guide's Ad hoc basket mixes road tax and insurance with clothing and furniture, so it
//     rides with Personal Care over `household` plus `insurance`.
//   - The guide's Childcare basket is daycare, tuition and religious classes, closest to
//     `education`.
//
// TWO CATEGORIES HAVE NO BENCHMARK, ON PURPOSE. `debt-service` has none because the guide books
// loan repayment inside Housing and Transportation rather than as its own line, and `other` is a
// residual bucket with no published counterpart. Callers must treat an unbenchmarked category as
// "no opinion" and never report it as under or over the guide.
import {
  BELANJAWANKU_BASKETS,
  BELANJAWANKU_PUBLISHED_TOTALS,
  GUIDE_CITIES,
  GUIDE_SOURCE,
  HOUSEHOLD_PROFILES,
  profileIndex,
  type BasketId,
  type GuideCityId,
  type HouseholdProfileId,
} from '../data/belanjawanku';

export type BenchmarkLineId =
  | 'food'
  | 'home'
  | 'transport'
  | 'healthcare'
  | 'childcare'
  | 'household'
  | 'lifestyle';

/**
 * `essential` lines are floored at the guide figure when income allows: the guide calls these
 * the cost of a decent standard of living, so squeezing them is not a budgeting win. `flexible`
 * lines are the ones a borrower can genuinely trade against savings.
 */
export type BenchmarkLineKind = 'essential' | 'flexible';

export interface BenchmarkLineSpec {
  id: BenchmarkLineId;
  label: string;
  /** Categories from `src/data/categories.ts` this line is compared against, summed. */
  categoryIds: string[];
  /** Guide baskets that make up this line's figure. */
  baskets: BasketId[];
  kind: BenchmarkLineKind;
}

export interface BenchmarkLine extends BenchmarkLineSpec {
  /** Monthly ringgit the guide allocates for this line, for the chosen profile and city. */
  amount: number;
}

export interface Benchmark {
  profile: HouseholdProfileId;
  city: GuideCityId;
  profileLabel: string;
  cityLabel: string;
  /** Spending lines with a non-zero guide figure, essentials first. */
  lines: BenchmarkLine[];
  /** The guide's own recommended monthly savings, kept out of `lines` since it is not spending. */
  savings: number;
  /** Lines plus savings. Equals the total the guide publishes for this profile and city. */
  total: number;
  /** Citation to show wherever a figure from this benchmark appears. */
  source: string;
}

/** The editorial mapping described in the file header. Every guide basket appears exactly once. */
export const BENCHMARK_LINES: BenchmarkLineSpec[] = [
  {
    id: 'food',
    label: 'Food & Dining',
    categoryIds: ['food', 'dining'],
    baskets: ['food'],
    kind: 'essential',
  },
  {
    id: 'home',
    label: 'Home & Bills',
    categoryIds: ['housing', 'communications'],
    baskets: ['housing', 'utility'],
    kind: 'essential',
  },
  {
    id: 'transport',
    label: 'Transport & Fuel',
    categoryIds: ['transport'],
    baskets: ['transport'],
    kind: 'essential',
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    categoryIds: ['healthcare'],
    baskets: ['healthcare'],
    kind: 'essential',
  },
  {
    id: 'childcare',
    label: 'Childcare & Education',
    categoryIds: ['education'],
    baskets: ['childcare'],
    kind: 'essential',
  },
  {
    id: 'household',
    label: 'Household & Personal',
    categoryIds: ['household', 'insurance'],
    baskets: ['personal', 'adhoc'],
    kind: 'flexible',
  },
  {
    id: 'lifestyle',
    label: 'Recreation & Social',
    categoryIds: ['recreation'],
    baskets: ['social', 'discretionary'],
    kind: 'flexible',
  },
];

/**
 * Defaults for a borrower who has not picked yet. `single-vehicle` rather than the cheaper
 * `single-transit` because the guide's public-transport column assumes no vehicle at all, which
 * badly under-benchmarks the motorbike-owning gig workers this app is built for; Klang Valley
 * because it is where that segment concentrates. Both are two taps to change.
 */
export const DEFAULT_HOUSEHOLD_PROFILE: HouseholdProfileId = 'single-vehicle';
export const DEFAULT_GUIDE_CITY: GuideCityId = 'klang-valley';

function knownProfile(profile: HouseholdProfileId | undefined): HouseholdProfileId {
  return HOUSEHOLD_PROFILES.some((p) => p.id === profile)
    ? (profile as HouseholdProfileId)
    : DEFAULT_HOUSEHOLD_PROFILE;
}

function knownCity(city: GuideCityId | undefined): GuideCityId {
  return GUIDE_CITIES.some((c) => c.id === city) ? (city as GuideCityId) : DEFAULT_GUIDE_CITY;
}

/**
 * The published monthly figures for one household profile in one city. An unrecognised profile
 * or city falls back to the defaults rather than throwing, so a stale saved preference can never
 * break the Budget screen.
 */
export function getBenchmark(
  profile: HouseholdProfileId | undefined,
  city: GuideCityId | undefined
): Benchmark {
  const p = knownProfile(profile);
  const c = knownCity(city);
  const col = profileIndex(p);
  const basket = (id: BasketId): number => BELANJAWANKU_BASKETS[id][c][col] ?? 0;

  const lines: BenchmarkLine[] = BENCHMARK_LINES.map((spec) => ({
    ...spec,
    amount: spec.baskets.reduce((sum, b) => sum + basket(b), 0),
  })).filter((line) => line.amount > 0);

  const savings = basket('savings');
  return {
    profile: p,
    city: c,
    profileLabel: HOUSEHOLD_PROFILES.find((x) => x.id === p)?.label ?? p,
    cityLabel: GUIDE_CITIES.find((x) => x.id === c)?.label ?? c,
    lines,
    savings,
    total: lines.reduce((s, l) => s + l.amount, 0) + savings,
    source: GUIDE_SOURCE,
  };
}

/** The guide's own published total for a profile and city, used to check the mapping stays whole. */
export function publishedTotal(
  profile: HouseholdProfileId | undefined,
  city: GuideCityId | undefined
): number {
  return BELANJAWANKU_PUBLISHED_TOTALS[knownCity(city)][profileIndex(knownProfile(profile))] ?? 0;
}

/** The benchmark line covering a category, or null when that category has no published figure. */
export function lineForCategory(benchmark: Benchmark, categoryId: string): BenchmarkLine | null {
  return benchmark.lines.find((l) => l.categoryIds.includes(categoryId)) ?? null;
}

/** Every category id any benchmark line covers. */
export function benchmarkedCategoryIds(): string[] {
  return BENCHMARK_LINES.flatMap((l) => l.categoryIds);
}
