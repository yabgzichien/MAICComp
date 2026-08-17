// src/db/splitRepo.ts
// Persistence for bill splitting: remembered people, splits, per-person shares, and the
// repayments received against them. Mirrors txnRepo's shape (row interfaces, `toX` mappers,
// withTransactionAsync for anything multi-row).
import { genId, getDb } from './db';
import { applyPayment } from '../lib/split';
import type {
  PaymentEvidence,
  Person,
  ShareStatus,
  Split,
  SplitDraft,
  SplitMethod,
  SplitPayment,
  SplitShare,
} from '../lib/types';

interface PersonRow {
  id: string;
  name: string;
  created_at: string;
}
interface SplitRow {
  id: string;
  txn_id: string;
  gross: number;
  own_share: number;
  method: string;
  created_at: string;
}
interface ShareRow {
  id: string;
  split_id: string;
  person_id: string;
  owed: number;
  paid: number;
  status: string;
  written_off_txn_id: string | null;
  created_at: string;
}
interface PaymentRow {
  id: string;
  share_id: string;
  amount: number;
  paid_on: string;
  evidence: string;
  matched_merchant: string | null;
  account_id: string | null;
  created_at: string;
}

function toPerson(r: PersonRow): Person {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}
function toSplit(r: SplitRow): Split {
  return {
    id: r.id,
    txnId: r.txn_id,
    gross: r.gross,
    ownShare: r.own_share,
    method: r.method as SplitMethod,
    createdAt: r.created_at,
  };
}
function toShare(r: ShareRow): SplitShare {
  return {
    id: r.id,
    splitId: r.split_id,
    personId: r.person_id,
    owed: r.owed,
    paid: r.paid,
    status: r.status as ShareStatus,
    writtenOffTxnId: r.written_off_txn_id,
    createdAt: r.created_at,
  };
}
function toPayment(r: PaymentRow): SplitPayment {
  return {
    id: r.id,
    shareId: r.share_id,
    amount: r.amount,
    paidOn: r.paid_on,
    evidence: r.evidence as PaymentEvidence,
    matchedMerchant: r.matched_merchant,
    accountId: r.account_id,
    createdAt: r.created_at,
  };
}

/* --- People -------------------------------------------------------------- */

export async function listPeople(): Promise<Person[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PersonRow>('SELECT * FROM people ORDER BY name COLLATE NOCASE ASC');
  return rows.map(toPerson);
}

/**
 * Get the person by this name, creating them on first use. Matched case-insensitively on the
 * trimmed name so "ali" and "Ali" stay one person rather than two piles of debt.
 */
export async function findOrCreatePerson(name: string): Promise<Person> {
  const db = await getDb();
  const trimmed = name.trim();
  const existing = await db.getFirstAsync<PersonRow>(
    'SELECT * FROM people WHERE name = ? COLLATE NOCASE LIMIT 1',
    trimmed
  );
  if (existing) return toPerson(existing);

  const person: Person = { id: genId(), name: trimmed, createdAt: new Date().toISOString() };
  await db.runAsync(
    'INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)',
    person.id,
    person.name,
    person.createdAt
  );
  return person;
}

/** Rename a person everywhere at once (shares point at the id, so nothing else moves). */
export async function renamePerson(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE people SET name = ? WHERE id = ?', name.trim(), id);
}

/* --- Splits -------------------------------------------------------------- */

export async function listSplits(): Promise<Split[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SplitRow>('SELECT * FROM splits ORDER BY created_at DESC');
  return rows.map(toSplit);
}

export async function listShares(): Promise<SplitShare[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ShareRow>('SELECT * FROM split_shares ORDER BY created_at ASC');
  return rows.map(toShare);
}

export async function listPayments(): Promise<SplitPayment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PaymentRow>('SELECT * FROM split_payments ORDER BY paid_on ASC, created_at ASC');
  return rows.map(toPayment);
}

