// src/db/budgetRepo.ts
import { getDb } from './db';

export interface BudgetAdvice {
  hash: string;
  text: string;
}

export async function getExpectedIncome(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ expected_income: number }>(
    'SELECT expected_income FROM budget WHERE id = 1'
  );
  return row?.expected_income ?? 0;
}

export async function setExpectedIncome(amount: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO budget (id, expected_income, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET expected_income = excluded.expected_income, updated_at = excluded.updated_at`,
    amount,
    new Date().toISOString()
  );
}

export async function getAllocations(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category_id: string; amount: number }>(
    'SELECT category_id, amount FROM budget_allocation'
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.category_id] = r.amount;
  return map;
}

/** Replace the full allocation set (used when saving the wizard / edits). */
export async function setAllocations(allocations: Record<string, number>): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM budget_allocation');
    for (const [categoryId, amount] of Object.entries(allocations)) {
      await db.runAsync(
        'INSERT INTO budget_allocation (category_id, amount, updated_at) VALUES (?, ?, ?)',
        categoryId,
        amount,
        now
      );
    }
  });
}

export async function deleteAllocation(categoryId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM budget_allocation WHERE category_id = ?', categoryId);
}

export async function getAdvice(): Promise<BudgetAdvice | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ hash: string; text: string }>(
    'SELECT hash, text FROM budget_advice WHERE id = 1'
  );
  return row ? { hash: row.hash, text: row.text } : null;
}

/** Wipe the whole budget: income, allocations, and cached advice. */
export async function clearBudget(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM budget');
    await db.runAsync('DELETE FROM budget_allocation');
    await db.runAsync('DELETE FROM budget_advice');
  });
}

/** All budget snapshots as a map of 'YYYY-MM' -> { income, allocations }. */
export async function getSnapshots(): Promise<Record<string, { income: number; allocations: Record<string, number> }>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ month: string; income: number; allocations: string }>(
    'SELECT month, income, allocations FROM budget_snapshot'
  );
  const map: Record<string, { income: number; allocations: Record<string, number> }> = {};
  for (const r of rows) {
    let allocations: Record<string, number> = {};
    try {
      allocations = JSON.parse(r.allocations) as Record<string, number>;
    } catch {
      // corrupt row  treat as no allocations
    }
    map[r.month] = { income: r.income, allocations };
  }
  return map;
}

/** Record (or overwrite) the budget snapshot for a given 'YYYY-MM' month. */
export async function upsertSnapshot(
  month: string,
  income: number,
  allocations: Record<string, number>
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO budget_snapshot (month, income, allocations, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET income = excluded.income, allocations = excluded.allocations, updated_at = excluded.updated_at`,
    month,
    income,
    JSON.stringify(allocations),
    new Date().toISOString()
  );
}

export async function setAdvice(hash: string, text: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO budget_advice (id, hash, text, updated_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, text = excluded.text, updated_at = excluded.updated_at`,
    hash,
    text,
    new Date().toISOString()
  );
}
