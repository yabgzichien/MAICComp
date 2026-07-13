// src/lib/directApply.ts
// Direct-apply-transport (spec 2026-07-11): sends the signed passport code + requested
// amount + optional declared purpose straight to a lender console's POST /api/apply,
// replacing the manual QR/paste courier for the "Apply with this lender" action. Raw
// transactions never leave the phone  this sends only what the passport already
// carries (aggregates, signed), never anything the passport itself doesn't contain.
// Untrusted network output: the response is defensively parsed, same idiom as
// lenderDirectory.ts. Any transport failure degrades to 'offline'  the caller falls
// back to showing the QR/paste code for manual hand-over rather than breaking the flow.

import type { DeclaredPurpose } from './loanPurpose';

const FETCH_TIMEOUT_MS = 8_000;

export interface DirectApplyRequest {
  passportCode: string;
  requestedAmount: number;
  purpose?: DeclaredPurpose;
}

export interface DirectApplyDecision {
  decision: 'approve' | 'refer' | 'decline';
  maxAmount: number;
  installment: number;
  reasons: string[];
}

export type DirectApplyResult =
  | { status: 'filed'; id: string; decision: DirectApplyDecision }
  | { status: 'duplicate' }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'offline' };

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isDecisionValue = (x: unknown): x is DirectApplyDecision['decision'] => x === 'approve' || x === 'refer' || x === 'decline';

function parseDecision(raw: unknown): DirectApplyDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!isDecisionValue(d.decision) || !isFiniteNum(d.maxAmount) || !isFiniteNum(d.installment)) return null;
  const reasons = Array.isArray(d.reasons) ? d.reasons.filter((r): r is string => typeof r === 'string') : [];
  return { decision: d.decision, maxAmount: d.maxAmount, installment: d.installment, reasons };
}

/** Submit an application directly to a lender console. Never throws  network errors,
 *  timeouts, and malformed responses all resolve to a typed, callers-can't-crash result. */
export async function submitApplication(baseUrl: string, req: DirectApplyRequest): Promise<DirectApplyResult> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: { ok: boolean; status?: number; json: () => Promise<unknown> };
    try {
      res = await fetch(`${baseUrl}/api/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passportCode: req.passportCode,
          requestedAmount: req.requestedAmount,
          ...(req.purpose ? { purpose: req.purpose } : {}),
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await res.json();
    if (!body || typeof body !== 'object') return { status: 'offline' };
    const b = body as Record<string, unknown>;

    if (!res.ok) {
      const reasons = Array.isArray(b.errors) ? b.errors.filter((r): r is string => typeof r === 'string') : ['The lender could not process this application.'];
      return { status: 'rejected', reasons };
    }
    if (b.alreadyFiled === true) return { status: 'duplicate' };
    if (b.filed !== true || typeof b.id !== 'string') return { status: 'offline' };
    const decision = parseDecision(b.decision);
    if (!decision) return { status: 'offline' };
    return { status: 'filed', id: b.id, decision };
  } catch {
    return { status: 'offline' };
  }
}
