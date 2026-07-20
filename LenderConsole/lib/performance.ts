// lib/performance.ts (Portfolio repayment performance, 2026-07-18 design)
// Pure: aligns the console's own repayment ledger (lib/applications.ts `repayments`,
// distinct from the passport's self-reported `repaymentRecord`) against a derived
// schedule, classifies per-loan status, and aggregates band-level cohort performance
// and portfolio economics. No new risk math  expected loss reuses securitization.ts's
// loanPD; this module only aligns and aggregates. No UI/DB imports.

import type { ApplicationRecord } from './applications';
import { mapBook, type BookLoan } from './portfolio';
import { loanPD, DEFAULT_ASSUMPTIONS, type CreditBand, type SecuritizationAssumptions } from './securitization';

/** Below this many loans, a cohort's rates render with a "small sample" tag rather than
 *  an authoritative percentage  a 1-loan cohort at 0% on-time reads as a crisis, not noise. */
export const SMALL_SAMPLE_MIN_LOANS = 3;

/** Whole calendar months elapsed from `from` to `now`, floored at 0. A month only counts
 *  once its day-of-month has been reached (a schedule's instalment falls due on the
 *  disbursement day-of-month each month, not on the 1st of the next month). */
export function monthsElapsed(from: string, now: Date): number {
  const start = new Date(from);
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

export type LoanPerfStatus = 'current' | 'late' | 'delinquent';

export interface LoanPerformance {
  status: LoanPerfStatus;
  tenorMonths: number;
  installment: number;
  dueCount: number;
  paidCount: number;
  missedCount: number;
  amountDue: number;
  amountCollected: number;
}

/**
 * Per-loan schedule + status. Classification: any missed instalment is delinquent
 * regardless of behind-count (catching back up on payments does not erase a default
 * event); otherwise two or more instalments behind is delinquent, exactly one is late,
 * and zero is current.
 */
export function loanPerformance(b: BookLoan, now: Date = new Date()): LoanPerformance {
  const tenorMonths = b.loan.tenorMonths;
  const installment = b.app.installment;
  const start = b.app.resolvedAt ?? b.app.filedAt;
  const dueCount = Math.min(tenorMonths, monthsElapsed(start, now));
  const events = b.app.repayments ?? [];
  const paidCount = events.filter((e) => e.outcome !== 'missed').length;
  const missedCount = events.filter((e) => e.outcome === 'missed').length;
  const amountCollected = events.reduce((s, e) => s + e.amount, 0);
  const amountDue = dueCount * installment;
  const behind = Math.max(0, dueCount - paidCount);
  const status: LoanPerfStatus = missedCount > 0 || behind >= 2 ? 'delinquent' : behind === 1 ? 'late' : 'current';
  return { status, tenorMonths, installment, dueCount, paidCount, missedCount, amountDue, amountCollected };
}

/** Interest collected to date, assuming straight-line (non-amortizing) principal
 *  repayment: principal/tenorMonths repaid per instalment paid. Whatever was actually
 *  collected beyond that straight-line principal share is interest. Floored at 0 so a
 *  behind-schedule loan (collected less than its principal share) never reads negative. */
function interestCollectedFor(b: BookLoan, perf: LoanPerformance): number {
  if (perf.tenorMonths <= 0) return 0;
  const principalShare = b.loan.principal * (perf.paidCount / perf.tenorMonths);
  return Math.max(0, perf.amountCollected - principalShare);
}

/** Outstanding principal remaining after `paidCount` instalments, straight-line: each paid
 *  instalment retires an equal principal/tenorMonths slice (mirrors PipComp's own
 *  outstandingAfter  the two are kept in sync so the console and the borrower app agree on
 *  what a loan's remaining balance is). Rounded to whole RM to match how loan amounts are
 *  otherwise displayed here. */
function outstandingAfter(principal: number, tenorMonths: number, paidCount: number): number {
  if (tenorMonths <= 0) return 0;
  const remaining = Math.max(0, tenorMonths - Math.max(0, paidCount));
  return Math.round((principal * remaining) / tenorMonths);
}

/**
 * The realized-loss amount one loan contributes. A defaulted loan is a realized loss of its
 * ENTIRE remaining unpaid balance (nothing more will ever be collected on it), not just the
 * instalments individually flagged missed  so this is `outstandingAfter` at the point of
 * default, not `missedCount * installment`. A non-defaulted loan keeps the existing
 * missed-instalments-only measure (a loan can be delinquent without being a realized loss
 * yet  it may still catch up).
 */
function realizedLossAmountFor(b: BookLoan, perf: LoanPerformance): number {
  if (b.app.defaulted?.value) return outstandingAfter(b.loan.principal, perf.tenorMonths, perf.paidCount);
  return perf.missedCount * perf.installment;
}

export interface CohortRow {
  band: CreditBand;
  loanCount: number;
  exposure: number;
  onTimeRate: number; // 0..1, share of recorded repayment events that were on-time
  collectionRate: number; // 0..1, amount collected / amount due to date
  expectedLossRate: number; // 0..1, from securitization's band PD × LGD (fraud-neutral)
  realizedLossRate: number; // 0..1, (missed scheduled amount + defaulted loans' outstanding principal) / band exposure
  smallSample: boolean;
}

export interface PerformanceDashboard {
  bands: CohortRow[];
  totalExposure: number;
  loanCount: number;
  onTimeRate: number;
  collectionRate: number;
  expectedLossRate: number;
  realizedLossRate: number;
  interestCollected: number;
  /** False when no repayment event has ever been recorded on any approved loan  the
   *  dashboard must show an honest empty state, never zeroed-out rates as if they were data. */
  hasRepaymentData: boolean;
}

const BAND_ORDER: CreditBand[] = ['Building', 'Fair', 'Good', 'Strong', 'Excellent'];

function aggregateCohort(rows: { b: BookLoan; perf: LoanPerformance }[], a: SecuritizationAssumptions): Omit<CohortRow, 'band' | 'smallSample'> {
  const exposure = rows.reduce((s, r) => s + r.b.loan.principal, 0);
  const totalDue = rows.reduce((s, r) => s + r.perf.amountDue, 0);
  const totalCollected = rows.reduce((s, r) => s + r.perf.amountCollected, 0);
  const onTimeEvents = rows.reduce((s, r) => s + r.perf.paidCount - (r.b.app.repayments ?? []).filter((e) => e.outcome === 'late').length, 0);
  const totalEvents = rows.reduce((s, r) => s + (r.b.app.repayments ?? []).length, 0);
  const missedAmount = rows.reduce((s, r) => s + realizedLossAmountFor(r.b, r.perf), 0);
  const band = rows[0]?.b.loan.band ?? 'Building';
  return {
    loanCount: rows.length,
    exposure,
    onTimeRate: totalEvents > 0 ? onTimeEvents / totalEvents : 0,
    collectionRate: totalDue > 0 ? totalCollected / totalDue : 0,
    expectedLossRate: loanPD(band, 0, a) * a.lgd,
    realizedLossRate: exposure > 0 ? missedAmount / exposure : 0,
  };
}

/** Build the full Performance dashboard from the applications store: per-band cohort
 *  performance plus portfolio-wide rollups and realized interest collected. */
export function buildPerformance(
  apps: ApplicationRecord[],
  now: Date = new Date(),
  assumptions: SecuritizationAssumptions = DEFAULT_ASSUMPTIONS,
): PerformanceDashboard {
  const book = mapBook(apps);
  const rows = book.map((b) => ({ b, perf: loanPerformance(b, now) }));

  const byBand = new Map<CreditBand, { b: BookLoan; perf: LoanPerformance }[]>();
  for (const r of rows) {
    const list = byBand.get(r.b.loan.band) ?? [];
    list.push(r);
    byBand.set(r.b.loan.band, list);
  }

  const bands: CohortRow[] = BAND_ORDER.filter((band) => byBand.has(band)).map((band) => {
    const list = byBand.get(band)!;
    const agg = aggregateCohort(list, assumptions);
    return { band, smallSample: list.length < SMALL_SAMPLE_MIN_LOANS, ...agg };
  });

  const totalExposure = rows.reduce((s, r) => s + r.b.loan.principal, 0);
  const totalDue = rows.reduce((s, r) => s + r.perf.amountDue, 0);
  const totalCollected = rows.reduce((s, r) => s + r.perf.amountCollected, 0);
  const totalEvents = rows.reduce((s, r) => s + (r.b.app.repayments ?? []).length, 0);
  const totalOnTime = rows.reduce((s, r) => s + (r.b.app.repayments ?? []).filter((e) => e.outcome === 'on-time').length, 0);
  const totalMissedAmount = rows.reduce((s, r) => s + realizedLossAmountFor(r.b, r.perf), 0);
  const interestCollected = rows.reduce((s, r) => s + interestCollectedFor(r.b, r.perf), 0);
  const weightedExpectedLoss =
    totalExposure > 0 ? rows.reduce((s, r) => s + loanPD(r.b.loan.band, 0, assumptions) * assumptions.lgd * r.b.loan.principal, 0) / totalExposure : 0;

  return {
    bands,
    totalExposure,
    loanCount: rows.length,
    onTimeRate: totalEvents > 0 ? totalOnTime / totalEvents : 0,
    collectionRate: totalDue > 0 ? totalCollected / totalDue : 0,
    expectedLossRate: weightedExpectedLoss,
    realizedLossRate: totalExposure > 0 ? totalMissedAmount / totalExposure : 0,
    interestCollected,
    hasRepaymentData: totalEvents > 0,
  };
}

export interface SettledSummary {
  count: number;
  principalReturned: number;
  /** Always 0 in practice  a missed instalment permanently blocks paidCount from ever
   *  reaching tenorMonths, so "settled" and "zero realized loss" coincide by
   *  construction. Computed honestly anyway rather than hardcoded, so this stays true if
   *  that invariant ever changes. */
  realizedLossRate: number;
}

/**
 * The "fully repaid" cohort  loans excluded from live exposure (lib/portfolio.ts) once
 * settled, but kept here deliberately: this is the validation loop's strongest evidence,
 * "N loans, RM x returned, zero loss", and buildPerformance's own aggregates (unlike
 * portfolio.ts) intentionally still include settled loans for exactly this reason.
 */
export function settledSummary(apps: ApplicationRecord[]): SettledSummary {
  const settled = mapBook(apps).filter((b) => {
    const perf = loanPerformance(b);
    return perf.tenorMonths > 0 && perf.paidCount >= perf.tenorMonths;
  });
  const principalReturned = settled.reduce((s, b) => s + b.loan.principal, 0);
  const missedAmount = settled.reduce((s, b) => {
    const perf = loanPerformance(b);
    return s + perf.missedCount * perf.installment;
  }, 0);
  return {
    count: settled.length,
    principalReturned,
    realizedLossRate: principalReturned > 0 ? missedAmount / principalReturned : 0,
  };
}
