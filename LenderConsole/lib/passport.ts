// Passport verification — ported from the borrower app (PipComp/src/lib/passport.ts
// + src/crypto/issuer.ts) so the lender console can cryptographically verify a real
// pasted passport: holder signature (proves "not altered") + pinned issuer signature
// (proves "issued by Pip", not self-minted). Aggregate-only — no raw transactions.

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Wire synchronous SHA-512 so the sync ed25519 verify path works.
ed.hashes.sha512 = sha512;

/** Pip's pinned issuer public key (must match PipComp/src/data/issuerKey.ts). */
export const ISSUER_PUBLIC_KEY_HEX = 'a120cfba5cc785efec44681cb59eb55bb41077c419c9afd7eaa9ba228150747b';

export interface PassportAssessment {
  confidence: number;
  coverageRatio: number;
  coverageDays: number;
  avgIncome: number;
  avgMonthlySurplus: number;
  monthlyDebtService: number;
}

export interface PassportHolder {
  name: string;
  nricMasked: string;
  verified: boolean;
  provider: string;
}

export interface PassportMomentum {
  lookbackDays: number;
  scoreFrom: number;
  scoreTo: number;
  coverageDaysFrom: number;
  coverageDaysTo: number;
  direction: 'rising' | 'flat' | 'falling';
}

/** Version stamps of the logic that produced this passport (engine / policy / model). */
export interface PassportProvenanceMeta {
  engineVersion: string;
  policyVersion: string;
  modelWeightsVersion: string;
}

/** Consent tiers: 0 = aggregates, 1 = identity/occupation, 2 = spending-behaviour profile. */
export type ConsentTier = 0 | 1 | 2;

/** A signed consent receipt (Brief I stretch) — see PipComp/src/lib/passport.ts (verbatim port). */
export interface ConsentReceipt {
  tier: ConsentTier;
  scope: string[];
  grantedAt: string;
  expiresAt: string;
}

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
  assessment?: PassportAssessment;
  holder?: PassportHolder;
  momentum?: PassportMomentum;
  /** Version stamps of the producing logic (optional; absent on pre-v2 passports). */
  provenanceMeta?: PassportProvenanceMeta;
  /** Leading-digit counts 1–9 (index 0 = digit 1) of the amounts behind the score —
   *  nine aggregate numbers, never raw transactions. Optional; absent pre-v2. */
  digitHistogram?: number[];
  /** Signed consent receipts (Brief I stretch). Optional; absent on pre-consent passports. */
  consent?: ConsentReceipt[];
}

export interface VerifyResult {
  valid: boolean;
  tampered: boolean;
  reasons: string[];
  /** Tiers whose consent grant has expired — the block is present but "lapsed" (not a failure). */
  lapsedTiers?: ConsentTier[];
}

function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return result;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Null-prototype accumulator so a hostile "__proto__"/"constructor" key stays a plain
    // own property and never touches the prototype chain. (L1)
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, Object.create(null) as Record<string, unknown>);
  }
  return value;
}

/** Canonical JSON (keys sorted at every level); array order preserved. */
export function canonicalize(passport: CreditPassport): string {
  return JSON.stringify(sortKeys(passport));
}

// ── Validation & freshness helpers ────────────────────────────────────────────

const HEX_RE = /^[0-9a-f]+$/i;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Strict structural/type validation of an untrusted passport before use (M3). [] = OK. */
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

/** Reason string if the passport is outside its signed validity window, else null (H1). */
function freshnessProblem(passport: CreditPassport, now: Date): string | null {
  const issued = Date.parse(passport.issuedAt);
  const until = Date.parse(passport.validUntil);
  if (Number.isNaN(issued) || Number.isNaN(until)) return 'Passport has malformed issued/valid dates';
  const t = now.getTime();
  if (t > until + CLOCK_SKEW_MS) return `Passport expired (valid until ${passport.validUntil})`;
  if (t < issued - CLOCK_SKEW_MS) return `Passport is not yet valid (issued ${passport.issuedAt})`;
  return null;
}

