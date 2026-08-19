// src/lib/commitments.ts
// Pure logic for user-declared recurring commitments (bills and DCA investment
// contributions): occurrence generation, month-end due-date clamping, and matching a tick
// against an existing ledger row instead of creating a duplicate. No UI/DB imports.
import { merchantKey } from './normalize';
import type { Repayment } from '../db/loansRepo';
import type { Transaction } from './types';

export type CommitmentKind = 'expense' | 'investment';
export type OccurrenceStatus = 'scheduled' | 'paid' | 'late' | 'skipped';

export interface Commitment {
  id: string;
  label: string;
  merchantKey: string;
  kind: CommitmentKind;
  amount: number;
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  /** 1..31. Clamped to the target month's last day, same rule as `addMonthsClamped`. */
  dueDay: number;
  startMonth: string; // 'YYYY-MM'
  endMonth: string | null; // 'YYYY-MM', null = open-ended
  archived: boolean;
  createdAt: string;
}

export interface CommitmentOccurrence {
  id: string;
  commitmentId: string;
  dueDate: string; // 'YYYY-MM-DD'
  month: string; // 'YYYY-MM'
  amount: number;
  paidAmount: number | null;
  paidOn: string | null;
  status: OccurrenceStatus;
  txnId: string | null;
  /** True when the ledger row was created by paying this occurrence (untick deletes it);
   *  false when it was matched to a transaction the user already had (untick only unlinks). */
  txnCreated: boolean;
  unitsAdded: number | null;
  priceMYR: number | null;
  createdAt: string;
}

export interface NewOccurrence {
  commitmentId: string;
  dueDate: string;
  month: string;
  amount: number;
}

/** How many months ahead of `fromMonth` to keep occurrences materialised. */
export const OCCURRENCE_HORIZON_MONTHS = 6;

/** A tick matches an existing transaction within this fraction of the expected amount. */
const MATCH_AMOUNT_TOLERANCE = 0.05;
/** A tick matches an existing transaction dated within this many days of the due date. */
const MATCH_DAY_WINDOW = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** First day of the next calendar month after `mk` ('YYYY-MM' -> 'YYYY-MM'). */
function nextMonthKey(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The due date for a given month and day-of-month, clamped to that month's last day
 *  (e.g. dueDay 31 in February -> the 28th/29th). */
export function clampToMonth(month: string, dueDay: number): string {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * Generate the occurrences a commitment should have from `fromMonth` through
 * `OCCURRENCE_HORIZON_MONTHS` months ahead (inclusive), bounded by `startMonth`/`endMonth`.
 * No backfill: a commitment created with an old `startMonth` never spawns a wall of overdue
 * occurrences, it only ever generates forward from wherever materialisation last reached.
 */
export function occurrencesFor(c: Commitment, fromMonth: string, monthsAhead: number = OCCURRENCE_HORIZON_MONTHS): NewOccurrence[] {
  const start = c.startMonth > fromMonth ? c.startMonth : fromMonth;
  const out: NewOccurrence[] = [];
  let month = start;
  for (let i = 0; i < monthsAhead; i++) {
    if (c.endMonth && month > c.endMonth) break;
    out.push({
      commitmentId: c.id,
      dueDate: clampToMonth(month, c.dueDay),
      month,
      amount: c.amount,
    });
    month = nextMonthKey(month);
  }
  return out;
}

/**
 * Find an already-saved transaction likely to BE this occurrence's payment, so ticking never
 * creates a duplicate of a row the user already logged (e.g. via a bank-statement import).
 * Looser than `findDuplicate` in duplicates.ts on purpose: that helper requires an exact amount
 * and exact day, which is right for de-duplicating a second scan of the same receipt, but wrong
 * here — a bill can post a few days either side of its due date and drift a little in amount.
 */
export function findCommitmentMatch(
  candidates: Transaction[],
  commitment: Commitment,
  dueDate: string,
  excludeTxnIds: ReadonlySet<string> = new Set()
): Transaction | null {
  const key = merchantKey(commitment.label);
  if (!key) return null;
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  for (const t of candidates) {
    if (excludeTxnIds.has(t.id)) continue;
    if (t.merchantKey !== key && t.merchantKey !== commitment.merchantKey) continue;
    if (Math.abs(t.amount - commitment.amount) > commitment.amount * MATCH_AMOUNT_TOLERANCE) continue;
    const d = t.date ?? t.createdAt.slice(0, 10);
    const dTime = new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime();
    if (Math.abs(dTime - due) > MATCH_DAY_WINDOW * MS_PER_DAY) continue;
    return t;
  }
  return null;
}

/**
 * Adapt occurrences into the `Repayment` shape so `repaymentStanding.ts`'s pure arrears engine
 * (`overdueRowsFor`, `standingBucketFor`, `curedArrearsEvents`) can be reused unchanged instead
 * of re-implementing months-in-arrears logic for commitments. `'skipped'` rows are dropped: a
 * bill the user marked as not applying that month carries no ongoing arrears obligation and no
 * on-time/late record either way.
 */
export function toArrearsRows(occurrences: CommitmentOccurrence[]): Repayment[] {
  return occurrences
    .filter((o): o is CommitmentOccurrence & { status: 'scheduled' | 'paid' | 'late' } => o.status !== 'skipped')
    .map((o) => ({
      id: o.id,
      applicationId: o.commitmentId,
      dueDate: o.dueDate,
      paidOn: o.paidOn,
      amount: o.amount,
      status: o.status,
    }));
}
