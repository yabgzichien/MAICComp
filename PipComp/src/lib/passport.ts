/**
 * Credit Passport — build, sign, and verify a tamper-evident borrower credential.
 *
 * The passport contains aggregate credit data (score, factors, provenance summary)
 * but never raw transactions. A SHA-256 "evidence hash" of the aggregates gives
 * lenders a cryptographic anchor without exposing individual transaction records.
 */

import { sha512, sha256 } from '@noble/hashes/sha2.js';
import * as ed from '@noble/ed25519';

// Wire synchronous SHA-512 so the sync ed25519 verify path works.
ed.hashes.sha512 = sha512;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Lender-relevant aggregates carried inside the (signed) passport so the lender
 * runs its decision on the borrower's real numbers — not values re-derived from
 * the score. These are aggregates, not raw transactions, so privacy is preserved.
 */
export interface PassportAssessment {
  confidence: number;          // 0..1 data confidence
  coverageRatio: number;       // 0..1 90-day data coverage
  coverageDays: number;        // distinct days covered in the last 90
  avgIncome: number;           // RM/mo
  avgMonthlySurplus: number;   // RM/mo
  monthlyDebtService: number;  // RM/mo
}

/**
 * Signed score *trajectory* — the borrower's momentum. Thin-file borrowers can't show a high
 * level, but they can show verifiable upward direction. Re-derived from the same dated evidence.
 */
export interface PassportMomentum {
  lookbackDays: number;
  scoreFrom: number;
  scoreTo: number;
  coverageDaysFrom: number;
  coverageDaysTo: number;
  direction: 'rising' | 'flat' | 'falling';
}

/** Verified holder identity (eKYC) bound into the passport. Masked IC only — no raw NRIC. */
export interface PassportHolder {
  name: string;
  nricMasked: string;
  verified: boolean;
  provider: string;
}

/**
 * Version stamps of the logic that produced this passport — the scoring/confidence
 * engine, the loan-policy constants, and the fraud-model weights (see lib/versions.ts).
 * Signed alongside the rest, so a disputed decision can be re-run against exactly
 * the logic that made it.
 */
export interface PassportProvenanceMeta {
  engineVersion: string;
  policyVersion: string;
  modelWeightsVersion: string;
}

/** Consent tiers: 0 = aggregates, 1 = identity/occupation, 2 = spending-behaviour profile. */
export type ConsentTier = 0 | 1 | 2;

/**
 * A signed consent receipt (Brief I stretch): proof, embedded in the passport, of exactly
 * which tier the borrower granted, the fields it covers, when it was granted, and when it
 * expires. Because buildPassport signs the whole canonicalized passport, receipts are
 * tamper-evident for free — a lender can prove consent field-by-field. An expired grant
 * degrades only its own block ("consent lapsed"), never the whole passport.
 */
export interface ConsentReceipt {
  tier: ConsentTier;
  scope: string[];   // field names shared under this tier
  grantedAt: string; // ISO
  expiresAt: string; // ISO — may be shorter than the passport's own validUntil
}

/** The portable, signable credential — no raw transactions. */
export interface CreditPassport {
  subject: string;
  score: number;
  band: string;
  factorSummary: { key: string; subScore: number }[];
  provenanceSummary: string;
  evidenceHash: string;
  repaymentRecord: { onTime: number; total: number };
  issuedAt: string;
  validUntil: string;
  /** Lender-facing aggregates (optional for back-compat with older passports). */
  assessment?: PassportAssessment;
  /** Verified holder identity (optional; present once the borrower has completed eKYC). */
  holder?: PassportHolder;
  /** Signed score trajectory (optional; absent on older passports). */
  momentum?: PassportMomentum;
  /** Version stamps of the producing logic (optional; absent on pre-v2 passports). */
  provenanceMeta?: PassportProvenanceMeta;
  /**
   * Counts of leading digits 1–9 (index 0 = digit 1) across the transaction amounts
   * behind the score — nine aggregate numbers, never raw transactions. Lets a lender
   * chart the observed distribution against Benford's expected curve.
   * Optional; absent on pre-v2 passports.
   */
  digitHistogram?: number[];
  /** Signed consent receipts (Brief I stretch). Optional; absent on pre-consent passports. */
  consent?: ConsentReceipt[];
}

