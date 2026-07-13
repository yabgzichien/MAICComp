// src/db/loansRepo.ts
import { genId, getDb } from './db';
import { installmentFor } from '../lib/loans';
import type { Decision, LoanDecision, LoanProduct } from '../lib/loans';

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
//   'defaulted'  never paid; the application was reported as defaulted
export type RepaymentStatus = 'scheduled' | 'paid' | 'late' | 'defaulted';

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
  return value === 'paid' || value === 'late' || value === 'defaulted' ? value : 'scheduled';
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
  scoreAt: number
): Promise<LoanApplication> {
  const db = await getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO loan_applications (id, product_id, requested_amount, decision, score_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    productId,
    requestedAmount,
    decision.decision,
    scoreAt,
    'active',
    createdAt
  );
  return {
    id,
    productId,
    requestedAmount,
    decision: decision.decision,
    scoreAt,
    status: 'active',
    createdAt,
  };
}

/**
 * Update an application's lifecycle status (e.g. when a default is reported).
 * Mirrors `markRepaymentPaid`'s thin-update idiom  the caller decides the new status.
 */
export async function markApplicationStatus(applicationId: string, status: ApplicationStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE loan_applications SET status = ? WHERE id = ?', status, applicationId);
}

export async function listApplications(): Promise<LoanApplication[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ApplicationRow>(
    'SELECT id, product_id, requested_amount, decision, score_at, status, created_at FROM loan_applications ORDER BY created_at DESC'
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
 * `total` = every repayment that has actually been paid (status 'paid' or 'late'),
 * `onTime` = the subset of those paid on or before their due date (status 'paid').
 * Scheduled-but-not-yet-due repayments are excluded  they're not a track record yet.
 */
export async function repaymentSummary(): Promise<RepaymentSummary> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ on_time: number; total: number }>(
    `SELECT
       SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS on_time,
       SUM(CASE WHEN status IN ('paid', 'late') THEN 1 ELSE 0 END) AS total
     FROM repayments`
  );
  return { onTime: row?.on_time ?? 0, total: row?.total ?? 0 };
}
