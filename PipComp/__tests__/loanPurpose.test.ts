/**
 * TDD: src/lib/loanPurpose.ts  borrower-side declared loan purpose (spec 2026-07-07 +
 * the direct-apply-transport spec, 2026-07-11, which finally captures it on this side).
 * Mirrors LenderConsole/lib/applications.ts's PurposeCategory values exactly  context
 * for the lender only, never a scoring input, so the cap and category list are the
 * only rules that matter here.
 */
import { capNote, PURPOSE_CATEGORIES, PURPOSE_LABELS, type PurposeCategory } from '../src/lib/loanPurpose';

describe('PURPOSE_CATEGORIES', () => {
  it('mirrors the console\'s fixed category list exactly, always including "other"', () => {
    expect(PURPOSE_CATEGORIES).toEqual(['stock', 'equipment', 'working-capital', 'emergency', 'education', 'other']);
  });

  it('every category has a display label', () => {
    for (const c of PURPOSE_CATEGORIES) {
      expect(PURPOSE_LABELS[c].length).toBeGreaterThan(0);
    }
  });
});

describe('capNote', () => {
  it('trims whitespace', () => {
    expect(capNote('  Raya stock-up  ')).toBe('Raya stock-up');
  });

  it('caps at 140 characters, matching the console\'s note field', () => {
    const long = 'x'.repeat(200);
    expect(capNote(long)?.length).toBe(140);
  });

  it('returns undefined for an empty or whitespace-only note  purpose is always optional', () => {
    expect(capNote('')).toBeUndefined();
    expect(capNote('   ')).toBeUndefined();
    expect(capNote(undefined)).toBeUndefined();
  });
});

describe('PurposeCategory type usage', () => {
  it('a category value can be assigned to the exported type (compile-time check)', () => {
    const c: PurposeCategory = 'stock';
    expect(PURPOSE_CATEGORIES).toContain(c);
  });
});
