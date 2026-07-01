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

/** Verified holder identity (eKYC) bound into the passport. Masked IC only — no raw NRIC. */
export interface PassportHolder {
  name: string;
  nricMasked: string;
  verified: boolean;
  provider: string;
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
}

/** Result of verifying a passport signature. */
export interface VerifyResult {
  valid: boolean;
  tampered: boolean;
  reasons: string[];
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
  return problems;
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

    return { valid: true, tampered: false, reasons: [] };
  } catch (err) {
    // Parse/encoding errors are protocol violations, not tamper detection.
    // A malformed signature or public key would fail here; however, the
    // caller should have validated lengths before calling this function.
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, tampered: false, reasons: [message] };
  }
}