/** Input required to build a passport. */
export interface PassportInput {
  subject: string;
  score: number;
  band: string;
  factorSummary: { key: string; subScore: number }[];
  provenanceSummary: string;
  /**
   * Pre-aggregated numbers used to derive `evidenceHash`.
   * These are NOT raw transactions — they are already-summarised figures
   * (e.g. monthly income totals, factor sub-scores).
   */
  aggregates: Record<string, number>;
  repaymentRecord: { onTime: number; total: number };
  /** Optional lender-facing aggregates, copied into the signed passport. */
  assessment?: PassportAssessment;
  /** Optional verified holder identity, copied into the signed passport. */
  holder?: PassportHolder;
  /** Optional signed score trajectory, copied into the signed passport. */
  momentum?: PassportMomentum;
  /** Optional version stamps of the producing logic, copied into the signed passport. */
  provenanceMeta?: PassportProvenanceMeta;
  /** Optional leading-digit counts (9 entries), copied into the signed passport. */
  digitHistogram?: number[];
  /** Optional signed consent receipts, copied into the signed passport. */
  consent?: ConsentReceipt[];
}

/** Result of verifying a passport signature. */
export interface VerifyResult {
  valid: boolean;
  tampered: boolean;
  reasons: string[];
  /** Tiers whose consent grant has expired — the block is present but "lapsed" (not a failure). */
  lapsedTiers?: ConsentTier[];
}

