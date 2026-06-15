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
}

export interface VerifyResult {
  valid: boolean;
  tampered: boolean;
  reasons: string[];
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
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

/** Canonical JSON (keys sorted at every level); array order preserved. */
export function canonicalize(passport: CreditPassport): string {
  return JSON.stringify(sortKeys(passport));
}

/** Verify holder signature against `passport.subject`, plus the pinned issuer signature. */
export function verifyPassport(
  passport: CreditPassport,
  signature: string,
  issuerSignature?: string,
): VerifyResult {
  if (signature.length !== 128) {
    return { valid: false, tampered: false, reasons: ['Signature must be 64 bytes (128 hex chars).'] };
  }
  if (!passport.subject || passport.subject.length !== 64) {
    return { valid: false, tampered: false, reasons: ['Passport subject key is missing or malformed.'] };
  }

  try {
    const msgBytes = new TextEncoder().encode(canonicalize(passport));
    const holderValid = ed.verify(hexToBytes(signature), msgBytes, hexToBytes(passport.subject));
    if (!holderValid) {
      return { valid: false, tampered: true, reasons: ['Holder signature verification failed — passport was altered.'] };
    }

    if (!issuerSignature || issuerSignature.length !== 128) {
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
