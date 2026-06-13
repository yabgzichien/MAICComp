import type { ExtractedTxn, TxnType } from './types';

/**
 * Pure, defensive parser for the LLM's extraction reply.
 *
 * The model is asked to return `{"transactions":[{merchant,amount,direction,date,method}]}`,
 * but we never trust that blindly. This function:
 *   - strips ```json code fences if present,
 *   - JSON.parses inside a try/catch,
 *   - accepts either {transactions:[...]} or a bare [...] array,
 *   - validates/coerces each row, dropping invalid rows instead of throwing,
 *   - maps direction "in" -> income, "out" (default) -> expense.
 *
 * Throws ONLY when the payload cannot be parsed as JSON at all, so callers can
 * show a friendly "couldn't read the screenshot" message.
 */
export function parseExtraction(content: string): ExtractedTxn[] {
  const cleaned = stripCodeFences(content).trim();
  if (!cleaned) return [];

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    // Last resort: pull the first {...} or [...] block out of surrounding prose.
    const salvaged = salvageJson(cleaned);
    if (salvaged === null) {
      throw new ExtractionParseError('Response was not valid JSON.');
    }
    data = salvaged;
  }

  const rows = extractRows(data);
  const out: ExtractedTxn[] = [];
  for (const row of rows) {
    const parsed = parseRow(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

export class ExtractionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionParseError';
  }
}

function stripCodeFences(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1] : s;
}

function salvageJson(s: string): unknown | null {
  const start = s.search(/[[{]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '[' ? ']' : '}';
  const end = s.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.transactions)) return obj.transactions;
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

function parseRow(row: unknown): ExtractedTxn | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;

  const merchant = typeof r.merchant === 'string' ? r.merchant.trim() : '';
  if (!merchant) return null;

  const amount = coerceAmount(r.amount);
  if (amount === null) return null;

  const type: TxnType =
    String(r.direction ?? r.type ?? 'out').toLowerCase() === 'in' ? 'income' : 'expense';

  const date = coerceDate(r.date);
  const method = typeof r.method === 'string' && r.method.trim() ? r.method.trim() : null;
  const categoryHint =
    typeof r.category === 'string' && r.category.trim() ? r.category.trim() : null;

  return { merchant, amount, type, date, method, categoryHint };
}

function coerceAmount(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    // tolerate "RM80.00", "1,234.50", "-18.20"
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!/[0-9]/.test(cleaned)) return null; // guard: Number("") === 0
    n = Number(cleaned);
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

function coerceDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}
