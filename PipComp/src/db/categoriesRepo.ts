import { getDb } from './db';
import type { Category } from '../lib/types';

interface CatRow {
  id: string;
  label: string;
  icon: string;
  hue: number;
  kind: string;
  is_default: number;
  sort: number;
}

function toCategory(r: CatRow): Category {
  return {
    id: r.id,
    label: r.label,
    icon: r.icon,
    hue: r.hue,
    kind: r.kind === 'income' ? 'income' : 'expense',
    isDefault: !!r.is_default,
  };
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CatRow>('SELECT * FROM categories ORDER BY sort ASC, label ASC');
  return rows.map(toCategory);
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'cat'
  );
}

async function uniqueId(base: string): Promise<string> {
  const db = await getDb();
  let id = base;
  let n = 2;
  while (await db.getFirstAsync('SELECT 1 FROM categories WHERE id = ?', id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

export async function addCategory(
  label: string,
  icon: string,
  hue: number,
  kind: Category['kind']
): Promise<Category> {
  const db = await getDb();
  const id = await uniqueId(slugify(label));
  const sortRow = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort), 0) + 1 AS m FROM categories'
  );
  await db.runAsync(
    'INSERT INTO categories (id, label, icon, hue, kind, is_default, sort) VALUES (?, ?, ?, ?, ?, 0, ?)',
    id,
    label.trim(),
    icon,
    hue,
    kind,
    sortRow?.m ?? 0
  );
  return { id, label: label.trim(), icon, hue, kind, isDefault: false };
}

/**
 * The two generic categories that can never be deleted — they are the
 * reassignment targets when other categories are removed.
 */
export const PROTECTED_CATEGORY_IDS = ['other', 'income'];

/**
 * Delete a category (defaults allowed, except the protected generics). Any
 * transactions or learned mappings pointing at it are reassigned to the generic
 * of the same kind ('other' for expense, 'income' for income) so nothing dangles.
 */
export async function deleteCategory(id: string): Promise<void> {
  if (PROTECTED_CATEGORY_IDS.includes(id)) return;
  const db = await getDb();
  const row = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM categories WHERE id = ?', id);
  const fallbackId = row?.kind === 'income' ? 'income' : 'other';
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE transactions SET category_id = ? WHERE category_id = ?', fallbackId, id);
    await db.runAsync('DELETE FROM merchant_memory WHERE category_id = ?', id);
    await db.runAsync('DELETE FROM budget_allocation WHERE category_id = ?', id);
    await db.runAsync('DELETE FROM categories WHERE id = ?', id);
  });
}
