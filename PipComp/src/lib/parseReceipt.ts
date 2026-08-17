// src/lib/parseReceipt.ts
// Defensive parser for the "read this paper receipt" reply. Pure and tested: the model is
// asked for printed AMOUNTS (which is what a receipt actually shows), and the surcharge
// percentages the split sheet edits are derived back out of them here.
import { DEFAULT_SURCHARGES, type Surcharges } from './split';

export interface ScannedItem {
  label: string;
  /** The line total, quantity already multiplied in. */
  amount: number;
  quantity: number | null;
}

export interface ScannedReceipt {
  merchant: string | null;
  items: ScannedItem[];
  subtotal: number | null;
  serviceCharge: number | null;
  tax: number | null;
  total: number | null;
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

/** A plain number out of a number or a "RM 1,234.50" string, or null. Keeps a leading minus. */
function coerceAmount(raw: unknown): number | null {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    const negative = /-/.test(raw.trim().charAt(0)) || /^\(.*\)$/.test(raw.trim());
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (!/[0-9]/.test(cleaned)) return null;
    n = Number(cleaned) * (negative ? -1 : 1);
  } else {
    return null;
  }
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function coerceLabel(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 60) : fallback;
}

function coerceQuantity(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const EMPTY: ScannedReceipt = {
  merchant: null,
  items: [],
  subtotal: null,
  serviceCharge: null,
  tax: null,
  total: null,
};

export function parseReceipt(content: string): ScannedReceipt {
  const cleaned = stripFences(content).trim();
  if (!cleaned) return EMPTY;
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return EMPTY;
  }
  if (!data || typeof data !== 'object') return EMPTY;
  const o = data as Record<string, unknown>;

  const rows = Array.isArray(o.items) ? o.items : [];
  const items: ScannedItem[] = [];
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const amount = coerceAmount(r.amount);
    if (amount === null) return; // a row with no readable price cannot be assigned to anyone
    items.push({ label: coerceLabel(r.label, `Item ${i + 1}`), amount, quantity: coerceQuantity(r.quantity) });
  });

  return {
    merchant: typeof o.merchant === 'string' && o.merchant.trim() ? o.merchant.trim() : null,
    items,
    subtotal: coerceAmount(o.subtotal),
    serviceCharge: coerceAmount(o.serviceCharge),
    tax: coerceAmount(o.tax),
    total: coerceAmount(o.total),
  };
}

/** The items subtotal: what the receipt printed if it did, otherwise the lines added up. */
export function receiptSubtotal(receipt: ScannedReceipt): number {
  if (receipt.subtotal !== null && receipt.subtotal > 0) return receipt.subtotal;
  return Math.round(receipt.items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
}

/**
 * Back out the percentages the split sheet edits from the amounts the receipt printed.
 *
 * Service charge is read against the subtotal and tax against subtotal-plus-service, matching
 * the order the receipt itself computes them in. A receipt that printed neither falls back to
 * ZERO rather than the 10/6 convention: inventing a charge the paper never showed would
 * silently inflate what everyone at the table owes. The defaults are offered in the UI as a
 * toggle instead, which is a choice the user can see.
 *
 * Percentages are snapped to a whole number when they land within a rounding cent of one, so
 * the usual 10% and 6% come back as "10" and "6" instead of "9.97".
 */
export function derivedSurcharges(receipt: ScannedReceipt): Surcharges {
  const subtotal = receiptSubtotal(receipt);
  if (subtotal <= 0) return { serviceChargePct: 0, taxPct: 0 };

  const service = receipt.serviceCharge ?? 0;
  const tax = receipt.tax ?? 0;
  const serviceChargePct = service > 0 ? snap((service / subtotal) * 100) : 0;
  const taxBase = subtotal + service;
  const taxPct = tax > 0 && taxBase > 0 ? snap((tax / taxBase) * 100) : 0;
  return { serviceChargePct, taxPct };
}

/** Round to one decimal, then to a whole number when that is within 0.15 of it. */
function snap(pct: number): number {
  const whole = Math.round(pct);
  if (Math.abs(pct - whole) <= 0.15) return whole;
  return Math.round(pct * 10) / 10;
}

export { DEFAULT_SURCHARGES };
