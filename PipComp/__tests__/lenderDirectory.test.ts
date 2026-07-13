/**
 * TDD: Tests for src/lib/lenderDirectory.ts  the borrower-side fetch + validation of
 * the lender directory published by the Lender Console (`GET /api/lenders`).
 * Untrusted network input: malformed entries are rejected individually (valid ones
 * kept); any transport failure falls back to the offline generic ladder.
 */

import {
  fetchLenderDirectory,
  OFFLINE_LENDER,
  parseLenderDirectory,
  type LenderProfile,
} from '../src/lib/lenderDirectory';
import { DEFAULT_PRODUCTS } from '../src/lib/loans';

function validLender(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'tekun',
    name: 'TEKUN Nasional',
    blurb: 'Government micro-financing agency.',
    brandColor: '#0f2d5c',
    products: [
      { id: 'starter', label: 'Starter Capital', minScore: 500, minAmount: 2000, maxAmount: 5000, tenorMonths: 12, apr: 0.28 },
      { id: 'growth', label: 'Growth Capital', minScore: 620, minAmount: 4000, maxAmount: 10000, tenorMonths: 18, apr: 0.22 },
    ],
    ...over,
  };
}

describe('parseLenderDirectory', () => {
  it('accepts a valid payload and returns canonical profiles', () => {
    const out = parseLenderDirectory([validLender(), validLender({ id: 'koperasi', name: 'Koperasi X' })]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('tekun');
    expect(out[0].products).toHaveLength(2);
    expect(out[1].name).toBe('Koperasi X');
  });

  it('tolerates unknown extra fields on entries and products', () => {
    const entry = validLender({ marketing: 'ignore me' });
    (entry.products as Record<string, unknown>[])[0].promo = true;
    const out = parseLenderDirectory([entry]);
    expect(out).toHaveLength(1);
    expect('marketing' in out[0]).toBe(false);
  });

  it('drops a malformed entry but keeps the valid ones', () => {
    const out = parseLenderDirectory([validLender({ name: '' }), validLender({ id: 'ok' })]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('ok');
  });

  it('rejects an entry whose product has a non-numeric threshold', () => {
    const bad = validLender();
    (bad.products as Record<string, unknown>[])[0].minScore = 'low';
    expect(parseLenderDirectory([bad])).toHaveLength(0);
  });

  it('rejects an entry whose product range is inverted (maxAmount < minAmount)', () => {
    const bad = validLender();
    (bad.products as Record<string, unknown>[])[0].maxAmount = 100;
    expect(parseLenderDirectory([bad])).toHaveLength(0);
  });

  it('rejects an entry with an implausible APR (negative or above 100%)', () => {
    const tooHigh = validLender();
    (tooHigh.products as Record<string, unknown>[])[0].apr = 1.5;
    const negative = validLender();
    (negative.products as Record<string, unknown>[])[0].apr = -0.1;
    expect(parseLenderDirectory([tooHigh, negative])).toHaveLength(0);
  });

  it('rejects an entry with an empty product ladder', () => {
    expect(parseLenderDirectory([validLender({ products: [] })])).toHaveLength(0);
  });

  it('returns [] for a non-array payload', () => {
    expect(parseLenderDirectory({ lenders: [] })).toEqual([]);
    expect(parseLenderDirectory('nope')).toEqual([]);
    expect(parseLenderDirectory(null)).toEqual([]);
  });

  // ── Published thresholds (Brief N): the console now publishes each lender's policy ──

  const publishedPolicy = {
    minConfidenceToApprove: 0.6,
    maxInstallmentShareOfSurplus: 0.3,
    maxDsr: 0.35,
    emergencyOnlyBelowDays: 30,
    fullLadderFromDays: 90,
    minCoverageRatioForFullLadder: 0.5,
    costOfFunds: 0.05,
    targetReturn: 0.06,
  };

  it('carries a valid published policy through to the profile', () => {
    const out = parseLenderDirectory([validLender({ policy: publishedPolicy })]);
    expect(out).toHaveLength(1);
    expect(out[0].policy).toEqual(publishedPolicy);
  });

  it('keeps an entry WITHOUT a policy (older console, back-compat)  policy stays undefined', () => {
    const out = parseLenderDirectory([validLender()]);
    expect(out).toHaveLength(1);
    expect(out[0].policy).toBeUndefined();
  });

  it('drops an entry whose published policy is malformed  mis-simulating a lender is worse than skipping it', () => {
    const bad = validLender({ policy: { ...publishedPolicy, maxDsr: 'strict' } });
    const negative = validLender({ id: 'x', policy: { ...publishedPolicy, minConfidenceToApprove: -1 } });
    expect(parseLenderDirectory([bad, negative, validLender({ id: 'ok' })]).map((l) => l.id)).toEqual(['ok']);
  });
});

describe('fetchLenderDirectory', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns parsed lenders (offline: false) on a valid response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [validLender()],
    }) as unknown as typeof fetch;
    const dir = await fetchLenderDirectory();
    expect(dir.offline).toBe(false);
    expect(dir.lenders).toHaveLength(1);
    expect(dir.lenders[0].id).toBe('tekun');
  });

  it('falls back to the offline generic ladder when the network fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const dir = await fetchLenderDirectory();
    expect(dir.offline).toBe(true);
    expect(dir.lenders).toHaveLength(1);
    expect(dir.lenders[0].id).toBe(OFFLINE_LENDER.id);
    expect(dir.lenders[0].products).toEqual(DEFAULT_PRODUCTS);
  });

  it('falls back on a non-OK HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => [] }) as unknown as typeof fetch;
    const dir = await fetchLenderDirectory();
    expect(dir.offline).toBe(true);
    expect(dir.lenders[0].id).toBe(OFFLINE_LENDER.id);
  });

  it('falls back when the payload contains no valid lenders', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [validLender({ products: [] })],
    }) as unknown as typeof fetch;
    const dir = await fetchLenderDirectory();
    expect(dir.offline).toBe(true);
  });

  it('offline fallback profile is itself a well-formed LenderProfile', () => {
    const p: LenderProfile = OFFLINE_LENDER;
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.products.length).toBeGreaterThan(0);
  });
});