/**
 * Attach a split to an already-saved transaction. The transaction carries `ownShare`; this
 * records the gross it was cut from and who owes the rest. Replaces any existing split on the
 * same transaction, so re-splitting from the edit sheet is idempotent rather than additive.
 */
export async function createSplit(txnId: string, draft: SplitDraft): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const splitId = genId();
  await db.withTransactionAsync(async () => {
    await deleteSplitRows(db, [txnId]);
    await db.runAsync(
      'INSERT INTO splits (id, txn_id, gross, own_share, method, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      splitId,
      txnId,
      draft.gross,
      draft.ownShare,
      draft.method,
      now
    );
    for (const share of draft.shares) {
      if (share.owed <= 0) continue; // nobody owes nothing; keep the table free of noise rows
      await db.runAsync(
        `INSERT INTO split_shares (id, split_id, person_id, owed, paid, status, written_off_txn_id, created_at)
         VALUES (?, ?, ?, ?, 0, 'open', NULL, ?)`,
        genId(),
        splitId,
        share.personId,
        share.owed,
        now
      );
    }
  });
}

/** Inner cascade, assumed to already be inside a transaction. */
async function deleteSplitRows(
  db: Awaited<ReturnType<typeof getDb>>,
  txnIds: string[]
): Promise<void> {
  if (txnIds.length === 0) return;
  const placeholders = txnIds.map(() => '?').join(',');
  const splits = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM splits WHERE txn_id IN (${placeholders})`,
    ...txnIds
  );
  if (splits.length === 0) return;
  const splitIds = splits.map((s) => s.id);
  const splitPlaceholders = splitIds.map(() => '?').join(',');
  await db.runAsync(
    `DELETE FROM split_payments WHERE share_id IN (
       SELECT id FROM split_shares WHERE split_id IN (${splitPlaceholders})
     )`,
    ...splitIds
  );
  await db.runAsync(`DELETE FROM split_shares WHERE split_id IN (${splitPlaceholders})`, ...splitIds);
  await db.runAsync(`DELETE FROM splits WHERE id IN (${splitPlaceholders})`, ...splitIds);
}

/** Drop the splits (and their shares and payments) belonging to these transactions. */
export async function deleteSplitsForTxns(txnIds: string[]): Promise<void> {
  if (txnIds.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await deleteSplitRows(db, txnIds);
  });
}

/* --- Settlement ---------------------------------------------------------- */

/**
 * Record money received against a share and roll the share forward. Returns what the share
 * became, so the caller can update the receivable without re-reading. Overpayment is capped by
 * `applyPayment`, and the capped figure is what gets stored, so the ledger never shows a friend
 * paying more than they owed.
 */
export async function recordPayment(
  shareId: string,
  amount: number,
  paidOn: string,
  evidence: PaymentEvidence,
  matchedMerchant: string | null,
  accountId: string | null
): Promise<{ paid: number; status: ShareStatus } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ShareRow>('SELECT * FROM split_shares WHERE id = ? LIMIT 1', shareId);
  if (!row) return null;

  const share = toShare(row);
  const next = applyPayment(share, amount);
  const applied = Math.round((next.paid - share.paid) * 100) / 100;
  if (applied <= 0) return next;

  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO split_payments (id, share_id, amount, paid_on, evidence, matched_merchant, account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      genId(),
      shareId,
      applied,
      paidOn,
      evidence,
      matchedMerchant,
      accountId,
      now
    );
    await db.runAsync('UPDATE split_shares SET paid = ?, status = ? WHERE id = ?', next.paid, next.status, shareId);
  });
  return next;
}

/**
 * Give up on a share. The caller has already written the expense transaction that the
 * uncollected money really was, and passes its id in so the write-off stays traceable.
 */
export async function writeOffShare(shareId: string, writtenOffTxnId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE split_shares SET status = 'written_off', written_off_txn_id = ? WHERE id = ?",
    writtenOffTxnId,
    shareId
  );
}
