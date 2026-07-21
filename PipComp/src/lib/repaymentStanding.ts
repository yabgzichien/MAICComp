// Pure, deterministic repayment-standing engine — months-in-arrears, amount overdue, and a
// decaying historical scar, computed from the existing repayments ledger. No new storage: a
// row's dueDate/status gives current standing; a row's paidOn lagging its dueDate is the only
// available historical signal for the scar, since rows are mutated in place, not appended.
// No UI/DB imports — unit-tested.
import type { Repayment } from '../db/loansRepo';
import type { AdverseRecord } from './loans';

export type StandingBucket = 'clean' | 'slipping' | 'arrears' | 'impaired';

export interface LoanStanding {
  applicationId: string;
  monthsInArrears: number;
  amountOverdue: number;
  bucket: StandingBucket;
}

export interface CuredArrearsEvent {
  applicationId: string;
  dueDate: string;
  paidOn: string;
  monthsLate: number;
}

export interface StandingScar {
  bucket: StandingBucket;
  reachedMonthsAgo: number;
}

export interface RepaymentStanding {
  current: {
    bucket: StandingBucket;
    adverseRecord: AdverseRecord;
    monthsInArrears: number;
    amountOverdue: number;
  };
  scar: StandingScar | null;
  discountEligible: boolean;
}

const SCAR_WINDOW_MONTHS = 12;

const RESOLVED_STATUSES: ReadonlySet<Repayment['status']> = new Set(['paid', 'late']);

/** Whole calendar months elapsed from `from` to `to`, floored at 0 (mirrors the console's own
 *  `monthsElapsed` in lib/performance.ts — a month only counts once its day-of-month is reached). */
function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

export function standingBucketFor(monthsInArrears: number): StandingBucket {
  if (monthsInArrears <= 0) return 'clean';
  if (monthsInArrears === 1) return 'slipping';
  if (monthsInArrears === 2) return 'arrears';
  return 'impaired';
}

export function adverseRecordFor(bucket: StandingBucket): AdverseRecord {
  if (bucket === 'clean') return 'none';
  if (bucket === 'impaired') return 'hard';
  return 'soft';
}

const BUCKET_RANK: Record<StandingBucket, number> = { clean: 0, slipping: 1, arrears: 2, impaired: 3 };

/** Rows past their due date that are not yet resolved (paid or late) — each one is one month behind. */
export function overdueRowsFor(repayments: Repayment[], now: Date): Repayment[] {
  return repayments.filter((r) => !RESOLVED_STATUSES.has(r.status) && new Date(r.dueDate).getTime() <= now.getTime());
}

/**
 * One loan's current arrears state as of `now`. A formally-defaulted application (the
 * `loan_applications.status` flag, distinct from a single missed row) is impaired outright:
 * `markApplicationDefaulted` bulk-flips every remaining row to 'missed' immediately, including
 * ones not yet due, so counting only overdue rows would under-report a declared default.
 */
export function loanStandingFor(
  applicationId: string,
  repayments: Repayment[],
  defaulted: boolean,
  now: Date = new Date()
): LoanStanding {
  if (defaulted) {
    const amountOverdue = repayments.reduce((s, r) => s + (RESOLVED_STATUSES.has(r.status) ? 0 : r.amount), 0);
    return { applicationId, monthsInArrears: 3, amountOverdue, bucket: 'impaired' };
  }
  const overdue = overdueRowsFor(repayments, now);
  const monthsInArrears = overdue.length;
  const amountOverdue = overdue.reduce((s, r) => s + r.amount, 0);
  return { applicationId, monthsInArrears, amountOverdue, bucket: standingBucketFor(monthsInArrears) };
}

/** Worst current standing across every one of the borrower's loans. A loan with nothing
 *  overdue never worsens the result, so settled loans are safe to include unfiltered. */
export function currentStandingAcross(
  loans: { applicationId: string; repayments: Repayment[]; defaulted: boolean }[],
  now: Date = new Date()
): LoanStanding {
  let worst: LoanStanding | null = null;
  for (const loan of loans) {
    const s = loanStandingFor(loan.applicationId, loan.repayments, loan.defaulted, now);
    if (!worst || BUCKET_RANK[s.bucket] > BUCKET_RANK[worst.bucket]) worst = s;
  }
  return worst ?? { applicationId: '', monthsInArrears: 0, amountOverdue: 0, bucket: 'clean' };
}

/** Past, now-resolved arrears events: any row paid a whole month or more after its due date.
 *  Re-derived from the paidOn/dueDate columns already on the row — no separate log needed. */
export function curedArrearsEvents(applicationId: string, repayments: Repayment[]): CuredArrearsEvent[] {
  const events: CuredArrearsEvent[] = [];
  for (const r of repayments) {
    if (!RESOLVED_STATUSES.has(r.status) || !r.paidOn) continue;
    const monthsLate = monthsBetween(new Date(r.dueDate), new Date(r.paidOn));
    if (monthsLate >= 1) events.push({ applicationId, dueDate: r.dueDate, paidOn: r.paidOn, monthsLate });
  }
  return events;
}

/** The worst scar across every loan's cured-arrears history, still inside the trailing
 *  12-month window as of `now`. Null once nothing qualifies (clean history, or the last
 *  qualifying event has aged out) — matches CCRIS's own rolling 12-month factual record. */
export function scarAcross(
  loans: { applicationId: string; repayments: Repayment[] }[],
  now: Date = new Date()
): StandingScar | null {
  let worst: StandingScar | null = null;
  for (const loan of loans) {
    for (const ev of curedArrearsEvents(loan.applicationId, loan.repayments)) {
      const monthsAgo = monthsBetween(new Date(ev.paidOn), now);
      if (monthsAgo >= SCAR_WINDOW_MONTHS) continue;
      const bucket = standingBucketFor(ev.monthsLate);
      const better =
        !worst ||
        BUCKET_RANK[bucket] > BUCKET_RANK[worst.bucket] ||
        (BUCKET_RANK[bucket] === BUCKET_RANK[worst.bucket] && monthsAgo < worst.reachedMonthsAgo);
      if (better) worst = { bucket, reachedMonthsAgo: monthsAgo };
    }
  }
  return worst;
}

/** Top-level entry point: current standing + scar + discount eligibility across every loan
 *  the borrower has. Discount eligibility follows the locked table — clean or slipping (month
 *  0-1) keeps the loyalty discount; arrears or worse (month 2+) loses it until cured. */
export function computeRepaymentStanding(
  loans: { applicationId: string; repayments: Repayment[]; defaulted: boolean }[],
  now: Date = new Date()
): RepaymentStanding {
  const cur = currentStandingAcross(loans, now);
  const scar = scarAcross(
    loans.map((l) => ({ applicationId: l.applicationId, repayments: l.repayments })),
    now
  );
  return {
    current: {
      bucket: cur.bucket,
      adverseRecord: adverseRecordFor(cur.bucket),
      monthsInArrears: cur.monthsInArrears,
      amountOverdue: cur.amountOverdue,
    },
    scar,
    discountEligible: cur.bucket === 'clean' || cur.bucket === 'slipping',
  };
}