/** Issuer-attestation inputs for verification: Pip's pinned public key + the issuer signature. */
export interface IssuerCheck {
  publicKeyHex: string;
  signature: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Convert Uint8Array to lowercase hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert lowercase hex string to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

/**
 * Recursively sort the keys of an object or array so that
 * JSON.stringify produces a stable, canonical output.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Build on a null-prototype object so an attacker-supplied "__proto__"/"constructor"
    // key becomes a plain own property instead of touching the prototype chain. (L1)
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, Object.create(null) as Record<string, unknown>);
  }
  return value;
}

// ── Validation & freshness helpers ────────────────────────────────────────────

const HEX_RE = /^[0-9a-f]+$/i;
/** Tolerance for client/issuer clock differences when checking the validity window. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Strict structural/type validation of an untrusted passport before it is used (M3).
 * Returns a list of problems ([] = well-formed). Defends the decision engine from type
 * confusion (e.g. a string score, NaN income, a missing band) in pasted JSON.
 */
export function validatePassportShape(p: unknown): string[] {
  const problems: string[] = [];
  if (!p || typeof p !== 'object') return ['passport is not an object'];
  const o = p as Record<string, unknown>;
  if (typeof o.subject !== 'string' || o.subject.length === 0) problems.push('subject');
  if (!isFiniteNum(o.score)) problems.push('score');
  if (typeof o.band !== 'string') problems.push('band');
  if (
    !Array.isArray(o.factorSummary) ||
    !o.factorSummary.every(
      (f) => f && typeof f === 'object' && typeof (f as { key?: unknown }).key === 'string' && isFiniteNum((f as { subScore?: unknown }).subScore)
    )
  )
    problems.push('factorSummary');
  if (typeof o.provenanceSummary !== 'string') problems.push('provenanceSummary');
  if (typeof o.evidenceHash !== 'string') problems.push('evidenceHash');
  const rr = o.repaymentRecord as { onTime?: unknown; total?: unknown } | undefined;
  if (!rr || typeof rr !== 'object' || !isFiniteNum(rr.onTime) || !isFiniteNum(rr.total)) problems.push('repaymentRecord');
  if (typeof o.issuedAt !== 'string' || typeof o.validUntil !== 'string') problems.push('issuedAt/validUntil');
  if (o.assessment !== undefined) {
    const a = o.assessment as Record<string, unknown>;
    const keys = ['confidence', 'coverageRatio', 'coverageDays', 'avgIncome', 'avgMonthlySurplus', 'monthlyDebtService'];
    if (!a || typeof a !== 'object' || !keys.every((k) => isFiniteNum(a[k]))) problems.push('assessment');
  }
  if (o.holder !== undefined) {
    const h = o.holder as Record<string, unknown>;
    if (!h || typeof h !== 'object' || typeof h.name !== 'string' || typeof h.nricMasked !== 'string' || typeof h.verified !== 'boolean' || typeof h.provider !== 'string')
      problems.push('holder');
  }
  if (o.momentum !== undefined) {
    const m = o.momentum as Record<string, unknown>;
    const nums = ['lookbackDays', 'scoreFrom', 'scoreTo', 'coverageDaysFrom', 'coverageDaysTo'];
    const okDir = m && typeof m.direction === 'string' && ['rising', 'flat', 'falling'].includes(m.direction as string);
    if (!m || typeof m !== 'object' || !nums.every((k) => isFiniteNum(m[k])) || !okDir) problems.push('momentum');
  }
  if (o.provenanceMeta !== undefined) {
    const v = o.provenanceMeta as Record<string, unknown>;
    const keys = ['engineVersion', 'policyVersion', 'modelWeightsVersion'];
    if (!v || typeof v !== 'object' || !keys.every((k) => typeof v[k] === 'string' && (v[k] as string).length > 0))
      problems.push('provenanceMeta');
  }
  if (o.digitHistogram !== undefined) {
    const h = o.digitHistogram;
    if (!Array.isArray(h) || h.length !== 9 || !h.every((n) => isFiniteNum(n) && n >= 0)) problems.push('digitHistogram');
  }
  if (o.consent !== undefined && !isValidConsent(o.consent)) problems.push('consent');
  return problems;
}

/** True when `c` is a non-empty array of well-formed consent receipts. */
function isValidConsent(c: unknown): c is ConsentReceipt[] {
  if (!Array.isArray(c) || c.length === 0) return false;
  return c.every((e) => {
    if (!e || typeof e !== 'object') return false;
    const r = e as Record<string, unknown>;
    if (r.tier !== 0 && r.tier !== 1 && r.tier !== 2) return false;
    if (!Array.isArray(r.scope) || r.scope.length === 0 || !r.scope.every((s) => typeof s === 'string' && s.length > 0)) return false;
    if (typeof r.grantedAt !== 'string' || Number.isNaN(Date.parse(r.grantedAt))) return false;
    if (typeof r.expiresAt !== 'string' || Number.isNaN(Date.parse(r.expiresAt))) return false;
    return true;
  });
}

/** Returns a reason string if the passport is outside its signed validity window, else null (H1). */
function freshnessProblem(passport: CreditPassport, now: Date): string | null {
  const issued = Date.parse(passport.issuedAt);
  const until = Date.parse(passport.validUntil);
  if (Number.isNaN(issued) || Number.isNaN(until)) return 'Passport has malformed issued/valid dates';
  const t = now.getTime();
  if (t > until + CLOCK_SKEW_MS) return `Passport expired (valid until ${passport.validUntil})`;
  if (t < issued - CLOCK_SKEW_MS) return `Passport is not yet valid (issued ${passport.issuedAt})`;
  return null;
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Produce a deterministic JSON string of a passport.
 * Keys are sorted alphabetically at every level of nesting.
 *
 * Note: Array element order is preserved — only object keys within each
 * element are sorted alphabetically. This is intentional, as the order of
 * factorSummary must be stable for cryptographic signing.
 */
export function canonicalize(passport: CreditPassport): string {
  return JSON.stringify(sortKeys(passport));
}

/**
 * SHA-256 hex hash of the canonical JSON of `aggregates` (keys sorted).
 * Provides a cryptographic anchor to the pre-aggregated source material
 * without exposing individual transaction records.
 *
 * Aggregates must be pre-validated by the caller — keys and values should be
 * stable and deterministic to ensure reproducible hashing.
 */
export function evidenceHashOf(aggregates: Record<string, number>): string {
  const canonical = JSON.stringify(sortKeys(aggregates));
  const bytes = new TextEncoder().encode(canonical);
  const digest = sha256(bytes);
  return bytesToHex(digest);
}

/**
 * Build a `CreditPassport` from `input`, sign it, and return the passport
 * together with a hex-encoded Ed25519 signature.
 *
 * The injected `sign` function is used — no private key material is handled here,
 * making the function straightforward to test with any keypair.
 */
export async function buildPassport(
  input: PassportInput,
  sign: (bytes: Uint8Array) => Promise<Uint8Array>,
  issuerSign?: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<{ passport: CreditPassport; signature: string; issuerSignature?: string }> {
  // Consent enforcement (Brief I stretch): once a consent block is supplied, identity may
  // only ride along with a Tier 1 grant. A holder with no consent block at all is the
  // pre-consent (back-compat) path and is left untouched.
  if (input.holder && input.consent !== undefined && !input.consent.some((c) => c.tier === 1)) {
    throw new Error('Cannot attach a holder without a Tier 1 consent grant.');
  }

  const issuedAt = new Date().toISOString();
  const validUntilDate = new Date(issuedAt);
  validUntilDate.setDate(validUntilDate.getDate() + 30);
  const validUntil = validUntilDate.toISOString();

  const passport: CreditPassport = {
    band: input.band,
    evidenceHash: evidenceHashOf(input.aggregates),
    factorSummary: input.factorSummary,
    issuedAt,
    provenanceSummary: input.provenanceSummary,
    repaymentRecord: input.repaymentRecord,
    score: input.score,
    subject: input.subject,
    validUntil,
    ...(input.assessment ? { assessment: input.assessment } : {}),
    ...(input.holder ? { holder: input.holder } : {}),
    ...(input.momentum ? { momentum: input.momentum } : {}),
    ...(input.provenanceMeta ? { provenanceMeta: input.provenanceMeta } : {}),
    ...(input.digitHistogram ? { digitHistogram: input.digitHistogram } : {}),
    ...(input.consent ? { consent: input.consent } : {}),
  };

  const canonical = canonicalize(passport);
  const msgBytes = new TextEncoder().encode(canonical);
  const sigBytes = await sign(msgBytes);
  const signature = bytesToHex(sigBytes);

  if (issuerSign) {
    const issuerSigBytes = await issuerSign(msgBytes);
    return { passport, signature, issuerSignature: bytesToHex(issuerSigBytes) };
  }
  return { passport, signature };
}

/**
 * Verify that a passport's signature is valid for the given public key.
 *
 * Synchronous — `@noble/ed25519` verify is sync when `hashes.sha512` is wired.
 */
export function verifyPassport(
  passport: CreditPassport,
  signature: string,
  publicKeyHex: string,
  issuer?: IssuerCheck,
  now: Date = new Date(),
): VerifyResult {
  // Validate signature length + hex charset before attempting verification (L3)
  if (signature.length !== 128 || !HEX_RE.test(signature)) {
    return {
      valid: false,
      tampered: false,
      reasons: ['Signature must be 64 bytes (128 hex chars)'],
    };
  }

  // Validate public key length + hex charset before attempting verification (L3)
  if (publicKeyHex.length !== 64 || !HEX_RE.test(publicKeyHex)) {
    return {
      valid: false,
      tampered: false,
      reasons: ['Public key must be 32 bytes (64 hex chars)'],
    };
  }

  // Strict structural validation before the payload is trusted (M3)
  const shape = validatePassportShape(passport);
  if (shape.length > 0) {
    return { valid: false, tampered: false, reasons: [`Malformed passport fields: ${shape.join(', ')}`] };
  }

  try {
    const canonical = canonicalize(passport);
    const msgBytes = new TextEncoder().encode(canonical);
    const sigBytes = hexToBytes(signature);
    const pubKeyBytes = hexToBytes(publicKeyHex);

    const holderValid = ed.verify(sigBytes, msgBytes, pubKeyBytes);
    if (!holderValid) {
      return { valid: false, tampered: true, reasons: ['Signature verification failed'] };
    }

    // Issuer attestation (optional): proves Pip — not just the holder — issued this passport.
    // Without it, a holder's own signature only proves "not altered", not "issued by Pip".
    if (issuer) {
      if (issuer.signature.length !== 128 || !HEX_RE.test(issuer.signature) || issuer.publicKeyHex.length !== 64 || !HEX_RE.test(issuer.publicKeyHex)) {
        return {
          valid: false,
          tampered: false,
          reasons: ['Missing or malformed issuer signature — not a Pip-issued passport'],
        };
      }
      const issuerValid = ed.verify(
        hexToBytes(issuer.signature),
        msgBytes,
        hexToBytes(issuer.publicKeyHex),
      );
      if (!issuerValid) {
        return {
          valid: false,
          tampered: false,
          reasons: ['Issuer signature invalid — not issued by Pip (possible self-minted passport)'],
        };
      }
    }

    // Freshness: only meaningful once the (signed) dates are known authentic (H1)
    const stale = freshnessProblem(passport, now);
    if (stale) {
      return { valid: false, tampered: false, reasons: [stale] };
    }

    // Consent semantics (Brief I stretch), only trusted once the payload is proven authentic:
    //  · identity present but no Tier 1 receipt → data riding without consent → fail;
    //  · an expired tier grant degrades only that block (lapsedTiers), never the passport.
    if (passport.consent !== undefined) {
      if (passport.holder && !passport.consent.some((c) => c.tier === 1)) {
        return { valid: false, tampered: false, reasons: ['Identity present without a Tier 1 consent receipt'] };
      }
      const lapsedTiers = passport.consent
        .filter((c) => Date.parse(c.expiresAt) < now.getTime() - CLOCK_SKEW_MS)
        .map((c) => c.tier);
      if (lapsedTiers.length > 0) return { valid: true, tampered: false, reasons: [], lapsedTiers };
    }

    return { valid: true, tampered: false, reasons: [] };
  } catch (err) {
    // Parse/encoding errors are protocol violations, not tamper detection.
    // A malformed signature or public key would fail here; however, the
    // caller should have validated lengths before calling this function.
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, tampered: false, reasons: [message] };
  }
}
