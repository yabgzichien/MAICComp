// src/db/loansRepo.ts
import { genId, getDb } from './db';
import { installmentFor } from '../lib/loans';
import type { Decision, LoanDecision, LoanProduct } from '../lib/loans';
import type { DeclaredPurpose, PurposeCategory } from '../lib/loanPurpose';

// --- Status enums --------------------------------------------------------
// loan_applications.status: lifecycle of an application after a decision is recorded.
//   'active'     approved/referred and currently being repaid (or awaiting first repayment)
//   'completed'  all scheduled repayments paid off
//   'defaulted'  borrower failed to repay; reported as a default
export type ApplicationStatus = 'active' | 'completed' | 'defaulted';

// repayments.status: per-installment lifecycle.
//   'scheduled'  not yet due / not yet paid
//   'paid'       paid on or before the due date
//   'late'       paid after the due date
//   'missed'     a single installment the borrower skipped (dents the track record, does not
//                pay down the loan liability); distinct from a whole-loan 'defaulted'
//   'defaulted'  never paid; the application was reported as defaulted
export type RepaymentStatus = 'scheduled' | 'paid' | 'late' | 'missed' | 'defaulted';

// --- Row shapes (raw SQLite columns) -------------------------------------
interface ProductRow {
  id: string;
  label: string;
  min_score: number;
  min_amount: number;
  max_amount: number;
  tenor_months: number;
  apr: number;
}

interface ApplicationRow {
  id: string;
  product_id: string;
  requested_amount: number;
  decision: string;
  score_at: number;
  status: string;
  created_at: string;
  lender_label: string | null;
  liability_account_id: string | null;
  lender_id: string | null;
  defaulted_at: string | null;
  defaulted_source: string | null;
  purpose_category: string | null;
  purpose_note: string | null;
}

interface RepaymentRow {
  id: string;
  application_id: string;
  due_date: string;
  paid_on: string | null;
  amount: number;
  status: string;
}

// --- Domain shapes --------------------------------------------------------
export interface LoanApplication {
  id: string;
  productId: string;
  requestedAmount: number;
  decision: Decision;
  scoreAt: number;
  status: ApplicationStatus;
  createdAt: string;
  lenderLabel: string | null;
  /** The Net-worth liability account created when this loan was booked, so repayments can
   *  pay it down. Null for referred/declined applications and legacy rows. */
  liabilityAccountId: string | null;
  /** The registry lender id (Bidirectional Servicing Sync, 2026-07-18 design)  the id
   *  /api/servicing expects, distinct from lenderLabel's display name. Null for a
   *  self-decided (non-lender-routed) application, which never syncs. */
  lenderId: string | null;
  /** When/who raised the default flag, so a lender-reported default synced in from the
   *  console can be told apart from a locally-simulated one. Both null until defaulted. */
  defaultedAt: string | null;
  defaultedSource: 'lender' | 'borrower' | null;
  /** Why this loan was requested (My Financing polish, 2026-07-19)  the same declared
   *  purpose sent to the lender at apply time, now also kept locally so the loan list can
   *  show it. Null for loans booked before this shipped, or a self-decided application. */
  purpose: DeclaredPurpose | null;
}

export interface Repayment {
  id: string;
  applicationId: string;
  dueDate: string;
  paidOn: string | null;
  amount: number;
  status: RepaymentStatus;
}

/** Track-record tally for the credit-score "repayment history" factor (see `repaymentSummary`). */
export interface RepaymentSummary {
  onTime: number;
  total: number;
  /** Installments the borrower skipped  drives the borrowing-limit progression penalty. */
  missed: number;
}

// --- Row -> domain mappers -------------------------------------------------
function toProduct(r: ProductRow): LoanProduct {
  return {
    id: r.id,
    label: r.label,
    minScore: r.min_score,
    minAmount: r.min_amount,
    maxAmount: r.max_amount,
    tenorMonths: r.tenor_months,
    apr: r.apr,
  };
}

function toDecision(value: string): Decision {
  return value === 'approve' || value === 'refer' || value === 'decline' ? value : 'decline';
}

