// src/lib/recap.ts
// Pure, deterministic helpers for the monthly income-statement recap. No UI or
// database imports — everything here is unit-tested.
import { txnMonthKey, type Allocations } from './budget';
import type { Transaction } from './types';

export interface IncomeStatement {
  income: number;
  expenses: number;
  net: number;
}

export interface Overspend {
  catId: string;
  allocated: number;
  spent: number;
  over: number; // spent - allocated (always > 0)
  pct: number; // over as a whole-number % of allocated
}

export interface Adherence {
  withinCount: number; // budgeted categories that stayed within their allocation
  totalBudgeted: number;
  overspends: Overspend[]; // categories over target, biggest overspend first
}

/** Income, expenses, and net (income − expenses) for a single 'YYYY-MM' month. */
export function monthlyIncomeStatement(txns: Transaction[], mk: string): IncomeStatement {
  let income = 0;
  let expenses = 0;
  for (const t of txns) {
    if (txnMonthKey(t) !== mk) continue;
    if (t.type === 'income') income += t.amount;
    else expenses += t.amount;
  }
  return { income, expenses, net: income - expenses };
}

/** Expense totals per category for a single month (income ignored). */
export function spentByCategory(txns: Transaction[], mk: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (t.type !== 'expense' || txnMonthKey(t) !== mk) continue;
    const cat = t.categoryId ?? 'other';
    out[cat] = (out[cat] ?? 0) + t.amount;
  }
  return out;
}

/**
 * How well spending stuck to the budget: how many budgeted categories stayed
 * within allocation, and a ranked list of those that went over.
 */
export function computeAdherence(allocations: Allocations, spentByCat: Record<string, number>): Adherence {
  const budgetedIds = Object.keys(allocations);
  const overspends: Overspend[] = [];
  let withinCount = 0;

  for (const id of budgetedIds) {
    const allocated = allocations[id];
    const spent = spentByCat[id] ?? 0;
    if (spent > allocated) {
      const over = spent - allocated;
      overspends.push({
        catId: id,
        allocated,
        spent,
        over,
        pct: allocated > 0 ? Math.round((over / allocated) * 100) : 0,
      });
    } else {
      withinCount++;
    }
  }

  overspends.sort((a, b) => b.over - a.over);
  return { withinCount, totalBudgeted: budgetedIds.length, overspends };
}

/**
 * Months the recap can show: every month that has transactions or a budget
 * snapshot, plus the current month, deduped and sorted newest first.
 */
export function availableMonths(
  txns: Transaction[],
  snapshotMonths: string[],
  now: Date = new Date()
): string[] {
  const months = new Set<string>(snapshotMonths);
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  for (const t of txns) {
    const mk = txnMonthKey(t);
    if (mk) months.add(mk);
  }
  return [...months].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}
