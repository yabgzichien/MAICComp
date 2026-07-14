// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Static lender registry (GET /api/lenders payload) — the Lender Match flywheel's
// publish side.
import { describe, expect, it } from 'vitest';
import { composeRegistry, findLender, LENDER_REGISTRY } from './lenderRegistry';
import { DEFAULT_POLICY, DEFAULT_PRODUCTS } from './loans';
import type { StoredPolicy } from './policyStore';

// The borrower engine's coverage gates keep products by these canonical ids —
// any other id silently falls out of thin-coverage eligibility.
const TIER_SLOTS = ['emergency', 'starter', 'growth', 'scale'];

describe('LENDER_REGISTRY (GET /api/lenders payload)', () => {
  it('publishes three lenders with unique ids and no empty ladders', () => {
    expect(LENDER_REGISTRY).toHaveLength(3);
    expect(new Set(LENDER_REGISTRY.map((l) => l.id)).size).toBe(3);
    for (const l of LENDER_REGISTRY) {
      expect(l.name.length).toBeGreaterThan(0);
      expect(l.brandColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(l.products.length).toBeGreaterThan(0);
    }
  });

  it("TEKUN's entry reuses DEFAULT_PRODUCTS unchanged (today's console behaviour)", () => {
    expect(LENDER_REGISTRY[0].id).toBe('tekun');
    expect(LENDER_REGISTRY[0].products).toBe(DEFAULT_PRODUCTS);
  });

  it('every product is structurally sound and uses a canonical tier-slot id', () => {
    for (const l of LENDER_REGISTRY) {
      for (const p of l.products) {
        expect(TIER_SLOTS).toContain(p.id);
        expect(p.label.length).toBeGreaterThan(0);
        expect(Number.isFinite(p.minScore)).toBe(true);
        expect(p.minAmount).toBeGreaterThan(0);
        expect(p.maxAmount).toBeGreaterThanOrEqual(p.minAmount);
        expect(p.tenorMonths).toBeGreaterThanOrEqual(1);
        expect(p.apr).toBeGreaterThanOrEqual(0);
        expect(p.apr).toBeLessThanOrEqual(1);
      }
      // No lender repeats a tier slot within its own ladder.
      expect(new Set(l.products.map((p) => p.id)).size).toBe(l.products.length);
    }
  });

  it('non-TEKUN lenders stay under 30% APR (competition rate-optics rule)', () => {
    for (const l of LENDER_REGISTRY.filter((x) => x.id !== 'tekun')) {
      for (const p of l.products) expect(p.apr).toBeLessThanOrEqual(0.28);
    }
  });

  it('the two demo lenders genuinely differ from TEKUN (thresholds and pricing)', () => {
    const [, koperasi, dana] = LENDER_REGISTRY;
    // Koperasi: no emergency safety net, cheaper credit, higher score bar.
    expect(koperasi.products.some((p) => p.id === 'emergency')).toBe(false);
    expect(Math.min(...koperasi.products.map((p) => p.minScore))).toBeGreaterThan(500);
    expect(Math.max(...koperasi.products.map((p) => p.apr))).toBeLessThan(0.16);
    // Dana Niaga: accessible entry tier below TEKUN's starter bar, micro ceilings.
    expect(Math.min(...dana.products.map((p) => p.minScore))).toBeLessThan(500);
    expect(Math.max(...dana.products.map((p) => p.maxAmount))).toBeLessThanOrEqual(8000);
  });
});

// ── composeRegistry (Brief N + Lender Tenancy spec): every lender's entry published
// from ITS OWN stored policy, keyed by lender id ────────────────────────────────

describe('composeRegistry', () => {
  const custom: StoredPolicy = {
    policy: { ...DEFAULT_POLICY, maxDsr: 0.3, minConfidenceToApprove: 0.6 },
    products: [{ id: 'starter', label: 'TEKUN Nano', minScore: 520, minAmount: 1500, maxAmount: 4500, tenorMonths: 10, apr: 0.26 }],
    updatedAt: '2026-07-08T00:00:00.000Z',
  };

  it("replaces ONLY the mapped lender's products and policy with the stored values", () => {
    const out = composeRegistry({ tekun: custom });
    const tekun = out.find((l) => l.id === 'tekun')!;
    expect(tekun.products).toEqual(custom.products);
    expect(tekun.policy).toEqual(custom.policy);
  });

  it('leaves lenders absent from the map untouched (their static registry defaults)', () => {
    const out = composeRegistry({ tekun: custom });
    const koperasi = out.find((l) => l.id === 'koperasi-sejahtera')!;
    const dana = out.find((l) => l.id === 'dana-niaga')!;
    expect(koperasi.products).toEqual(LENDER_REGISTRY.find((l) => l.id === 'koperasi-sejahtera')!.products);
    expect(dana.products).toEqual(LENDER_REGISTRY.find((l) => l.id === 'dana-niaga')!.products);
  });

  it('composes each lender independently when more than one is mapped', () => {
    const koperasiCustom: StoredPolicy = { policy: DEFAULT_POLICY, products: [{ id: 'starter', label: 'Custom Koperasi', minScore: 700, minAmount: 1000, maxAmount: 3000, tenorMonths: 6, apr: 0.1 }] };
    const out = composeRegistry({ tekun: custom, 'koperasi-sejahtera': koperasiCustom });
    expect(out.find((l) => l.id === 'tekun')!.products).toEqual(custom.products);
    expect(out.find((l) => l.id === 'koperasi-sejahtera')!.products).toEqual(koperasiCustom.products);
    expect(out.find((l) => l.id === 'dana-niaga')!.products).toEqual(LENDER_REGISTRY.find((l) => l.id === 'dana-niaga')!.products);
  });

  it('never-edited defaults reproduce the static registry\'s TEKUN entry exactly', () => {
    const out = composeRegistry({ tekun: { policy: DEFAULT_POLICY, products: DEFAULT_PRODUCTS } });
    const tekun = out.find((l) => l.id === 'tekun')!;
    expect(tekun.products).toBe(DEFAULT_PRODUCTS);
    expect(tekun.policy).toEqual(DEFAULT_POLICY);
  });

  it('an empty map reproduces the static registry exactly', () => {
    expect(composeRegistry({})).toEqual(LENDER_REGISTRY);
  });

  it('publishes exactly three lenders, same as the static registry, regardless of stored policy', () => {
    expect(composeRegistry({ tekun: custom })).toHaveLength(3);
  });
});

describe('findLender', () => {
  it('finds a lender by id', () => {
    expect(findLender(LENDER_REGISTRY, 'koperasi-sejahtera')?.name).toBe('Koperasi Usahawan Sejahtera');
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(findLender(LENDER_REGISTRY, 'nonexistent')).toBeUndefined();
  });
});
