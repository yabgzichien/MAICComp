// Pure builder for the downloadable "decision file"  the lender's retained evidence
// bundle for one assessed passport. Self-contained by design: it embeds the credential
// with BOTH signatures so the file can be independently re-verified years later
// (dispute / audit), alongside the verification outcome recorded at decision time,
// the deterministic decision with its reasons, and the credit memo as drafted.
// Nothing here can change a verdict or an amount  it only packages them.

import type { CreditPassport, VerifyResult } from './passport';
import { ISSUER_PUBLIC_KEY_HEX } from './passport';
import type { LoanDecision } from './loans';
import type { CreditMemo } from './creditMemo';

export interface DecisionFile {
  fileType: 'pip-credit-decision-file';
  fileVersion: 1;
  generatedAt: string;
  /** Outcome of cryptographic verification at decision time, plus the pinned issuer
   *  key it was checked against  so the file states what was trusted and why. */
  verification: {
    valid: boolean;
    tampered: boolean;
    reasons: string[];
    issuerPublicKeyHex: string;
  };
  /** The full signed credential  passport + holder signature + issuer signature.
   *  Enough to re-run verification independently of this console. */
  credential: {
    passport: CreditPassport;
    signature: string;
    issuerSignature?: string;
  };
  /** The deterministic engine's decision exactly as rendered to the officer. */
  decision: {
    requestedAmount: number;
    decision: LoanDecision['decision'];
    maxAmount: number;
    installment: number;
    reasons: string[];
  };
  /** The credit memo structure drafted from the same values as the decision. */
  memo: CreditMemo;
}

export function buildDecisionFile(args: {
  passport: CreditPassport;
  signature: string;
  issuerSignature?: string;
  verification: VerifyResult;
  decision: LoanDecision;
  requestedAmount: number;
  memo: CreditMemo;
  /** Injectable for deterministic tests; defaults to now. */
  generatedAt?: string;
}): DecisionFile {
  return {
    fileType: 'pip-credit-decision-file',
    fileVersion: 1,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    verification: {
      valid: args.verification.valid,
      tampered: args.verification.tampered,
      reasons: args.verification.reasons,
      issuerPublicKeyHex: ISSUER_PUBLIC_KEY_HEX,
    },
    credential: {
      passport: args.passport,
      signature: args.signature,
      ...(args.issuerSignature ? { issuerSignature: args.issuerSignature } : {}),
    },
    decision: {
      requestedAmount: args.requestedAmount,
      decision: args.decision.decision,
      maxAmount: args.decision.maxAmount,
      installment: args.decision.installment,
      reasons: args.decision.reasons,
    },
    memo: args.memo,
  };
}

/** Stable, filesystem-safe download name: subject prefix + issue date of the file. */
export function decisionFileName(passport: CreditPassport, generatedAt: string): string {
  return `decision-file-${passport.subject.slice(0, 8)}-${generatedAt.slice(0, 10)}.json`;
}