function toApplicationStatus(value: string): ApplicationStatus {
  return value === 'completed' || value === 'defaulted' ? value : 'active';
}

function toRepaymentStatus(value: string): RepaymentStatus {
  return value === 'paid' || value === 'late' || value === 'missed' || value === 'defaulted' ? value : 'scheduled';
}

function toDefaultedSource(value: string | null): 'lender' | 'borrower' | null {
  return value === 'lender' || value === 'borrower' ? value : null;
}

const PURPOSE_CATEGORIES_SET: ReadonlySet<string> = new Set(['stock', 'equipment', 'working-capital', 'emergency', 'education', 'other']);

function toPurpose(category: string | null, note: string | null): DeclaredPurpose | null {
  if (!category || !PURPOSE_CATEGORIES_SET.has(category)) return null;
  return { category: category as PurposeCategory, ...(note ? { note } : {}) };
}

function toApplication(r: ApplicationRow): LoanApplication {
  return {
    id: r.id,
    productId: r.product_id,
    requestedAmount: r.requested_amount,
    decision: toDecision(r.decision),
    scoreAt: r.score_at,
    status: toApplicationStatus(r.status),
    createdAt: r.created_at,
    lenderLabel: r.lender_label ?? null,
    liabilityAccountId: r.liability_account_id ?? null,
    lenderId: r.lender_id ?? null,
    defaultedAt: r.defaulted_at ?? null,
    defaultedSource: toDefaultedSource(r.defaulted_source ?? null),
    purpose: toPurpose(r.purpose_category ?? null, r.purpose_note ?? null),
  };
}

function toRepayment(r: RepaymentRow): Repayment {
  return {
    id: r.id,
    applicationId: r.application_id,
    dueDate: r.due_date,
    paidOn: r.paid_on,
    amount: r.amount,
    status: toRepaymentStatus(r.status),
  };
}

// --- Products --------------------------------------------------------------
// Seeding lives in db.ts's `init`/`resetAllData` (mirrors `seedCategories`'s
// placement) so the default ladder is inserted once at DB-open time, not on
// every store refresh.

export async function listProducts(): Promise<LoanProduct[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProductRow>(
    'SELECT id, label, min_score, min_amount, max_amount, tenor_months, apr FROM loan_products ORDER BY min_score ASC'
  );
  return rows.map(toProduct);
}

// --- Applications ----------------------------------------------------------

/**
 * Persist a loan application together with the decision that was made for it
 * (the engine's verdict, never recomputed from stored data) and a snapshot of
 * the score it was decided against. New applications start `status: 'active'`.
 */
export async function createApplication(
  productId: string,
  requestedAmount: number,
  decision: LoanDecision,
  scoreAt: number,
  lenderLabel: string | null = null,
  lenderId: string | null = null,
  purpose: DeclaredPurpose | null = null
): Promise<LoanApplication> {
  const db = await getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO loan_applications (id, product_id, requested_amount, decision, score_at, status, created_at, lender_label, lender_id, purpose_category, purpose_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    productId,
    requestedAmount,
    decision.decision,
    scoreAt,
    'active',
    createdAt,
    lenderLabel,
    lenderId,
    purpose?.category ?? null,
    purpose?.note ?? null
  );
  return {
    id,
    productId,
    requestedAmount,
    decision: decision.decision,
    scoreAt,
    status: 'active',
    createdAt,
    lenderLabel,
    liabilityAccountId: null,
    lenderId,
    defaultedAt: null,
    defaultedSource: null,
    purpose,
  };
}

/** Link a booked loan to the Net-worth liability account that represents it, so repayments
 *  can pay that account down as the borrower repays. */
export async function setLoanLiabilityAccount(applicationId: string, accountId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE loan_applications SET liability_account_id = ? WHERE id = ?', accountId, applicationId);
}

/**
 * Update an application's lifecycle status. Mirrors `markRepaymentPaid`'s thin-update idiom
 *  the caller decides the new status. Not used for 'defaulted'  see markApplicationDefaulted,
 * which also records provenance and gives the score its terminal hit.
 */
