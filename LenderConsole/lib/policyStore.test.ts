// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Policy validation (Brief N) — field-by-field, so a malformed PUT is rejected with an
// actionable message per field, never a blanket 400; and the read/write file round-trip
// (policyFile.ts), which is what GET /api/lenders and the Policy tab both depend on.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULT_POLICY, DEFAULT_PRODUCTS } from './loans';
import { aprWarnings, APR_WARN_THRESHOLD, CANONICAL_TIER_IDS, DEFAULT_STORED_POLICY, validateStoredPolicy, type StoredPolicy } from './policyStore';
import { readStoredPolicy, writeStoredPolicy } from './policyFile';

const good = (): StoredPolicy => ({
  policy: { ...DEFAULT_POLICY },
  products: DEFAULT_PRODUCTS.map((p) => ({ ...p })),
});

const errorsOf = (raw: unknown): string[] => {
  const v = validateStoredPolicy(raw);
  return v.ok ? [] : v.errors;
};

describe('validateStoredPolicy', () => {
  it('accepts the default policy + ladder unchanged', () => {
    const v = validateStoredPolicy(good());
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.policy).toEqual(DEFAULT_POLICY);
      expect(v.value.products).toEqual(DEFAULT_PRODUCTS);
    }
  });

  it('rejects non-objects, arrays, and null', () => {
    expect(errorsOf(null).join(' ')).toMatch(/object/i);
    expect(errorsOf('nope').join(' ')).toMatch(/object/i);
    expect(errorsOf([]).join(' ')).toMatch(/object/i);
  });

  it('rejects a missing policy block by name', () => {
    expect(errorsOf({ products: DEFAULT_PRODUCTS }).join(' ')).toMatch(/policy/);
  });

  it('rejects a missing products array by name', () => {
    expect(errorsOf({ policy: DEFAULT_POLICY }).join(' ')).toMatch(/products/);
  });

  describe('threshold ratio fields (must be >0 and <=1)', () => {
    it.each(['minConfidenceToApprove', 'maxInstallmentShareOfSurplus', 'maxDsr', 'minCoverageRatioForFullLadder', 'costOfFunds', 'targetReturn'])(
      'rejects %s at 0, negative, or above 1',
      (field) => {
        const zero = errorsOf({ ...good(), policy: { ...DEFAULT_POLICY, [field]: 0 } });
        const negative = errorsOf({ ...good(), policy: { ...DEFAULT_POLICY, [field]: -0.1 } });
        const tooBig = errorsOf({ ...good(), policy: { ...DEFAULT_POLICY, [field]: 1.5 } });
        expect(zero.some((e) => e.includes(field))).toBe(true);
        expect(negative.some((e) => e.includes(field))).toBe(true);
        expect(tooBig.some((e) => e.includes(field))).toBe(true);
      },
    );

    it('accepts exactly 1 (the inclusive upper bound)', () => {
      const v = validateStoredPolicy({ ...good(), policy: { ...DEFAULT_POLICY, maxDsr: 1 } });
      expect(v.ok).toBe(true);
    });
  });

  describe('coverage-gate day fields (whole numbers 0..90)', () => {
    it.each(['emergencyOnlyBelowDays', 'fullLadderFromDays'])('rejects %s that is negative, non-integer, or beyond the 90-day window', (field) => {
      expect(errorsOf({ ...good(), policy: { ...DEFAULT_POLICY, [field]: -1 } }).some((e) => e.includes(field))).toBe(true);
      expect(errorsOf({ ...good(), policy: { ...DEFAULT_POLICY, [field]: 45.5 } }).some((e) => e.includes(field))).toBe(true);
      expect(errorsOf({ ...good(), policy: { ...DEFAULT_POLICY, [field]: 91 } }).some((e) => e.includes(field))).toBe(true);
    });

    it('rejects emergencyOnlyBelowDays exceeding fullLadderFromDays — the gates would invert', () => {
      const errs = errorsOf({ ...good(), policy: { ...DEFAULT_POLICY, emergencyOnlyBelowDays: 90, fullLadderFromDays: 30 } });
      expect(errs.some((e) => /invert/.test(e))).toBe(true);
    });

    it('accepts equal emergencyOnlyBelowDays and fullLadderFromDays', () => {
      const v = validateStoredPolicy({ ...good(), policy: { ...DEFAULT_POLICY, emergencyOnlyBelowDays: 30, fullLadderFromDays: 30 } });
      expect(v.ok).toBe(true);
    });
  });

  describe('product ladder', () => {
    it('rejects a non-array or empty products list', () => {
      expect(errorsOf({ ...good(), products: 'nope' }).join(' ')).toMatch(/products.*array/i);
      expect(errorsOf({ ...good(), products: [] }).join(' ')).toMatch(/at least one tier/i);
    });

    it('rejects a product id outside the four canonical tier slots', () => {
      const errs = errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], id: 'custom-tier' }] });
      expect(errs.some((e) => e.includes('.id') && CANONICAL_TIER_IDS.every((id) => e.includes(id)))).toBe(true);
    });

    it('rejects duplicate tier ids in the same ladder', () => {
      const errs = errorsOf({ ...good(), products: [DEFAULT_PRODUCTS[0], { ...DEFAULT_PRODUCTS[0] }] });
      expect(errs.some((e) => /duplicate tier/.test(e))).toBe(true);
    });

    it('rejects duplicate tier labels even when ids differ — decidePriced/repriceProducts match tiers by label', () => {
      const errs = errorsOf({
        ...good(),
        products: [DEFAULT_PRODUCTS[0], { ...DEFAULT_PRODUCTS[1], label: DEFAULT_PRODUCTS[0].label }],
      });
      expect(errs.some((e) => e.includes('.label') && /duplicate label/.test(e))).toBe(true);
    });

    it('rejects a missing or blank label', () => {
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], label: '' }] }).some((e) => e.includes('.label'))).toBe(true);
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], label: '   ' }] }).some((e) => e.includes('.label'))).toBe(true);
    });

    it('rejects minScore outside 300..900', () => {
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], minScore: 250 }] }).some((e) => e.includes('.minScore'))).toBe(true);
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], minScore: 950 }] }).some((e) => e.includes('.minScore'))).toBe(true);
    });

    it('rejects non-positive minAmount/maxAmount', () => {
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], minAmount: 0 }] }).some((e) => e.includes('.minAmount'))).toBe(true);
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], maxAmount: -5 }] }).some((e) => e.includes('.maxAmount'))).toBe(true);
    });

    it('rejects minAmount exceeding maxAmount', () => {
      const errs = errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], minAmount: 5000, maxAmount: 1000 }] });
      expect(errs.some((e) => /exceeds maxAmount/.test(e))).toBe(true);
    });

    it('rejects a non-positive or non-integer tenorMonths', () => {
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], tenorMonths: 0 }] }).some((e) => e.includes('.tenorMonths'))).toBe(true);
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], tenorMonths: 6.5 }] }).some((e) => e.includes('.tenorMonths'))).toBe(true);
    });

    it('rejects apr outside 0..1', () => {
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], apr: -0.1 }] }).some((e) => e.includes('.apr'))).toBe(true);
      expect(errorsOf({ ...good(), products: [{ ...DEFAULT_PRODUCTS[0], apr: 1.2 }] }).some((e) => e.includes('.apr'))).toBe(true);
    });

    it('reports errors for every malformed row, not just the first', () => {
      const errs = errorsOf({
        ...good(),
        products: [
          { ...DEFAULT_PRODUCTS[0], label: '' },
          { ...DEFAULT_PRODUCTS[1], minAmount: -1 },
        ],
      });
      expect(errs.some((e) => e.startsWith('products[0]'))).toBe(true);
      expect(errs.some((e) => e.startsWith('products[1]'))).toBe(true);
    });
  });

  it('strips unknown extra keys from the returned clean value', () => {
    const v = validateStoredPolicy({ ...good(), extraJunk: 'ignore me', policy: { ...DEFAULT_POLICY, extraJunk: 'ignore me' } });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect('extraJunk' in v.value.policy).toBe(false);
      expect('extraJunk' in v.value).toBe(false);
    }
  });

  it('surfaces BOTH threshold and ladder errors together in one reply when both are broken', () => {
    const errs = errorsOf({ policy: { ...DEFAULT_POLICY, maxDsr: 9 }, products: [] });
    expect(errs.some((e) => e.includes('maxDsr'))).toBe(true);
    expect(errs.some((e) => /at least one tier/.test(e))).toBe(true);
  });
});

