// src/db/commitmentsRepo.ts
import { genId, getDb } from './db';
import { currentMonthKey } from '../lib/budget';
import { occurrencesFor, type Commitment, type CommitmentKind, type CommitmentOccurrence, type OccurrenceStatus } from '../lib/commitments';

// --- Row shapes (raw SQLite columns) ---------------------------------------
interface CommitmentRow {
  id: string;
  label: string;
  merchant_key: string;
  kind: string;
  amount: number;
  category_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  due_day: number;
  start_month: string;
  end_month: string | null;
  archived: number;
  created_at: string;
}

interface OccurrenceRow {
  id: string;
  commitment_id: string;
  due_date: string;
  month: string;
  amount: number;
  paid_amount: number | null;
  paid_on: string | null;
  status: string;
  txn_id: string | null;
  txn_created: number;
  units_added: number | null;
  price_myr: number | null;
  created_at: string;
}

function toCommitment(r: CommitmentRow): Commitment {
  return {
    id: r.id,
    label: r.label,
    merchantKey: r.merchant_key,
    kind: r.kind === 'investment' ? 'investment' : 'expense',
    amount: r.amount,
    categoryId: r.category_id,
    fromAccountId: r.from_account_id,
    toAccountId: r.to_account_id,
    dueDay: r.due_day,
    startMonth: r.start_month,
    endMonth: r.end_month,
    archived: !!r.archived,
    createdAt: r.created_at,
  };
}

function toOccurrence(r: OccurrenceRow): CommitmentOccurrence {
  return {
    id: r.id,
    commitmentId: r.commitment_id,
    dueDate: r.due_date,
    month: r.month,
    amount: r.amount,
    paidAmount: r.paid_amount,
    paidOn: r.paid_on,
    status: (r.status as OccurrenceStatus) ?? 'scheduled',
    txnId: r.txn_id,
    txnCreated: !!r.txn_created,
    unitsAdded: r.units_added,
    priceMYR: r.price_myr,
    createdAt: r.created_at,
  };
}

// --- Commitments ------------------------------------------------------------

export interface NewCommitment {
  label: string;
  merchantKey: string;
  kind: CommitmentKind;
  amount: number;
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  dueDay: number;
  startMonth: string;
  endMonth?: string | null;
}

export async function listCommitments(): Promise<Commitment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CommitmentRow>('SELECT * FROM commitments ORDER BY created_at DESC');
  return rows.map(toCommitment);
}

export async function addCommitment(input: NewCommitment): Promise<Commitment> {
  const db = await getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO commitments
       (id, label, merchant_key, kind, amount, category_id, from_account_id, to_account_id, due_day, start_month, end_month, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    id,
    input.label,
    input.merchantKey,
    input.kind,
    input.amount,
    input.categoryId,
    input.fromAccountId,
    input.toAccountId,
    input.dueDay,
    input.startMonth,
    input.endMonth ?? null,
    createdAt
  );
  return {
    id,
    label: input.label,
    merchantKey: input.merchantKey,
    kind: input.kind,
    amount: input.amount,
    categoryId: input.categoryId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    dueDay: input.dueDay,
    startMonth: input.startMonth,
    endMonth: input.endMonth ?? null,
    archived: false,
    createdAt,
  };
}

