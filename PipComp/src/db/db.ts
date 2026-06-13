import * as SQLite from 'expo-sqlite';
import { ALL_SEED_CATEGORIES, INCOME_SEED_IDS } from '../data/categories';
import { DEFAULT_PRODUCTS } from '../lib/loans';

const DB_NAME = 'pip.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open the database once, run migrations + seed, and cache the promise. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (
      id          TEXT PRIMARY KEY NOT NULL,
      label       TEXT NOT NULL,
      icon        TEXT NOT NULL,
      hue         INTEGER NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'expense',
      is_default  INTEGER NOT NULL DEFAULT 0,
      sort        INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id           TEXT PRIMARY KEY NOT NULL,
      merchant_raw TEXT NOT NULL,
      merchant_key TEXT NOT NULL,
      amount       REAL NOT NULL,
      currency     TEXT NOT NULL DEFAULT 'MYR',
      type         TEXT NOT NULL,
      txn_date     TEXT,
      category_id  TEXT,
      created_at   TEXT NOT NULL
      ,source       TEXT NOT NULL DEFAULT 'manual'
    );
    CREATE TABLE IF NOT EXISTS merchant_memory (
      merchant_key TEXT PRIMARY KEY NOT NULL,
      category_id  TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      expected_income REAL NOT NULL DEFAULT 0,
      updated_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_allocation (
      category_id  TEXT PRIMARY KEY NOT NULL,
      amount       REAL NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_advice (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      hash        TEXT NOT NULL,
      text        TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_snapshot (
      month        TEXT PRIMARY KEY NOT NULL,
      income       REAL NOT NULL,
      allocations  TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kyc (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      full_name    TEXT NOT NULL,
      nric_masked  TEXT NOT NULL,
      status       TEXT NOT NULL,
      provider     TEXT NOT NULL,
      verified_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key    TEXT PRIMARY KEY NOT NULL,
      value  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      cls         TEXT NOT NULL,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      sub         TEXT,
      symbol      TEXT,
      ticker      TEXT,
      quantity    REAL,
      cost        REAL
    );
    CREATE TABLE IF NOT EXISTS balance_entries (
      id          TEXT PRIMARY KEY NOT NULL,
      account_id  TEXT NOT NULL,
      value       REAL NOT NULL,
      as_of       TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_cache (
      symbol      TEXT PRIMARY KEY NOT NULL,
      price_myr   REAL NOT NULL,
      change24    REAL,
      as_of       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loan_products (
      id            TEXT PRIMARY KEY NOT NULL,
      label         TEXT NOT NULL,
      min_score     INTEGER NOT NULL,
      min_amount    REAL NOT NULL,
      max_amount    REAL NOT NULL,
      tenor_months  INTEGER NOT NULL,
      apr           REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loan_applications (
      id                TEXT PRIMARY KEY NOT NULL,
      product_id        TEXT NOT NULL,
      requested_amount  REAL NOT NULL,
      decision          TEXT NOT NULL,
      score_at          INTEGER NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repayments (
      id              TEXT PRIMARY KEY NOT NULL,
      application_id  TEXT NOT NULL,
      due_date        TEXT NOT NULL,
      paid_on         TEXT,
      amount          REAL NOT NULL,
      status          TEXT NOT NULL DEFAULT 'scheduled'
    );
    CREATE INDEX IF NOT EXISTS idx_txn_created ON transactions (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_balance_account ON balance_entries (account_id);
    CREATE INDEX IF NOT EXISTS idx_loan_app_status ON loan_applications (status);
    CREATE INDEX IF NOT EXISTS idx_repayment_application ON repayments (application_id);
  `);

  // Migration: add the `kind` column for databases created before income
  // categories existed. Throws "duplicate column" on fresh DBs — ignore.
  try {
    await db.execAsync("ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'");
  } catch {
    // column already present
  }

  // Migration: holding columns on `accounts` for live-priced investments.
  for (const col of ['sub TEXT', 'symbol TEXT', 'ticker TEXT', 'quantity REAL', 'cost REAL']) {
    try {
      await db.execAsync(`ALTER TABLE accounts ADD COLUMN ${col}`);
    } catch {
      // column already present
    }
  }

  // Migration: provenance source on transactions (data-confidence weighting).
  try {
    await db.execAsync("ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  } catch {
    // column already present
  }

  await ensureSeedCategories(db);
  await seedProducts(db);
  return db;
}

/**
 * Idempotently insert every default category (INSERT OR IGNORE keeps custom and
 * existing rows untouched) so upgrades pick up newly-added defaults — including
 * the income categories — then make sure income ids carry kind='income'.
 */
async function ensureSeedCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  await seedCategories(db);
}

/**
 * Insert every default category and fix up income kinds. Used both for the
 * idempotent startup seed (via ensureSeedCategories) and the full data reset
 * (where the categories table has just been emptied).
 */
async function seedCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  for (let i = 0; i < ALL_SEED_CATEGORIES.length; i++) {
    const c = ALL_SEED_CATEGORIES[i];
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, label, icon, hue, kind, is_default, sort) VALUES (?, ?, ?, ?, ?, 1, ?)',
      c.id,
      c.label,
      c.icon,
      c.hue,
      c.kind,
      i
    );
  }
  const placeholders = INCOME_SEED_IDS.map(() => '?').join(',');
  await db.runAsync(`UPDATE categories SET kind = 'income' WHERE id IN (${placeholders})`, ...INCOME_SEED_IDS);
}

/**
 * Idempotently insert the default loan product ladder (Task 1's DEFAULT_PRODUCTS)
 * via INSERT OR IGNORE keyed on `id`, mirroring `seedCategories`. Called once from
 * `init` (and again after `resetAllData` empties the table) so re-running on every
 * app start is safe and won't duplicate or clobber rows.
 */
async function seedProducts(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const p of DEFAULT_PRODUCTS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO loan_products (id, label, min_score, min_amount, max_amount, tenor_months, apr)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      p.label,
      p.minScore,
      p.minAmount,
      p.maxAmount,
      p.tenorMonths,
      p.apr
    );
  }
}

/**
 * Wipe every user table — transactions, learned merchants, the whole budget,
 * and all categories (custom + default) — then restore the default categories,
 * all in a single transaction. Used by the "Reset all data" action in Settings.
 */
export async function resetAllData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM transactions;
      DELETE FROM merchant_memory;
      DELETE FROM budget;
      DELETE FROM budget_allocation;
      DELETE FROM budget_advice;
      DELETE FROM budget_snapshot;
      DELETE FROM balance_entries;
      DELETE FROM accounts;
      DELETE FROM price_cache;
      DELETE FROM categories;
      DELETE FROM repayments;
      DELETE FROM loan_applications;
      DELETE FROM loan_products;
    `);
    await seedCategories(db);
    await seedProducts(db);
  });
}

/** Generate a short, collision-resistant id for rows. */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
