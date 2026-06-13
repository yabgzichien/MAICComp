import { getDb } from './db';
import type { MemoryMap } from '../lib/types';

interface MemRow {
  merchant_key: string;
  category_id: string;
}

/** Load the full merchantKey -> categoryId map (the learned memory). */
export async function getMemoryMap(): Promise<MemoryMap> {
  const db = await getDb();
  const rows = await db.getAllAsync<MemRow>('SELECT merchant_key, category_id FROM merchant_memory');
  const map: MemoryMap = {};
  for (const r of rows) map[r.merchant_key] = r.category_id;
  return map;
}

/** Remember (or update) the category for a merchant key. */
export async function upsertMemory(key: string, categoryId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO merchant_memory (merchant_key, category_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(merchant_key) DO UPDATE SET category_id = excluded.category_id, updated_at = excluded.updated_at`,
    key,
    categoryId,
    new Date().toISOString()
  );
}

/** Count of learned merchants (for Settings display). */
export async function memoryCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM merchant_memory');
  return row?.n ?? 0;
}

/** Wipe all learned mappings (Settings → reset). */
export async function clearMemory(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM merchant_memory');
}