export async function updateCommitment(
  id: string,
  patch: Partial<Pick<Commitment, 'label' | 'amount' | 'categoryId' | 'fromAccountId' | 'toAccountId' | 'dueDay' | 'endMonth'>>
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.label !== undefined) { fields.push('label = ?'); values.push(patch.label); }
  if (patch.amount !== undefined) { fields.push('amount = ?'); values.push(patch.amount); }
  if (patch.categoryId !== undefined) { fields.push('category_id = ?'); values.push(patch.categoryId); }
  if (patch.fromAccountId !== undefined) { fields.push('from_account_id = ?'); values.push(patch.fromAccountId); }
  if (patch.toAccountId !== undefined) { fields.push('to_account_id = ?'); values.push(patch.toAccountId); }
  if (patch.dueDay !== undefined) { fields.push('due_day = ?'); values.push(patch.dueDay); }
  if (patch.endMonth !== undefined) { fields.push('end_month = ?'); values.push(patch.endMonth); }
  if (fields.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE commitments SET ${fields.join(', ')} WHERE id = ?`, ...(values as any[]));
}

/** Archiving stops future occurrence generation; past occurrences and their paid history stay
 *  intact, so a discontinued bill still counts toward the on-time record. */
export async function archiveCommitment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE commitments SET archived = 1 WHERE id = ?', id);
}

/** Deletes the commitment and every occurrence it ever generated. Does not touch any linked
 *  transaction — the ledger row belongs to the user's Activity history regardless of whether
 *  the commitment that produced it still exists. */
export async function deleteCommitment(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM commitment_occurrences WHERE commitment_id = ?', id);
    await db.runAsync('DELETE FROM commitments WHERE id = ?', id);
  });
}

// --- Occurrences --------------------------------------------------------------

export async function listOccurrences(): Promise<CommitmentOccurrence[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OccurrenceRow>('SELECT * FROM commitment_occurrences ORDER BY due_date ASC');
  return rows.map(toOccurrence);
}

/**
 * Materialise occurrences for every non-archived commitment from the current month through
 * `OCCURRENCE_HORIZON_MONTHS` ahead. `INSERT OR IGNORE` against the (commitment_id, due_date)
 * unique index makes this idempotent — safe to call on every foreground/refresh without
 * duplicating rows already generated by a previous call.
 */
export async function ensureOccurrences(now: Date = new Date()): Promise<void> {
  const db = await getDb();
  const commitments = await listCommitments();
  const fromMonth = currentMonthKey(now);
  await db.withTransactionAsync(async () => {
    for (const c of commitments) {
      if (c.archived) continue;
      for (const occ of occurrencesFor(c, fromMonth)) {
        const id = genId();
        const createdAt = new Date().toISOString();
        await db.runAsync(
          `INSERT OR IGNORE INTO commitment_occurrences
             (id, commitment_id, due_date, month, amount, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`,
          id,
          occ.commitmentId,
          occ.dueDate,
          occ.month,
          occ.amount,
          createdAt
        );
      }
    }
  });
}

/**
 * Insert one occurrence verbatim at whatever due date/status/history an import provides,
 * bypassing the normal forward-only materialisation window in `occurrencesFor` — a re-imported
 * commitment's on-time record depends on its past months surviving exactly as they were, not
 * being regenerated as fresh 'scheduled' rows. `INSERT OR IGNORE` against the (commitment_id,
 * due_date) unique index makes re-importing the same file a no-op the second time.
 */
export async function insertOccurrence(
  commitmentId: string,
  occ: { dueDate: string; amount: number; status: OccurrenceStatus; paidOn: string | null; paidAmount: number | null }
): Promise<void> {
  const db = await getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO commitment_occurrences
       (id, commitment_id, due_date, month, amount, status, paid_on, paid_amount, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    commitmentId,
    occ.dueDate,
    occ.dueDate.slice(0, 7),
    occ.amount,
    occ.status,
    occ.paidOn,
    occ.paidAmount,
    createdAt
  );
}

export interface OccurrencePayment {
  paidAmount: number;
  paidOn: string;
  status: 'paid' | 'late';
  txnId: string | null;
  txnCreated: boolean;
  unitsAdded?: number | null;
  priceMYR?: number | null;
}

export async function markOccurrencePaid(id: string, payment: OccurrencePayment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE commitment_occurrences
       SET paid_amount = ?, paid_on = ?, status = ?, txn_id = ?, txn_created = ?, units_added = ?, price_myr = ?
     WHERE id = ?`,
    payment.paidAmount,
    payment.paidOn,
    payment.status,
    payment.txnId,
    payment.txnCreated ? 1 : 0,
    payment.unitsAdded ?? null,
    payment.priceMYR ?? null,
    id
  );
}

/** Reset a paid/late occurrence back to scheduled — the untick half of `markOccurrencePaid`. */
export async function resetOccurrence(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE commitment_occurrences
       SET paid_amount = NULL, paid_on = NULL, status = 'scheduled', txn_id = NULL, txn_created = 0, units_added = NULL, price_myr = NULL
     WHERE id = ?`,
    id
  );
}

export async function skipOccurrence(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE commitment_occurrences SET status = 'skipped' WHERE id = ?", id);
}

/** Resolve a DCA contribution's units once a price becomes available after the tick — the
 *  holding had no cached quote yet (offline, first run), so only `cost` moved at pay time. */
export async function setOccurrenceUnits(id: string, unitsAdded: number, priceMYR: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE commitment_occurrences SET units_added = ?, price_myr = ? WHERE id = ?',
    unitsAdded,
    priceMYR,
    id
  );
}

export async function getOccurrence(id: string): Promise<CommitmentOccurrence | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<OccurrenceRow>('SELECT * FROM commitment_occurrences WHERE id = ?', id);
  return row ? toOccurrence(row) : null;
}
