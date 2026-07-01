// src/lib/parseSnapshot.ts
// Defensive parser for the unified "scan a screenshot" reply: a screenshot is
// either a balance (bank/e-wallet/loan) or a crypto holdings screen. Pure & tested.
import { coerceHoldingsRows, type ScannedHolding } from './prices';

export type ScannedSnapshot =
  | { kind: 'balance'; provider: string | null; accountKind: 'asset' | 'liability' | null; amount: number | null }
  | { kind: 'holdings'; provider: string | null; holdings: ScannedHolding[] }
  | { kind: 'unknown' };

function coerceProvider(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function coerceAccountKind(raw: unknown): 'asset' | 'liability' | null {
  return raw === 'asset' || raw === 'liability' ? raw : null;
}

function coerceAmount(raw: unknown): number | null {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    const c = raw.replace(/[^0-9.]/g, '');
    if (!/[0-9]/.test(c)) return null;
    n = Number(c);
  } else {
    return null;
  }
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function parseSnapshot(content: string): ScannedSnapshot {
  const cleaned = stripFences(content).trim();
  if (!cleaned) return { kind: 'unknown' };
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return { kind: 'unknown' };
  }
  if (!data || typeof data !== 'object') return { kind: 'unknown' };
  const o = data as Record<string, unknown>;

  if (o.kind === 'balance') {
    return {
      kind: 'balance',
      provider: coerceProvider(o.provider),
      accountKind: coerceAccountKind(o.accountKind),
      amount: coerceAmount(o.amount),
    };
  }
  if (o.kind === 'holdings') {
    return {
      kind: 'holdings',
      provider: coerceProvider(o.provider),
      holdings: coerceHoldingsRows(o.holdings),
    };
  }
  return { kind: 'unknown' };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}
