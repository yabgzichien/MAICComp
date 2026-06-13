import { getDb, genId } from './db';
import type { Transaction, TxnSource, TxnType } from '../lib/types';

interface TxnRow {
  id: string;
  merchant_raw: string;
  merchant_key: string;
  amount: number;
  currency: string;
  type: string;
  txn_date: string | null;
  category_id: string | null;
  created_at: string;
  source: string;
}

function toTxn(r: TxnRow): Transaction {
  return {
    id: r.id,
    merchantRaw: r.merchant_raw,
    merchantKey: r.merchant_key,
    amount: r.amount,
    currency: r.currency,
    type: r.type === 'income' ? 'income' : 'expense',
    date: r.txn_date,
    categoryId: r.category_id,
    createdAt: r.created_at,
    source: (r.source as TxnSource) ?? 'manual',
  };
}

export interface NewTxn {
  merchantRaw: string;
  merchantKey: string;
  amount: number;
  type: TxnType;
  date: string | null;
  categoryId: string | null;
  source?: TxnSource;
}

export async function listTransactions(limit?: number): Promise<Transaction[]> {
  const db = await getDb();
  const sql =
    'SELECT * FROM transactions ORDER BY created_at DESC, id DESC' + (limit ? ' LIMIT ?' : '');
  const rows = limit
    ? await db.getAllAsync<TxnRow>(sql, limit)
    : await db.getAllAsync<TxnRow>(sql);
  return rows.map(toTxn);
}

export async function addTransactions(items: NewTxn[]): Promise<Transaction[]> {
  const db = await getDb();
  const created: Transaction[] = [];
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const id = genId();
      const createdAt = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO transactions
           (id, merchant_raw, merchant_key, amount, currency, type, txn_date, category_id, created_at, source)
         VALUES (?, ?, ?, ?, 'MYR', ?, ?, ?, ?, ?)`,
        id,
        it.merchantRaw,
        it.merchantKey,
        it.amount,
        it.type,
        it.date,
        it.categoryId,
        createdAt,
        it.source ?? 'manual'
      );
      created.push({
        id,
        merchantRaw: it.merchantRaw,
        merchantKey: it.merchantKey,
        amount: it.amount,
        currency: 'MYR',
        type: it.type,
        date: it.date,
        categoryId: it.categoryId,
        createdAt,
        source: it.source ?? 'manual',
      });
    }
  });
  return created;
}

export async function updateTransactionAmount(id: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET amount = ? WHERE id = ?', amount, id);
}

export async function updateTransactionCategory(id: string, categoryId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET category_id = ? WHERE id = ?', categoryId, id);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM transactions WHERE id IN (${placeholders})`, ...ids);
}

/** Update amount, type, and category together (used by the edit sheet). */
export async function updateTransactionFields(
  id: string,
  amount: number,
  type: TxnType,
  categoryId: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE transactions SET amount = ?, type = ?, category_id = ? WHERE id = ?',
    amount,
    type,
    categoryId,
    id
  );
}
