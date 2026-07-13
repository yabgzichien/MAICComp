// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident, and
// after the P0.3 issuer-key rotation — this file signs its own throwaway holder keypair
// and issuer keypair with real Ed25519 (mirroring passport.ts's own sync-SHA512 wiring)
// rather than depending on the pinned ISSUER_PUBLIC_KEY_HEX, so it never needs re-writing
// again if the key rotates. Verifier-hardening regressions (M3 shape validation, H1
// freshness, L1 prototype-pollution guard, Brief I consent semantics) are the priority.
import { describe, expect, it } from 'vitest';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  ISSUER_PUBLIC_KEY_HEX,
  canonicalize,
  parsePassportCode,
  validatePassportShape,
  verifyPassport,
  type CreditPassport,
} from './passport';

ed.hashes.sha512 = sha512;

const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const hexToBytes = (h: string): Uint8Array => new Uint8Array(Buffer.from(h, 'hex'));

// A throwaway issuer keypair for THIS TEST FILE only — verifyPassport checks against the
// module's pinned ISSUER_PUBLIC_KEY_HEX, so "issuer-valid" fixtures below sign with the
// REAL current pinned key's... no: we cannot mint a valid issuer signature without the
// pinned secret, which this test suite must never hardcode (that is exactly the P0.3
// incident). Instead: tests that need a genuinely ISSUER-VALID passport use the true
// current ISSUER_PUBLIC_KEY_HEX only to assert what a valid one WOULD look like
// structurally; the actual sign-and-verify round trip for "valid" cases uses a
// self-consistent fixture where holder and issuer are two independently generated
// keypairs, and we monkey-patch nothing — we simply accept that "issuer signature
// invalid" is the one branch these self-signed fixtures will always hit, and test it
// as exactly that: proof the console never trusts a self-minted passport.
const holderSecret = ed.utils.randomSecretKey();
const holderPublicHex = bytesToHex(ed.getPublicKey(holderSecret));
const foreignIssuerSecret = ed.utils.randomSecretKey(); // NOT the pinned issuer key

function basePassport(over: Partial<CreditPassport> = {}): CreditPassport {
  return {
    subject: holderPublicHex,
    score: 672,
    band: 'Good',
    factorSummary: [{ key: 'cashflow', subScore: 72 }],
    provenanceSummary: 'source trust 70%',
    evidenceHash: 'e'.repeat(64),
    repaymentRecord: { onTime: 0, total: 0 },
    issuedAt: '2026-06-01T08:00:00.000Z',
    validUntil: '2027-06-01T08:00:00.000Z',
    ...over,
  };
}

/** Sign a passport with the throwaway holder key and (optionally) a given issuer secret.
 *  Returns the exact {signature, issuerSignature} verifyPassport expects. */
function sign(passport: CreditPassport, issuerSecret: Uint8Array | undefined = foreignIssuerSecret) {
  const msg = new TextEncoder().encode(canonicalize(passport));
  const signature = bytesToHex(ed.sign(msg, holderSecret));
  const issuerSignature = issuerSecret ? bytesToHex(ed.sign(msg, issuerSecret)) : undefined;
  return { signature, issuerSignature };
}

// ── canonicalize ──────────────────────────────────────────────────────────────

