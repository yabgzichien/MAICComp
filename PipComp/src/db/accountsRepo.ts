// src/db/accountsRepo.ts
import { genId, getDb } from './db';
import type { Account, AccountKind, BalanceEntry, PriceQuote } from '../lib/types';

interface AccountRow {
  id: string;
  name: string;
  kind: string;
  cls: string;
  archived: number;
  created_at: string;
  sub: string | null;
  symbol: string | null;
  ticker: string | null;
  quantity: number | null;
  cost: number | null;
}
interface EntryRow {
  id: string;
  account_id: string;
  value: number;
  as_of: string;
  created_at: string;
}
interface PriceRow {
  symbol: string;
  price_myr: number;
  change24: number | null;
  as_of: string;
}

function toAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind === 'liability' ? 'liability' : 'asset',
    cls: r.cls,
    archived: r.archived === 1,
    createdAt: r.created_at,
    sub: r.sub ?? null,
    symbol: r.symbol ?? null,
    ticker: r.ticker ?? null,
    quantity: r.quantity ?? null,
    cost: r.cost ?? null,
  };
}
function toEntry(r: EntryRow): BalanceEntry {
  return { id: r.id, accountId: r.account_id, value: r.value, asOf: r.as_of, createdAt: r.created_at };
}

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AccountRow>('SELECT * FROM accounts ORDER BY created_at ASC');
  return rows.map(toAccount);
}

export async function listBalanceEntries(): Promise<BalanceEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>('SELECT * FROM balance_entries ORDER BY as_of ASC, created_at ASC');
  return rows.map(toEntry);
}

/** Create an account and seed its opening balance entry. */
export async function addAccount(
  name: string,
  kind: AccountKind,
  cls: string,
  openingValue: number,
  asOf: string
): Promise<Account> {
  const db = await getDb();
  const id = genId();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO accounts (id, name, kind, cls, archived, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      id,
      name,
      kind,
      cls,
      now
    );
    await db.runAsync(
      'INSERT INTO balance_entries (id, account_id, value, as_of, created_at) VALUES (?, ?, ?, ?, ?)',
      genId(),
      id,
      openingValue,
      asOf,
      now
    );
  });
  return { id, name, kind, cls, archived: false, createdAt: now, sub: null, symbol: null, ticker: null, quantity: null, cost: null };
}

export async function updateAccount(id: string, fields: { name: string; cls: string }): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET name = ?, cls = ? WHERE id = ?', fields.name, fields.cls, id);
}

/** Delete an account and all of its balance history. */
export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM balance_entries WHERE account_id = ?', id);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
  });
}

/** Record a new dated balance reading for an account. */
export async function addBalanceEntry(accountId: string, value: number, asOf: string): Promise<BalanceEntry> {
  const db = await getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO balance_entries (id, account_id, value, as_of, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    accountId,
    value,
    asOf,
    createdAt
  );
  return { id, accountId, value, asOf, createdAt };
}

/** At most one balance entry per account per day (overwrites the day's value). */
export async function upsertDailyBalanceEntry(accountId: string, value: number, day: string): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM balance_entries WHERE account_id = ? AND as_of = ? LIMIT 1',
    accountId,
    day
  );
  if (existing) {
    await db.runAsync('UPDATE balance_entries SET value = ? WHERE id = ?', value, existing.id);
  } else {
    await addBalanceEntry(accountId, value, day);
  }
}

/** Create a live-priced investment holding (no opening balance entry  value is derived from price). */
export async function addHolding(
  name: string,
  sub: string,
  symbol: string,
  ticker: string,
  quantity: number,
  cost: number | null
): Promise<Account> {
  const db = await getDb();
  const id = genId();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO accounts (id, name, kind, cls, archived, created_at, sub, symbol, ticker, quantity, cost)
     VALUES (?, ?, 'asset', 'investments', 0, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    now,
    sub,
    symbol,
    ticker,
    quantity,
    cost
  );
  return { id, name, kind: 'asset', cls: 'investments', archived: false, createdAt: now, sub, symbol, ticker, quantity, cost };
}

/** Update a holding's quantity (e.g. after buying/selling more). */
export async function updateHoldingQuantity(id: string, quantity: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET quantity = ? WHERE id = ?', quantity, id);
}

/** Update a holding's invested amount (cost basis). */
export async function updateHoldingCost(id: string, cost: number | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET cost = ? WHERE id = ?', cost, id);
}

export async function getPriceCache(): Promise<PriceQuote[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PriceRow>('SELECT * FROM price_cache');
  return rows.map((r) => ({ symbol: r.symbol, priceMYR: r.price_myr, change24: r.change24, asOf: r.as_of }));
}

export async function upsertPrice(q: PriceQuote): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO price_cache (symbol, price_myr, change24, as_of) VALUES (?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET price_myr = excluded.price_myr, change24 = excluded.change24, as_of = excluded.as_of`,
    q.symbol,
    q.priceMYR,
    q.change24,
    q.asOf
  );
}
