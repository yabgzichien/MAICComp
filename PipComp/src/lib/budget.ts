// src/lib/budget.ts
import type { Transaction } from './types';

export type CategoryBudgetStatus = 'ok' | 'warn' | 'over';
export type Allocations = Record<string, number>;

/** 'YYYY-MM' from an ISO date/datetime, or null. */
export function monthKey(iso?: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * The month a transaction belongs to: its own `date` when present, otherwise the
 * month it was logged (`createdAt`). Preferring `date` keeps an imported May
 * transaction (logged in June) in May rather than the current month.
 */
export function txnMonthKey(t: { date: string | null; createdAt: string }): string | null {
  return monthKey(t.date) ?? monthKey(t.createdAt);
}

/** Current calendar month as 'YYYY-MM' (local time). */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Average monthly spend per expense category over the last `months` calendar
 * months (including the current one). For each category the average is taken
 * across the months that actually had spend in that category.
 */
export function averageMonthlySpend(
  txns: Transaction[],
  now: Date = new Date(),
  months = 3
): Record<string, number> {
  const allowed = new Set<string>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    allowed.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  // category -> month -> total
  const byCatMonth: Record<string, Record<string, number>> = {};
  for (const t of txns) {
    if (t.type !== 'expense') continue;
    const mk = monthKey(t.date) ?? monthKey(t.createdAt);
    if (!mk || !allowed.has(mk)) continue;
    const cat = t.categoryId ?? 'other';
    byCatMonth[cat] = byCatMonth[cat] ?? {};
    byCatMonth[cat][mk] = (byCatMonth[cat][mk] ?? 0) + t.amount;
  }
  const out: Record<string, number> = {};
  for (const [cat, monthsMap] of Object.entries(byCatMonth)) {
    const totals = Object.values(monthsMap);
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
    out[cat] = Math.round(avg);
  }
  return out;
}

export function allocatedTotal(allocations: Allocations): number {
  return Object.values(allocations).reduce((s, v) => s + v, 0);
}

export function leftover(income: number, allocations: Allocations): number {
  return income - allocatedTotal(allocations);
}

export function categoryStatus(spent: number, allocated: number): CategoryBudgetStatus {
  if (allocated <= 0) return spent > 0 ? 'over' : 'ok';
  const ratio = spent / allocated;
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

/** Stable cache key for the advice layer. */
export function budgetHash(income: number, allocations: Allocations): string {
  const parts = Object.keys(allocations)
    .sort()
    .map((k) => `${k}:${allocations[k]}`);
  return `i${income}|${parts.join(',')}`;
}
