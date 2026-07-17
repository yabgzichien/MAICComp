// TDD: readLenderPolicy resolves each lender's EFFECTIVE decision policy (multi-lender
// direct-apply, 2026-07-16). The gap it closes: readStoredPolicy falls back to the generic
// DEFAULT_STORED_POLICY (TEKUN's ladder) for a lender that never edited its policy, which would
// silently decide a Koperasi/Dana application against TEKUN's package. readLenderPolicy uses the
// lender's own registry package when unedited, and the stored policy when genuinely edited.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readLenderPolicy } from './policyFile';
import { LENDER_REGISTRY } from './lenderRegistry';
import { DEFAULT_PRODUCTS, DEFAULT_POLICY } from './loans';
import type { StoredPolicy } from './policyStore';

const koperasi = LENDER_REGISTRY.find((l) => l.id === 'koperasi-sejahtera')!;

describe('readLenderPolicy — effective per-lender decision policy', () => {
  const tmp = path.join(os.tmpdir(), `policy-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('an unedited lender decides with its OWN registry package, not TEKUN’s generic default', async () => {
    // Missing file → unedited. Koperasi must resolve to its registry ladder, not DEFAULT_PRODUCTS.
    const eff = await readLenderPolicy('koperasi-sejahtera', tmp);
    expect(eff.products).toEqual(koperasi.products);
    expect(eff.products).not.toEqual(DEFAULT_PRODUCTS);
    expect(eff.updatedAt).toBeUndefined();
  });

  it('an unedited TEKUN still resolves to the default ladder (its registry package IS DEFAULT_PRODUCTS)', async () => {
    const eff = await readLenderPolicy('tekun', tmp);
    expect(eff.products).toEqual(DEFAULT_PRODUCTS);
    expect(eff.policy).toEqual(DEFAULT_POLICY);
  });

  it('an EDITED policy (carries updatedAt) is honoured as-is over the registry default', async () => {
    const edited: StoredPolicy = {
      policy: { ...DEFAULT_POLICY, maxDsr: 0.3 },
      products: [{ id: 'starter', label: 'Custom', minScore: 640, minAmount: 2000, maxAmount: 6000, tenorMonths: 12, apr: 0.18 }],
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
    fs.writeFileSync(tmp, JSON.stringify(edited));
    const eff = await readLenderPolicy('koperasi-sejahtera', tmp);
    expect(eff.products).toEqual(edited.products);
    expect(eff.policy.maxDsr).toBe(0.3);
    expect(eff.updatedAt).toBe('2026-07-16T00:00:00.000Z');
  });

  it('an unknown lender keeps the generic default rather than throwing', async () => {
    const eff = await readLenderPolicy('nonexistent', tmp);
    expect(eff.products).toEqual(DEFAULT_PRODUCTS);
  });
});