describe('aprWarnings', () => {
  it('warns on any tier above the advisory ceiling, citing its rate', () => {
    const warnings = aprWarnings([{ id: 'emergency', label: 'Emergency Micro', minScore: 300, minAmount: 100, maxAmount: 500, tenorMonths: 6, apr: 0.36 }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Emergency Micro');
    expect(warnings[0]).toContain('36%');
    expect(warnings[0]).toMatch(/CCA 2025/);
  });

  it('is silent for a ladder entirely at or below the ceiling', () => {
    const warnings = aprWarnings([{ id: 'starter', label: 'Starter Capital', minScore: 500, minAmount: 2000, maxAmount: 5000, tenorMonths: 12, apr: APR_WARN_THRESHOLD }]);
    expect(warnings).toEqual([]);
  });

  it('warns per-tier, not just once for the whole ladder', () => {
    const warnings = aprWarnings([
      { id: 'emergency', label: 'A', minScore: 300, minAmount: 100, maxAmount: 500, tenorMonths: 6, apr: 0.35 },
      { id: 'starter', label: 'B', minScore: 500, minAmount: 2000, maxAmount: 5000, tenorMonths: 12, apr: 0.32 },
    ]);
    expect(warnings).toHaveLength(2);
  });
});

describe('CANONICAL_TIER_IDS', () => {
  it('is exactly the four slots the engine keys its coverage gates on', () => {
    expect(CANONICAL_TIER_IDS).toEqual(['emergency', 'starter', 'growth', 'scale']);
  });
});

describe('read/write round-trip (policyFile.ts)', () => {
  const tmp = path.join(os.tmpdir(), `policy-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('PUT-then-GET round-trips a custom policy and stamps updatedAt server-side', async () => {
    const custom = { ...good(), policy: { ...DEFAULT_POLICY, maxDsr: 0.3 } };
    const w = await writeStoredPolicy(tmp, custom);
    expect(w.ok).toBe(true);
    const r = await readStoredPolicy(tmp);
    expect(r.policy.maxDsr).toBe(0.3);
    expect(typeof r.updatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(r.updatedAt!))).toBe(false);
  });

  it('rejects a malformed body without touching the file', async () => {
    const w = await writeStoredPolicy(tmp, { policy: { ...DEFAULT_POLICY, maxDsr: 9 }, products: DEFAULT_PRODUCTS });
    expect(w.ok).toBe(false);
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it('a missing file falls back to the defaults (no updatedAt = never edited)', async () => {
    const r = await readStoredPolicy(tmp);
    expect(r.policy).toEqual(DEFAULT_STORED_POLICY.policy);
    expect(r.products).toEqual(DEFAULT_STORED_POLICY.products);
    expect(r.updatedAt).toBeUndefined();
  });

  it('a corrupt file falls back to the defaults instead of throwing', async () => {
    fs.writeFileSync(tmp, '{not json');
    expect((await readStoredPolicy(tmp)).policy).toEqual(DEFAULT_POLICY);
  });

  it('tolerates a UTF-8 BOM at the start of the file (Windows editors prepend one)', async () => {
    fs.writeFileSync(tmp, '﻿' + JSON.stringify({ ...good(), updatedAt: '2026-07-01T00:00:00.000Z' }));
    const r = await readStoredPolicy(tmp);
    expect(r.policy).toEqual(DEFAULT_POLICY);
    expect(r.updatedAt).toBe('2026-07-01T00:00:00.000Z');
  });
});
