// src/lib/obligations.ts (Brief P)
// Pure detection of recurring outflows in the borrower's own ledger → an EVIDENCED monthly
// debt-service figure, replacing the loans-only self-reported number in the assessment.
// Demo-honest recurring-pattern matching (similar amount, monthly cadence), not a
// production classifier. No UI/DB imports.

import type { Transaction } from './types';

export type ObligationKind = 'rent' | 'utilities' | 'installment' | 'other';

export interface DetectedObligation {
  label: string;          // merchant / payee as observed
  kind: ObligationKind;
  monthlyAmount: number;  // representative (median) monthly amount
  monthsObserved: number; // distinct months this outflow recurred
}

export interface ObligationSummary {
  obligations: DetectedObligation[];
  /** Σ monthlyAmount — the evidenced monthly debt service (recurring committed outflows). */
  evidencedMonthlyDebtService: number;
}

/** A recurring outflow must appear in at least this many distinct months to count. */
const MIN_MONTHS = 3;
/** Monthly amounts within this fraction of the median are treated as "the same" obligation. */
const AMOUNT_TOLERANCE = 0.15;

function monthKeyOf(t: Transaction): string {
  return (t.date ?? t.createdAt).slice(0, 7);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Rough keyword classification of a recurring payee. Utilities/rent/installment else other. */
function classify(label: string): ObligationKind {
  const s = label.toLowerCase();
  if (/\b(rent|sewa|landlord|tenan)\b/.test(s)) return 'rent';
  if (/\b(tnb|electric|water|air|indah|syabas|unifi|maxis|celcom|digi|astro|internet|bill|utilit)\b/.test(s)) return 'utilities';
  if (/\b(loan|installment|instal|ansuran|hire|hp|financ|pinjaman|bnpl|credit)\b/.test(s)) return 'installment';
  return 'other';
}

/**
 * Detect recurring monthly outflows and sum them into an evidenced monthly debt service.
 * Groups expense transactions by merchant, keeps those recurring in ≥ MIN_MONTHS distinct
 * months with a stable amount (each month's spend within AMOUNT_TOLERANCE of the median),
 * and reports a representative monthly amount per obligation.
 */
export function detectObligations(transactions: Transaction[]): ObligationSummary {
  const expenses = transactions.filter((t) => t.type === 'expense' && t.amount > 0);

  // Group by merchant → month → summed amount that month.
  const byMerchant = new Map<string, { label: string; monthly: Map<string, number> }>();
  for (const t of expenses) {
    const key = t.merchantKey || t.merchantRaw || 'unknown';
    if (!byMerchant.has(key)) byMerchant.set(key, { label: t.merchantRaw || key, monthly: new Map() });
    const g = byMerchant.get(key)!;
    const mk = monthKeyOf(t);
    g.monthly.set(mk, (g.monthly.get(mk) ?? 0) + t.amount);
  }

  const obligations: DetectedObligation[] = [];
  for (const { label, monthly } of byMerchant.values()) {
    if (monthly.size < MIN_MONTHS) continue;
    const amounts = [...monthly.values()];
    const med = median(amounts);
    if (med <= 0) continue;
    // Stable recurring amount: most months sit within tolerance of the median.
    const stable = amounts.filter((a) => Math.abs(a - med) <= med * AMOUNT_TOLERANCE).length;
    if (stable < MIN_MONTHS) continue;
    obligations.push({ label, kind: classify(label), monthlyAmount: med, monthsObserved: monthly.size });
  }

  obligations.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  const evidencedMonthlyDebtService = obligations.reduce((s, o) => s + o.monthlyAmount, 0);
  return { obligations, evidencedMonthlyDebtService };
}
