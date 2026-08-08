// __tests__/categoryIntegrity.test.ts
// Guards the COICOP-aligned default category set (bookkeeping retune, 2026-08-07) against
// the failure mode that motivated it: ids drifting out of sync with the code that names
// them. Before the retune, spendingProfile.ts named four essential ids ('rent', 'utilities',
// 'education', 'childcare') that no seeded category carried, so those clauses silently
// matched nothing for as long as they existed. Every check here is a pure string/shape
// assertion  no DB, no RN imports.
import fs from 'fs';
import path from 'path';
import {
  ALL_SEED_CATEGORIES,
  CATEGORY_ID_REMAP,
  DEFAULT_EXPENSE_ID,
  DEFAULT_INCOME_ID,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '../src/data/categories';
import { buildAinaSeed, buildFaizalSeed, buildRaviSeed, type DemoSeed } from '../src/data/demoSeed';
import { matchSourceCategory } from '../src/lib/import';
import { buildDemoKit } from '../tools/demoKit/build';
import type { Category } from '../src/lib/types';

const NOW = new Date('2026-08-07T12:00:00.000Z');

const byId = new Map(ALL_SEED_CATEGORIES.map((c) => [c.id, c]));
const expenseIds = new Set(EXPENSE_CATEGORIES.map((c) => c.id));
const incomeIds = new Set(INCOME_CATEGORIES.map((c) => c.id));

/** The seed rows as full Category objects, for the libs that take a category list. */
const asCategories: Category[] = ALL_SEED_CATEGORIES.map((c) => ({ ...c, isDefault: true }));

const PROFILES: [string, (now: Date) => DemoSeed][] = [
  ['Aina', buildAinaSeed],
  ['Ravi', buildRaviSeed],
  ['Faizal', buildFaizalSeed],
];

describe('default category set', () => {
  it('has 12 expense + 6 income categories with unique ids and no blank fields', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(12);
    expect(INCOME_CATEGORIES).toHaveLength(6);
    expect(new Set(ALL_SEED_CATEGORIES.map((c) => c.id)).size).toBe(ALL_SEED_CATEGORIES.length);
    for (const c of ALL_SEED_CATEGORIES) {
      expect(c.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(c.icon.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.hue)).toBe(true);
    }
  });

  it('the two protected fallbacks exist and carry the right kind', () => {
    expect(byId.get(DEFAULT_EXPENSE_ID)?.kind).toBe('expense');
    expect(byId.get(DEFAULT_INCOME_ID)?.kind).toBe('income');
  });

  it('every seeded icon is a glyph Icon.tsx actually renders', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/components/Icon.tsx'), 'utf8');
    // `dots` takes only the stroke colour, so the arg list is not fixed  match on the
    // `  name: (` shape of an entry in the ICONS record instead.
    const rendered = new Set([...src.matchAll(/^ {2}([a-zA-Z]+): \(s(?:, w)?\) => \(/gm)].map((m) => m[1]));
    expect(rendered.size).toBeGreaterThan(20);
    for (const c of ALL_SEED_CATEGORIES) expect(rendered.has(c.icon)).toBe(true);
  });
});

describe('CATEGORY_ID_REMAP (retired ids)', () => {
  it('points every retired id at a real replacement of a plausible kind', () => {
    for (const [oldId, newId] of Object.entries(CATEGORY_ID_REMAP)) {
      expect(byId.has(newId)).toBe(true);
      // A retired id must not still be a live default, or the migration would delete
      // the very row it just remapped everything onto.
      expect(byId.has(oldId)).toBe(false);
    }
  });

  it('covers every id the old default set used', () => {
    const retired = [
      'fuel', 'groceries', 'coffee', 'shopping', 'health', 'bills', 'fun',
      'income', 'allowance', 'bonus', 'borrowers-return', 'dividend', 'interest',
    ];
    for (const id of retired) expect(CATEGORY_ID_REMAP[id]).toBeDefined();
  });
});

describe('demo seeds reference only real categories', () => {
  for (const [name, build] of PROFILES) {
    it(`${name}: every transaction lands on a seeded category of the matching kind`, () => {
      const seed = build(NOW);
      expect(seed.transactions.length).toBeGreaterThan(0);
      for (const t of seed.transactions) {
        const cat = byId.get(t.categoryId ?? '');
        expect(cat).toBeDefined();
        expect(cat!.kind).toBe(t.type);
      }
    });

    it(`${name}: every budget envelope is a seeded EXPENSE category`, () => {
      const seed = build(NOW);
      for (const id of Object.keys(seed.budget.allocations)) {
        expect(expenseIds.has(id)).toBe(true);
        expect(incomeIds.has(id)).toBe(false);
      }
    });
  }

  it('the personas still avoid the residual buckets  every row is meaningfully filed', () => {
    for (const [, build] of PROFILES) {
      for (const t of build(NOW).transactions) {
        expect(t.categoryId).not.toBe(DEFAULT_EXPENSE_ID);
        expect(t.categoryId).not.toBe(DEFAULT_INCOME_ID);
      }
    }
  });
});

describe('demo kit screenshot hints', () => {
  it('every printed category label still fuzzy-matches back to a real category', () => {
    // The kit prints `category` onto the synthetic screenshot; extraction reads it back as
    // a categoryHint, which matchSourceCategory has to resolve. A hint naming a retired
    // category (the old 'bills' / 'income' labels) would silently fall through to Other.
    for (const kit of buildDemoKit(NOW)) {
      for (const row of kit.rows) {
        const matched = matchSourceCategory(row.category, asCategories, row.type);
        expect(matched).not.toBeNull();
        expect(byId.get(matched!)?.kind).toBe(row.type);
      }
    }
  });
});