export async function markApplicationStatus(applicationId: string, status: ApplicationStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE loan_applications SET status = ? WHERE id = ?', status, applicationId);
}

/**
 * Mark a loan defaulted (Bidirectional Servicing Sync, 2026-07-18 design): a loan-level
 * terminal flag with provenance (`source`  who first raised it: this borrower's own
 * simulate-default beat, or a lender-reported default synced in from the console). A
 * monotonic latch at the DB layer too: the `AND defaulted_at IS NULL` guard makes a second
 * call a no-op, so the original `at`/`source` are never overwritten (mirrors the console's
 * own markDefault and mergeServicing's own latch rule).
 *
 * Every remaining 'scheduled' installment is marked 'missed' in the same transaction  a
 * defaulted loan will never collect them, so the score's track-record factor (which reads
 * every non-scheduled repayment via `repaymentSummary`) takes its honest terminal hit
 * immediately rather than waiting on installments that will never come due naturally.
 */
export async function markApplicationDefaulted(applicationId: string, source: 'lender' | 'borrower', at: string = new Date().toISOString()): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE loan_applications SET status = 'defaulted', defaulted_at = ?, defaulted_source = ? WHERE id = ? AND defaulted_at IS NULL",
      at,
      source,
      applicationId
    );
    await db.runAsync("UPDATE repayments SET status = 'missed', paid_on = NULL WHERE application_id = ? AND status = 'scheduled'", applicationId);
  });
}

/**
 * Set one repayment's outcome directly, keyed by outcome rather than a boolean (unlike
 * `markRepaymentPaid`/`markRepaymentMissed`)  used to apply a server-merged servicing event
 * verbatim (Bidirectional Servicing Sync, 2026-07-18 design), where the outcome (and its
 * timestamp) come from whichever side's write won the merge, not from "now".
 */
export async function setRepaymentOutcome(repaymentId: string, outcome: 'on-time' | 'late' | 'missed', at: string): Promise<void> {
  const db = await getDb();
  const status: RepaymentStatus = outcome === 'on-time' ? 'paid' : outcome === 'late' ? 'late' : 'missed';
  await db.runAsync('UPDATE repayments SET paid_on = ?, status = ? WHERE id = ?', outcome === 'missed' ? null : at, status, repaymentId);
}

/** Delete an application and every repayment row that belongs to it (lender-reset sync,
 *  2026-07-20): when the console this loan is routed to gets reset, the record disappears on
 *  that side, so the borrower's own copy has to go too or the two apps permanently disagree
 *  about whether the loan exists. Does NOT touch the linked liability account  the caller
 *  (which already owns accountsRepo) deletes that separately, the same separation of concerns
 *  `setLoanLiabilityAccount` draws between the two repos. */
export async function deleteApplication(applicationId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM repayments WHERE application_id = ?', applicationId);
    await db.runAsync('DELETE FROM loan_applications WHERE id = ?', applicationId);
  });
}

export async function listApplications(): Promise<LoanApplication[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ApplicationRow>(
    'SELECT id, product_id, requested_amount, decision, score_at, status, created_at, lender_label, liability_account_id, lender_id, defaulted_at, defaulted_source, purpose_category, purpose_note FROM loan_applications ORDER BY created_at DESC'
  );
  return rows.map(toApplication);
}

// --- Repayments -------------------------------------------------------------