/** Verify holder signature against `passport.subject`, plus the pinned issuer signature. */
export function verifyPassport(
  passport: CreditPassport,
  signature: string,
  issuerSignature?: string,
  now: Date = new Date(),
): VerifyResult {
  if (signature.length !== 128 || !HEX_RE.test(signature)) {
    return { valid: false, tampered: false, reasons: ['Signature must be 64 bytes (128 hex chars).'] };
  }
  if (!passport.subject || passport.subject.length !== 64 || !HEX_RE.test(passport.subject)) {
    return { valid: false, tampered: false, reasons: ['Passport subject key is missing or malformed.'] };
  }
  // Strict structural validation before the payload is trusted (M3)
  const shape = validatePassportShape(passport);
  if (shape.length > 0) {
    return { valid: false, tampered: false, reasons: [`Malformed passport fields: ${shape.join(', ')}`] };
  }

  try {
    const msgBytes = new TextEncoder().encode(canonicalize(passport));
    const holderValid = ed.verify(hexToBytes(signature), msgBytes, hexToBytes(passport.subject));
    if (!holderValid) {
      return { valid: false, tampered: true, reasons: ['Holder signature verification failed — passport was altered.'] };
    }

    if (!issuerSignature || issuerSignature.length !== 128 || !HEX_RE.test(issuerSignature)) {
      return {
        valid: false,
        tampered: false,
        reasons: ['Missing or malformed issuer signature — not a Pip-issued passport (possible self-minted).'],
      };
    }
    const issuerValid = ed.verify(hexToBytes(issuerSignature), msgBytes, hexToBytes(ISSUER_PUBLIC_KEY_HEX));
    if (!issuerValid) {
      return {
        valid: false,
        tampered: false,
        reasons: ['Issuer signature invalid — not issued by Pip (possible self-minted passport).'],
      };
    }

    // Freshness: only meaningful once signatures prove the dates are authentic (H1)
    const stale = freshnessProblem(passport, now);
    if (stale) {
      return { valid: false, tampered: false, reasons: [stale] };
    }

    // Consent semantics (Brief I stretch), trusted only once the payload is proven authentic:
    //  · identity present but no Tier 1 receipt → data riding without consent → fail;
    //  · an expired tier grant degrades only that block (lapsedTiers), never the passport.
    if (passport.consent !== undefined) {
      if (passport.holder && !passport.consent.some((c) => c.tier === 1)) {
        return { valid: false, tampered: false, reasons: ['Identity present without a Tier 1 consent receipt.'] };
      }
      const lapsedTiers = passport.consent
        .filter((c) => Date.parse(c.expiresAt) < now.getTime() - CLOCK_SKEW_MS)
        .map((c) => c.tier);
      if (lapsedTiers.length > 0) return { valid: true, tampered: false, reasons: [], lapsedTiers };
    }
    return { valid: true, tampered: false, reasons: [] };
  } catch (err) {
    return { valid: false, tampered: false, reasons: [err instanceof Error ? err.message : String(err)] };
  }
}

/** Parsed shape of the pasted passport code. */
export interface ParsedCode {
  passport: CreditPassport;
  signature: string;
  issuerSignature?: string;
}

/** Parse the pasted JSON passport code; throws a friendly error on malformed input. */
export function parsePassportCode(raw: string): ParsedCode {
  let obj: unknown;
  try {
    obj = JSON.parse(raw.trim());
  } catch {
    throw new Error("Couldn't read the code — it doesn't look like a valid passport. Paste the full code from the Pip app.");
  }
  const o = obj as Partial<ParsedCode>;
  if (!o || typeof o !== 'object' || !o.passport || typeof o.signature !== 'string') {
    throw new Error('The code is missing a passport or signature. Paste the full code from the Pip app.');
  }
  return { passport: o.passport as CreditPassport, signature: o.signature, issuerSignature: o.issuerSignature };
}
