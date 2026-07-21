/**
 * TDD: Tests for src/lib/passport.ts
 * Written BEFORE implementation.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  buildPassport,
  canonicalize,
  evidenceHashOf,
  validatePassportShape,
  verifyPassport,
  type CreditPassport,
  type PassportInput,
} from '../src/lib/passport';

// Wire sync SHA-512 so ed sync helpers work in tests.
ed.hashes.sha512 = sha512;

// ── Helpers ──────────────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Minimal test keypair  no dependency on keys.ts (injection is the point). */
function makeTestKeypair() {
  const secretKey = ed.utils.randomSecretKey();
  const publicKeyBytes = ed.getPublicKey(secretKey);
  const publicKeyHex = bytesToHex(publicKeyBytes);
  const sign = (bytes: Uint8Array): Promise<Uint8Array> =>
    Promise.resolve(ed.sign(bytes, secretKey));
  return { publicKeyHex, sign };
}

const baseInput: PassportInput = {
  subject: 'aabbccdd',
  score: 720,
  band: 'Good',
  factorSummary: [
    { key: 'income', subScore: 80 },
    { key: 'savings', subScore: 70 },
  ],
  provenanceSummary: 'extracted: 70%, manual: 30%',
  aggregates: { monthlyIncome: 3000, monthlyExpense: 2100 },
  repaymentRecord: { onTime: 5, total: 6 },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('canonicalize', () => {
  it('is stable: same passport in → same string out (call twice)', () => {
    const { sign } = makeTestKeypair();
    return buildPassport(baseInput, sign).then(({ passport }) => {
      const first = canonicalize(passport);
      const second = canonicalize(passport);
      expect(first).toBe(second);
    });
  });

  it('produces alphabetically-sorted top-level keys', () => {
    const { sign } = makeTestKeypair();
    return buildPassport(baseInput, sign).then(({ passport }) => {
      const str = canonicalize(passport);
      const parsed = JSON.parse(str) as CreditPassport;
      const keys = Object.keys(parsed);
      expect(keys).toEqual([...keys].sort());
    });
  });
});

describe('evidenceHashOf', () => {
  it('is stable: same aggregates → same hash', () => {
    const h1 = evidenceHashOf({ a: 1, b: 2 });
    const h2 = evidenceHashOf({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it('changes when a value changes', () => {
    const h1 = evidenceHashOf({ a: 1, b: 2 });
    const h2 = evidenceHashOf({ a: 1, b: 3 });
    expect(h1).not.toBe(h2);
  });

  it('returns a 64-char lowercase hex string (SHA-256)', () => {
    const h = evidenceHashOf({ x: 42 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildPassport + verifyPassport', () => {
  it('round-trip: build then verify with same key → valid: true, tampered: false', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(true);
    expect(result.tampered).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('tamper detection: mutating score after signing → valid: false, tampered: true', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    passport.score += 1; // tamper
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
    expect(result.reasons).toContain('Signature verification failed');
  });

  it('wrong public key: verify with a different key → valid: false', async () => {
    const { sign } = makeTestKeypair();
    const { publicKeyHex: differentPubKey } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    const result = verifyPassport(passport, signature, differentPubKey);
    expect(result.valid).toBe(false);
  });

  it('no raw transaction data in passport', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(baseInput, sign);
    const keys = Object.keys(passport);
    expect(keys).not.toContain('transactions');
    expect(keys).not.toContain('txns');
    expect(keys).not.toContain('rawTxns');
  });

  it('passport has expected shape with issuedAt and validUntil', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(baseInput, sign);
    expect(passport.subject).toBe(baseInput.subject);
    expect(passport.score).toBe(baseInput.score);
    expect(passport.band).toBe(baseInput.band);
    expect(passport.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(passport.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // validUntil should be ~30 days after issuedAt
    const issued = new Date(passport.issuedAt).getTime();
    const until = new Date(passport.validUntil).getTime();
    const diffDays = (until - issued) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it('evidenceHash is set from aggregates, not raw transactions', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(baseInput, sign);
    const expected = evidenceHashOf(baseInput.aggregates);
    expect(passport.evidenceHash).toBe(expected);
  });

  it('bad hex signature → returns error in reasons, not a throw', () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    return buildPassport(baseInput, sign).then(({ passport }) => {
      const result = verifyPassport(passport, 'not-valid-hex', publicKeyHex);
      expect(result.valid).toBe(false);
      expect(result.tampered).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  it('reordering factorSummary produces a different signature (array order matters)', async () => {
    const { sign } = makeTestKeypair();

    const input1: PassportInput = {
      ...baseInput,
      factorSummary: [
        { key: 'income', subScore: 80 },
        { key: 'savings', subScore: 70 },
      ],
    };

    const input2: PassportInput = {
      ...baseInput,
      factorSummary: [
        { key: 'savings', subScore: 70 },
        { key: 'income', subScore: 80 },
      ],
    };

    const { signature: sig1 } = await buildPassport(input1, sign);
    const { signature: sig2 } = await buildPassport(input2, sign);

    expect(sig1).not.toBe(sig2);
  });
});

describe('assessment block (lender aggregates)', () => {
  const withAssessment: PassportInput = {
    ...baseInput,
    assessment: {
      confidence: 0.62,
      coverageRatio: 0.4,
      coverageDays: 36,
      avgIncome: 2543,
      avgMonthlySurplus: 280,
      monthlyDebtService: 10,
    },
  };

  it('carries the assessment into the signed passport', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(withAssessment, sign);
    expect(passport.assessment).toEqual(withAssessment.assessment);
  });

  it('tampering with an assessment value breaks verification', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(withAssessment, sign);
    passport.assessment!.avgIncome = 9999; // tamper to inflate affordability
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });
});

describe('momentum block (score trajectory)', () => {
  const withMomentum: PassportInput = {
    ...baseInput,
    momentum: {
      lookbackDays: 90,
      scoreFrom: 640,
      scoreTo: 691,
      coverageDaysFrom: 8,
      coverageDaysTo: 17,
      direction: 'rising',
    },
  };

  it('carries the momentum into the signed passport', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(withMomentum, sign);
    expect(passport.momentum).toEqual(withMomentum.momentum);
  });

  it('tampering with a momentum value breaks verification', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(withMomentum, sign);
    passport.momentum!.scoreTo = 850; // fake a stronger trajectory
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('rejects a malformed momentum block in shape validation', () => {
    const bad = { ...baseInput, momentum: { lookbackDays: 90, scoreFrom: 'lots' } };
    expect(validatePassportShape(bad)).toContain('momentum');
  });
});

describe('standing block (repayment arrears)', () => {
  const SAMPLE_STANDING = {
    current: { bucket: 'arrears' as const, adverseRecord: 'soft' as const, monthsInArrears: 2, amountOverdue: 640 },
    scar: { bucket: 'impaired' as const, reachedMonthsAgo: 5 },
    discountEligible: false,
  };

  const withStanding: PassportInput = {
    ...baseInput,
    standing: SAMPLE_STANDING,
  };

  it('carries the standing block into the signed passport when present', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(withStanding, sign);
    expect(passport.standing).toEqual(SAMPLE_STANDING);
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(true);
  });

  it('tampering with a standing value breaks verification', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(withStanding, sign);
    passport.standing!.current.bucket = 'clean'; // fake a clean standing
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('rejects a malformed standing block in shape validation', () => {
    const bad = {
      ...baseInput,
      standing: { current: { bucket: 'arrears', monthsInArrears: 2, amountOverdue: 640 }, scar: null, discountEligible: false },
    };
    expect(validatePassportShape(bad)).toContain('standing');
  });

  it('accepts a well-formed standing block, with either a null or a real scar', async () => {
    const { sign } = makeTestKeypair();
    const withScar = await buildPassport(withStanding, sign);
    expect(validatePassportShape(withScar.passport)).not.toContain('standing');

    const clean = { ...SAMPLE_STANDING, current: { ...SAMPLE_STANDING.current, bucket: 'clean' as const, adverseRecord: 'none' as const }, scar: null };
    const withoutScar = await buildPassport({ ...baseInput, standing: clean }, sign);
    expect(validatePassportShape(withoutScar.passport)).not.toContain('standing');
  });

  it('standing is absent (back-compat) when omitted', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(baseInput, sign);
    expect(passport.standing).toBeUndefined();
  });
});

describe('holder identity (eKYC) binding', () => {
  const withHolder: PassportInput = {
    ...baseInput,
    holder: { name: 'Aisyah B.', nricMasked: '••••••-••-5678', verified: true, provider: 'Demo verification (mock)' },
  };

  it('carries the holder into the signed passport', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(withHolder, sign);
    expect(passport.holder).toEqual(withHolder.holder);
  });

  it('tampering with the bound name breaks verification', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(withHolder, sign);
    passport.holder!.name = 'Someone Else';
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });
});

describe('issuer attestation', () => {
  it('valid issuer signature → passes when the pinned issuer key matches', async () => {
    const holder = makeTestKeypair();
    const issuer = makeTestKeypair();
    const { passport, signature, issuerSignature } = await buildPassport(
      baseInput,
      holder.sign,
      issuer.sign,
    );
    expect(issuerSignature).toBeDefined();
    const result = verifyPassport(passport, signature, holder.publicKeyHex, {
      publicKeyHex: issuer.publicKeyHex,
      signature: issuerSignature!,
    });
    expect(result.valid).toBe(true);
  });

  it('self-minted passport (holder signs, no issuer secret) fails issuer check', async () => {
    const fraudster = makeTestKeypair();
    const realIssuer = makeTestKeypair();
    // Fraudster self-signs but signs the issuer slot with their OWN key.
    const { passport, signature, issuerSignature } = await buildPassport(
      baseInput,
      fraudster.sign,
      fraudster.sign, // they don't have the issuer secret
    );
    // Lender pins the REAL issuer key → issuer verification must fail.
    const result = verifyPassport(passport, signature, fraudster.publicKeyHex, {
      publicKeyHex: realIssuer.publicKeyHex,
      signature: issuerSignature!,
    });
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => /issuer/i.test(r))).toBe(true);
  });

  it('omitting the issuer check preserves back-compat (holder signature only)', async () => {
    const holder = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, holder.sign);
    const result = verifyPassport(passport, signature, holder.publicKeyHex);
    expect(result.valid).toBe(true);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('freshness / expiry enforcement (H1)', () => {
  it('rejects an expired passport (now past validUntil)', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    const future = new Date(Date.parse(passport.validUntil) + DAY_MS);
    const r = verifyPassport(passport, signature, publicKeyHex, undefined, future);
    expect(r.valid).toBe(false);
    expect(r.tampered).toBe(false);
    expect(r.reasons.some((x) => /expired/i.test(x))).toBe(true);
  });

  it('rejects a not-yet-valid passport (now before issuedAt)', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    const past = new Date(Date.parse(passport.issuedAt) - DAY_MS);
    const r = verifyPassport(passport, signature, publicKeyHex, undefined, past);
    expect(r.valid).toBe(false);
    expect(r.reasons.some((x) => /not yet valid/i.test(x))).toBe(true);
  });

  it('accepts a passport inside its validity window', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    const mid = new Date(Date.parse(passport.issuedAt) + DAY_MS);
    const r = verifyPassport(passport, signature, publicKeyHex, undefined, mid);
    expect(r.valid).toBe(true);
  });
});

describe('shape validation (M3)', () => {
  it('rejects a malformed passport (non-numeric score) before trusting the payload', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    (passport as unknown as { score: unknown }).score = 'high';
    const r = verifyPassport(passport, signature, publicKeyHex);
    expect(r.valid).toBe(false);
    expect(r.reasons.some((x) => /malformed/i.test(x))).toBe(true);
  });
});

describe('provenance meta + digit histogram (schema v2)', () => {
  const withV2: PassportInput = {
    ...baseInput,
    provenanceMeta: { engineVersion: '1.0.0', policyVersion: '1.0.0', modelWeightsVersion: '1.0.0-berka9' },
    digitHistogram: [54, 31, 22, 17, 14, 12, 10, 9, 8],
  };

  it('carries provenanceMeta and digitHistogram into the signed passport', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(withV2, sign);
    expect(passport.provenanceMeta).toEqual(withV2.provenanceMeta);
    expect(passport.digitHistogram).toEqual(withV2.digitHistogram);
  });

  it('tampering with the digit histogram breaks verification (it is signed)', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(withV2, sign);
    passport.digitHistogram![0] += 5; // reshape the Benford evidence
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('tampering with a version stamp breaks verification', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(withV2, sign);
    passport.provenanceMeta!.engineVersion = '9.9.9';
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
  });

  it('rejects a histogram that is not exactly 9 non-negative finite numbers', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(withV2, sign);
    const asAny = (h: unknown) => ({ ...passport, digitHistogram: h });
    expect(validatePassportShape(asAny([1, 2, 3]))).toContain('digitHistogram');
    expect(validatePassportShape(asAny([1, 2, 3, 4, 5, 6, 7, 8, -1]))).toContain('digitHistogram');
    expect(validatePassportShape(asAny([1, 2, 3, 4, 5, 6, 7, 8, NaN]))).toContain('digitHistogram');
    expect(validatePassportShape(asAny([1, 2, 3, 4, 5, 6, 7, 8, 'x']))).toContain('digitHistogram');
  });

  it('rejects a provenanceMeta with missing or empty version strings', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport(withV2, sign);
    const asAny = (m: unknown) => ({ ...passport, provenanceMeta: m });
    expect(validatePassportShape(asAny({ engineVersion: '1.0.0', policyVersion: '1.0.0' }))).toContain('provenanceMeta');
    expect(validatePassportShape(asAny({ engineVersion: '', policyVersion: '1.0.0', modelWeightsVersion: '1' }))).toContain('provenanceMeta');
    expect(validatePassportShape(asAny({ engineVersion: 1, policyVersion: '1.0.0', modelWeightsVersion: '1' }))).toContain('provenanceMeta');
  });

  it('back-compat: a pre-v2 passport without the new fields still validates and verifies', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    expect(Object.keys(passport)).not.toContain('provenanceMeta');
    expect(Object.keys(passport)).not.toContain('digitHistogram');
    expect(validatePassportShape(passport)).toEqual([]);
    expect(verifyPassport(passport, signature, publicKeyHex).valid).toBe(true);
  });
});

// ── Consent block (Brief I stretch) ───────────────────────────────────────────

describe('consent block', () => {
  const iso = (d: Date) => d.toISOString();
  const future = iso(new Date(Date.now() + 30 * 864e5));
  const past = iso(new Date(Date.now() - 864e5));
  const t0 = { tier: 0 as const, scope: ['score', 'band'], grantedAt: iso(new Date()), expiresAt: future };
  const t1 = { tier: 1 as const, scope: ['holder.name', 'holder.nricMasked'], grantedAt: iso(new Date()), expiresAt: future };
  const H = { name: 'Aisyah B.', nricMasked: '••••••-••-5678', verified: true, provider: 'Demo (mock)' };

  it('validatePassportShape accepts a well-formed block and names malformed ones', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport({ ...baseInput, consent: [t0] }, sign);
    expect(validatePassportShape(passport)).toEqual([]);
    const bad = (c: unknown) => validatePassportShape({ ...passport, consent: c });
    expect(bad('nope')).toContain('consent');
    expect(bad([])).toContain('consent');
    expect(bad([{ ...t0, tier: 5 }])).toContain('consent');
    expect(bad([{ ...t0, scope: [] }])).toContain('consent');
    expect(bad([{ ...t0, expiresAt: 'not-a-date' }])).toContain('consent');
  });

  it('buildPassport carries the block and enforces holder ⟹ Tier 1 grant', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    await expect(buildPassport({ ...baseInput, holder: H, consent: [t0] }, sign)).rejects.toThrow(/Tier 1/);
    const { passport, signature } = await buildPassport({ ...baseInput, holder: H, consent: [t0, t1] }, sign);
    expect(passport.consent).toEqual([t0, t1]);
    expect(verifyPassport(passport, signature, publicKeyHex).valid).toBe(true);
  });

  it('back-compat: a passport without a consent block still verifies', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport({ ...baseInput, holder: H }, sign);
    expect(passport.consent).toBeUndefined();
    expect(verifyPassport(passport, signature, publicKeyHex).valid).toBe(true);
  });

  it('verification fails when a holder rides along without a Tier 1 receipt (signed by hand)', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    // Hand-build a holder+consent(Tier0-only) passport that buildPassport would refuse, sign it, and verify.
    const { passport } = await buildPassport({ ...baseInput, consent: [t0] }, sign);
    const forged: CreditPassport = { ...passport, holder: H };
    const sig = bytesToHex(await sign(new TextEncoder().encode(canonicalize(forged))));
    const res = verifyPassport(forged, sig, publicKeyHex);
    expect(res.valid).toBe(false);
    expect(res.reasons.join(' ')).toMatch(/Tier 1|receipt/i);
  });

  it('an expired tier grant degrades that block (lapsedTiers), not the whole passport', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const expiredT1 = { ...t1, expiresAt: past };
    const { passport, signature } = await buildPassport({ ...baseInput, holder: H, consent: [t0, expiredT1] }, sign);
    const res = verifyPassport(passport, signature, publicKeyHex);
    expect(res.valid).toBe(true);
    expect(res.lapsedTiers).toContain(1);
    expect(res.lapsedTiers).not.toContain(0);
  });
});