/** Add `months` calendar months to an ISO 'YYYY-MM-DD' date, clamping to the target month's last day (handles e.g. Jan 31 + 1mo -> Feb 28). */
function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDayOfTargetMonth));
  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Generate and persist `tenorMonths` repayment rows for an approved application:
 * equal monthly installments (Task 1's `installmentFor`), due dates spaced one
 * calendar month apart starting one month after `startDate` (the disbursement
 * date), all `status: 'scheduled'` with `paid_on: null`. Wrapped in a single
 * transaction so the schedule is written atomically.
 */
export async function scheduleRepayments(
  applicationId: string,
  principal: number,
  apr: number,
  tenorMonths: number,
  startDate: string
): Promise<Repayment[]> {
  const db = await getDb();
  const amount = installmentFor(principal, apr, tenorMonths);
  const repayments: Repayment[] = [];
  await db.withTransactionAsync(async () => {
    for (let i = 1; i <= tenorMonths; i++) {
      const id = genId();
      const dueDate = addMonthsClamped(startDate, i);
      await db.runAsync(
        `INSERT INTO repayments (id, application_id, due_date, paid_on, amount, status)
         VALUES (?, ?, ?, NULL, ?, 'scheduled')`,
        id,
        applicationId,
        dueDate,
        amount
      );
      repayments.push({ id, applicationId, dueDate, paidOn: null, amount, status: 'scheduled' });
    }
  });
  return repayments;
}

/**
 * Persist a PRE-COMPUTED repayment schedule verbatim (a sibling of `scheduleRepayments`
 * that does NOT recompute installments): each row's `amount`/`dueDate` is written exactly
 * as given  used when booking an accepted lender offer, where the lender's decided
 * installment is authoritative and must not be re-derived from apr. All rows `status:
 * 'scheduled'` with `paid_on: null`, wrapped in a single transaction for atomicity.
 */
export async function insertSchedule(
  applicationId: string,
  rows: { dueDate: string; amount: number }[]
): Promise<Repayment[]> {
  const db = await getDb();
  const repayments: Repayment[] = [];
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const id = genId();
      await db.runAsync(
        `INSERT INTO repayments (id, application_id, due_date, paid_on, amount, status)
         VALUES (?, ?, ?, NULL, ?, 'scheduled')`,
        id,
        applicationId,
        row.dueDate,
        row.amount
      );
      repayments.push({ id, applicationId, dueDate: row.dueDate, paidOn: null, amount: row.amount, status: 'scheduled' });
    }
  });
  return repayments;
}

/**
 * Mark a repayment as paid. The caller decides on-time vs late (e.g. by comparing
 * to the current date or to the due date) and passes that verdict via `onTime`;
 * we store it as `status: 'paid' | 'late'` and set `paid_on` (defaults to now).
 */
export async function markRepaymentPaid(repaymentId: string, onTime: boolean, paidOn?: string): Promise<void> {
  const db = await getDb();
  const status: RepaymentStatus = onTime ? 'paid' : 'late';
  await db.runAsync(
    'UPDATE repayments SET paid_on = ?, status = ? WHERE id = ?',
    paidOn ?? new Date().toISOString(),
    status,
    repaymentId
  );
}

/** Mark a single installment as missed  a track-record negative that does NOT pay down the
 *  loan liability (the borrower skipped it). Distinct from a whole-loan default. */
export async function markRepaymentMissed(repaymentId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE repayments SET paid_on = NULL, status = 'missed' WHERE id = ?", repaymentId);
}

export async function listRepayments(applicationId?: string): Promise<Repayment[]> {
  const db = await getDb();
  const rows = applicationId
    ? await db.getAllAsync<RepaymentRow>(
        'SELECT id, application_id, due_date, paid_on, amount, status FROM repayments WHERE application_id = ? ORDER BY due_date ASC',
        applicationId
      )
    : await db.getAllAsync<RepaymentRow>(
        'SELECT id, application_id, due_date, paid_on, amount, status FROM repayments ORDER BY due_date ASC'
      );
  return rows.map(toRepayment);
}

/**
 * Track-record summary for the credit-score "repayment history" factor:
 * `total` = every repayment the borrower has resolved  paid on time, paid late, or MISSED,
 * `onTime` = the subset paid on or before their due date (status 'paid').
 * A missed installment counts against the borrower (in `total`, not `onTime`), so it lowers
 * the on-time ratio the score reads. Scheduled-but-not-yet-due repayments are excluded
 * they're not a track record yet.
 */
export async function repaymentSummary(): Promise<RepaymentSummary> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ on_time: number; total: number; missed: number }>(
    `SELECT
       SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS on_time,
       SUM(CASE WHEN status IN ('paid', 'late', 'missed') THEN 1 ELSE 0 END) AS total,
       SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) AS missed
     FROM repayments`
  );
  return { onTime: row?.on_time ?? 0, total: row?.total ?? 0, missed: row?.missed ?? 0 };
}