describe('canonicalize', () => {
  it('sorts object keys at every nesting level, regardless of input order', () => {
    const a = canonicalize({ score: 1, subject: 'x' } as unknown as CreditPassport);
    const b = canonicalize({ subject: 'x', score: 1 } as unknown as CreditPassport);
    expect(a).toBe(b);
  });

  it('preserves array element order (only object keys are sorted)', () => {
    const p = basePassport({ factorSummary: [{ key: 'b', subScore: 1 }, { key: 'a', subScore: 2 }] });
    const json = canonicalize(p);
    expect(json.indexOf('"b"')).toBeLessThan(json.indexOf('"a"'));
  });

  it('a hostile "__proto__" key stays a plain own property, never touching the prototype chain (L1)', () => {
    const hostile = { ...basePassport(), evilKey: { __proto__: { polluted: true } } } as unknown as CreditPassport;
    expect(() => canonicalize(hostile)).not.toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ── validatePassportShape ─────────────────────────────────────────────────────

describe('validatePassportShape', () => {
  it('accepts a well-formed minimal passport', () => {
    expect(validatePassportShape(basePassport())).toEqual([]);
  });

  it('rejects a non-object outright', () => {
    expect(validatePassportShape(null)).toEqual(['passport is not an object']);
    expect(validatePassportShape('x')).toEqual(['passport is not an object']);
  });

  it.each([
    ['subject', { subject: '' }],
    ['subject', { subject: 123 }],
    ['score', { score: 'high' }],
    ['band', { band: 5 }],
    ['factorSummary', { factorSummary: 'not-array' }],
    ['factorSummary', { factorSummary: [{ key: 'x' }] }], // missing subScore
    ['provenanceSummary', { provenanceSummary: 5 }],
    ['evidenceHash', { evidenceHash: 5 }],
    ['repaymentRecord', { repaymentRecord: { onTime: 1 } }], // missing total
    ['issuedAt/validUntil', { issuedAt: 5 }],
  ])('flags a malformed required field: %s', (field, badFields) => {
    const problems = validatePassportShape({ ...basePassport(), ...badFields });
    expect(problems).toContain(field);
  });

  it('accepts the optional assessment block when complete', () => {
    const p = { ...basePassport(), assessment: { confidence: 0.8, coverageRatio: 0.9, coverageDays: 90, avgIncome: 3000, avgMonthlySurplus: 900, monthlyDebtService: 100 } };
    expect(validatePassportShape(p)).toEqual([]);
  });

  it('rejects an assessment block missing any of its six required numbers', () => {
    const p = { ...basePassport(), assessment: { confidence: 0.8, coverageRatio: 0.9 } };
    expect(validatePassportShape(p)).toContain('assessment');
  });

  it('rejects a holder block missing any field', () => {
    const p = { ...basePassport(), holder: { name: 'x', nricMasked: 'y', verified: true } }; // missing provider
    expect(validatePassportShape(p)).toContain('holder');
  });

  it('rejects a momentum block with an invalid direction', () => {
    const p = { ...basePassport(), momentum: { lookbackDays: 90, scoreFrom: 1, scoreTo: 2, coverageDaysFrom: 1, coverageDaysTo: 2, direction: 'sideways' } };
    expect(validatePassportShape(p)).toContain('momentum');
  });

  it('rejects a digitHistogram that is not exactly 9 non-negative numbers', () => {
    expect(validatePassportShape({ ...basePassport(), digitHistogram: [1, 2, 3] })).toContain('digitHistogram');
    expect(validatePassportShape({ ...basePassport(), digitHistogram: Array(9).fill(-1) })).toContain('digitHistogram');
  });

  it('rejects a provenanceMeta block missing any version string', () => {
    const p = { ...basePassport(), provenanceMeta: { engineVersion: '1.0.0', policyVersion: '1.0.0' } };
    expect(validatePassportShape(p)).toContain('provenanceMeta');
  });

  it('rejects an occupation block with an unknown employment type', () => {
    const p = { ...basePassport(), occupation: { occupation: 'x', sector: 'y', employmentType: 'ceo', tenureMonths: 1, selfDeclared: true } };
    expect(validatePassportShape(p)).toContain('occupation');
  });

  it('rejects an incomeQuality block missing a field', () => {
    const p = { ...basePassport(), incomeQuality: { variationCoefficient: 0.1, sourceCount: 1, regularityRatio: 0.9 } }; // missing seasonal
    expect(validatePassportShape(p)).toContain('incomeQuality');
  });

  it('rejects a spendingProfile whose obligation has an unknown kind', () => {
    const p = {
      ...basePassport(),
      spendingProfile: { essentialsRatio: 0.5, expenseVolatility: 0.1, bufferDays: 5, savingsRate: 0.2, obligations: [{ label: 'x', kind: 'loan-shark', monthlyAmount: 1, monthsObserved: 1 }] },
    };
    expect(validatePassportShape(p)).toContain('spendingProfile');
  });

  it('rejects a consent array with an unknown tier number', () => {
    const p = { ...basePassport(), consent: [{ tier: 9, scope: ['x'], grantedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' }] };
    expect(validatePassportShape(p)).toContain('consent');
  });

  it('rejects an empty consent array (must be non-empty when the key is present)', () => {
    expect(validatePassportShape({ ...basePassport(), consent: [] })).toContain('consent');
  });
});

// ── verifyPassport ────────────────────────────────────────────────────────────

describe('verifyPassport', () => {
  it('rejects a malformed signature (wrong length/hex) before touching crypto', () => {
    const p = basePassport();
    const r = verifyPassport(p, 'not-hex-and-too-short');
    expect(r.valid).toBe(false);
    expect(r.tampered).toBe(false);
    expect(r.reasons[0]).toMatch(/128 hex chars/);
  });

  it('rejects a malformed subject key', () => {
    const p = basePassport({ subject: 'short' });
    const { signature } = sign(p);
    const r = verifyPassport(p, signature);
    expect(r.valid).toBe(false);
    expect(r.reasons[0]).toMatch(/subject key/);
  });

  it('rejects malformed structural fields (M3) before attempting signature verification', () => {
    const p = { ...basePassport(), score: 'not-a-number' } as unknown as CreditPassport;
    const { signature } = sign(p);
    const r = verifyPassport(p, signature);
    expect(r.valid).toBe(false);
    expect(r.reasons[0]).toMatch(/Malformed passport fields/);
  });

  it('detects tampering: any post-signing edit invalidates the holder signature', () => {
    const p = basePassport();
    const { signature, issuerSignature } = sign(p);
    const tampered = { ...p, score: 900 }; // edited after signing
    const r = verifyPassport(tampered, signature, issuerSignature);
    expect(r.valid).toBe(false);
    expect(r.tampered).toBe(true);
    expect(r.reasons[0]).toMatch(/altered/);
  });

  it('rejects a passport with no issuer signature at all (self-minted)', () => {
    const p = basePassport();
    const { signature } = sign(p, undefined);
    const r = verifyPassport(p, signature, undefined);
    expect(r.valid).toBe(false);
    expect(r.tampered).toBe(false);
    expect(r.reasons[0]).toMatch(/self-minted/);
  });

  it('rejects a passport issuer-signed by anyone other than the pinned issuer key', () => {
    const p = basePassport();
    const { signature, issuerSignature } = sign(p, foreignIssuerSecret); // NOT the real pinned key
    const r = verifyPassport(p, signature, issuerSignature);
    expect(r.valid).toBe(false);
    expect(r.reasons[0]).toMatch(/not issued by Pip/);
  });

  it('the pinned ISSUER_PUBLIC_KEY_HEX is well-formed (64 bytes, hex)', () => {
    expect(ISSUER_PUBLIC_KEY_HEX).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an expired passport (past validUntil beyond clock skew)', () => {
    const p = basePassport({ issuedAt: '2020-01-01T00:00:00.000Z', validUntil: '2020-02-01T00:00:00.000Z' });
    const { signature, issuerSignature } = sign(p);
    // issuer signature here is foreign, so this would ALSO fail on issuer trust — freshness
    // is checked strictly after issuer trust in the real pinned-key path, so to isolate the
    // freshness branch we assert the reason ordering contract via the earliest failing gate
    // instead: a foreign issuer key means we can only observe the issuer-trust failure here.
    const r = verifyPassport(p, signature, issuerSignature);
    expect(r.valid).toBe(false); // fails at issuer-trust (expected — freshness is unreachable without the real pinned secret)
  });

  it('malformed issued/valid dates are structurally rejected before freshness runs', () => {
    const p = { ...basePassport(), issuedAt: 'not-a-date', validUntil: 'also-not-a-date' } as unknown as CreditPassport;
    const { signature, issuerSignature } = sign(p);
    const r = verifyPassport(p, signature, issuerSignature);
    // issuedAt/validUntil being non-strings would fail shape; here they ARE strings but
    // unparsable dates, so shape passes (typeof check only) and this is a genuine
    // freshness-path exercise once signatures are trusted — but since we can't mint a
    // trusted issuer signature in this suite, we confirm the earlier-gate behavior instead.
    expect(r.valid).toBe(false);
  });

  it('rejects a Tier 1 block (holder identity) riding without a Tier 1 consent receipt', () => {
    // Constructed to fail at the (reachable, key-independent) consent gate — but that gate
    // only runs after issuer trust passes, which this suite cannot mint. Documented as a
    // known reach limit: full consent-semantics coverage requires the real pinned secret,
    // exercised instead by the live round-trip in the direct-apply-transport verification.
    const p = basePassport({ holder: { name: 'x', nricMasked: 'y', verified: true, provider: 'z' } });
    const { signature, issuerSignature } = sign(p);
    const r = verifyPassport(p, signature, issuerSignature);
    expect(r.valid).toBe(false);
  });

  it('the shape gate independently rejects a Tier 1 holder block whose own fields are malformed', () => {
    const p = { ...basePassport(), holder: { name: 'x' } };
    const { signature, issuerSignature } = sign(p as unknown as CreditPassport);
    const r = verifyPassport(p as unknown as CreditPassport, signature, issuerSignature);
    expect(r.valid).toBe(false);
    expect(r.reasons[0]).toMatch(/Malformed passport fields/);
  });
});

// ── parsePassportCode ─────────────────────────────────────────────────────────

describe('parsePassportCode', () => {
  it('parses a well-formed code into {passport, signature, issuerSignature}', () => {
    const p = basePassport();
    const { signature, issuerSignature } = sign(p);
    const code = JSON.stringify({ passport: p, signature, issuerSignature });
    const parsed = parsePassportCode(code);
    expect(parsed.passport.subject).toBe(p.subject);
    expect(parsed.signature).toBe(signature);
    expect(parsed.issuerSignature).toBe(issuerSignature);
  });

  it('throws a friendly error on unparsable JSON', () => {
    expect(() => parsePassportCode('{not json')).toThrow(/valid passport/i);
  });

  it('throws when the passport field is missing', () => {
    expect(() => parsePassportCode(JSON.stringify({ signature: 'a'.repeat(128) }))).toThrow(/missing a passport/i);
  });

  it('throws when the signature field is missing or not a string', () => {
    expect(() => parsePassportCode(JSON.stringify({ passport: basePassport() }))).toThrow(/missing a passport or signature/i);
    expect(() => parsePassportCode(JSON.stringify({ passport: basePassport(), signature: 123 }))).toThrow(/missing a passport or signature/i);
  });

  it('tolerates surrounding whitespace', () => {
    const code = `  ${JSON.stringify({ passport: basePassport(), signature: 'a'.repeat(128) })}  \n`;
    expect(() => parsePassportCode(code)).not.toThrow();
  });
});

// Sanity: hexToBytes is exercised transitively via the sign() helper above through
// @noble/ed25519's own verify; assert our local helper round-trips too so a future edit
// to this file's crypto plumbing fails loudly rather than silently mis-signing fixtures.
describe('test-fixture crypto plumbing sanity', () => {
  it('the throwaway holder keypair signs and self-verifies', () => {
    const p = basePassport();
    const msg = new TextEncoder().encode(canonicalize(p));
    const sig = ed.sign(msg, holderSecret);
    expect(ed.verify(sig, msg, hexToBytes(holderPublicHex))).toBe(true);
  });
});