// ── Richer passport blocks (Brief P) ──────────────────────────────────────────

describe('richer blocks', () => {
  const iso = (d: Date) => d.toISOString();
  const future = iso(new Date(Date.now() + 30 * 864e5));
  const grant = (tier: 0 | 1 | 2) => ({ tier, scope: ['x'], grantedAt: iso(new Date()), expiresAt: future });
  const occ = { occupation: 'Hawker', sector: 'Food & Beverage', employmentType: 'micro-business' as const, tenureMonths: 24, selfDeclared: true as const };
  const iq = { variationCoefficient: 0.2, sourceCount: 2, regularityRatio: 0.9, seasonal: false };
  const sp = { essentialsRatio: 0.7, expenseVolatility: 0.1, bufferDays: 12, savingsRate: 0.2, obligations: [{ label: 'Rent', kind: 'rent' as const, monthlyAmount: 900, monthsObserved: 6 }] };

  it('validatePassportShape accepts well-formed blocks and rejects malformed ones', async () => {
    const { sign } = makeTestKeypair();
    const { passport } = await buildPassport({ ...baseInput, incomeQuality: iq }, sign);
    expect(validatePassportShape(passport)).toEqual([]);
    const withOcc = { ...passport, occupation: occ };
    expect(validatePassportShape(withOcc)).toEqual([]);
    expect(validatePassportShape({ ...passport, occupation: { ...occ, employmentType: 'wizard' } })).toContain('occupation');
    expect(validatePassportShape({ ...passport, incomeQuality: { ...iq, seasonal: 'no' } })).toContain('incomeQuality');
    expect(validatePassportShape({ ...passport, spendingProfile: { ...sp, obligations: [{ label: 'x', kind: 'bogus', monthlyAmount: 1, monthsObserved: 1 }] } })).toContain('spendingProfile');
  });

  it('income quality (Tier 0) needs no grant; occupation needs Tier 1; spending needs Tier 2', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    // Tier 0 income quality with a consent block but no tier-1/2 grants → fine.
    const t0 = await buildPassport({ ...baseInput, incomeQuality: iq, consent: [grant(0)] }, sign);
    expect(verifyPassport(t0.passport, t0.signature, publicKeyHex).valid).toBe(true);
    // Occupation without a Tier 1 grant → build throws.
    await expect(buildPassport({ ...baseInput, occupation: occ, consent: [grant(0)] }, sign)).rejects.toThrow(/Tier 1/);
    // Spending profile without a Tier 2 grant → build throws.
    await expect(buildPassport({ ...baseInput, spendingProfile: sp, consent: [grant(0)] }, sign)).rejects.toThrow(/Tier 2/);
    // All grants present → builds and verifies, blocks carried.
    const full = await buildPassport({ ...baseInput, occupation: occ, incomeQuality: iq, spendingProfile: sp, consent: [grant(0), grant(1), grant(2)] }, sign);
    expect(verifyPassport(full.passport, full.signature, publicKeyHex).valid).toBe(true);
    expect(full.passport.occupation).toEqual(occ);
    expect(full.passport.spendingProfile!.obligations).toHaveLength(1);
  });

  it('verification fails when a Tier 2 block rides along without its receipt (signed by hand)', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport } = await buildPassport({ ...baseInput, consent: [grant(0)] }, sign);
    const forged: CreditPassport = { ...passport, spendingProfile: sp };
    const s = bytesToHex(await sign(new TextEncoder().encode(canonicalize(forged))));
    expect(verifyPassport(forged, s, publicKeyHex).valid).toBe(false);
  });

  it('back-compat: a passport without any richer blocks still verifies', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const { passport, signature } = await buildPassport(baseInput, sign);
    expect(validatePassportShape(passport)).toEqual([]);
    expect(verifyPassport(passport, signature, publicKeyHex).valid).toBe(true);
  });
});
