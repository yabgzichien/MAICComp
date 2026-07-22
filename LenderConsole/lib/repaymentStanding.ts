// Pure, deterministic repayment-standing engine, ported from PipComp/src/lib/repaymentStanding.ts.
// Current standing uses the same due-count-minus-paid-count arithmetic performance.ts's
// loanPerformance already computes (reusing monthsElapsed, not reimplementing it). The scar
// differs from the borrower-app port: ApplicationRecord.repayments is genuinely append-only
// (never edited or removed, see applications.ts), so the scar replays the full event history
// to find the true historical peak, rather than inferring it from a paidOn/dueDate lag. No new
// storage, no UI imports.

import type { ApplicationRecord, RepaymentEvent } from './applications';
import { monthsElapsed } from './performance';
import type { AdverseRecord } from './loans';
import type { CreditPassport } from './passport';
import type { StoredPolicy } from './policyStore';

export type StandingBucket = 'clean' | 'slipping' | 'arrears' | 'impaired';

export interface LoanStanding {
  applicationId: string;
  monthsInArrears: number;
  amountOverdue: number;
  bucket: StandingBucket;
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

function paidCount(events: RepaymentEvent[]): number {
  return events.filter((e) => e.outcome !== 'missed').length;
}

/**
 * One loan's current arrears state as of `now`. A formally-defaulted application is impaired
 * outright (mirrors the borrower-app port's same special case for its own default flag), with
 * amountOverdue derived from every instalment not yet paid, capped at the loan's tenor.
 */
export function loanStandingFor(app: ApplicationRecord, tenorMonths: number, now: Date = new Date()): LoanStanding {
  const applicationId = app.id;
  const events = app.repayments ?? [];
  if (app.defaulted?.value) {
    const remaining = Math.max(0, tenorMonths - paidCount(events));
    return { applicationId, monthsInArrears: 3, amountOverdue: remaining * app.installment, bucket: standingBucketFor(3) };
  }
  const start = app.resolvedAt ?? app.filedAt;
  const dueCount = Math.min(tenorMonths, monthsElapsed(start, now));
  const monthsInArrears = Math.max(0, dueCount - paidCount(events));
  const amountOverdue = monthsInArrears * app.installment;
  return { applicationId, monthsInArrears, amountOverdue, bucket: standingBucketFor(monthsInArrears) };
}

/** Worst current standing across every application this passport subject has at this lender. */
export function currentStandingAcross(
  loans: { app: ApplicationRecord; tenorMonths: number }[],
  now: Date = new Date()
): LoanStanding {
  let worst: LoanStanding | null = null;
  for (const { app, tenorMonths } of loans) {
    const s = loanStandingFor(app, tenorMonths, now);
    if (!worst || BUCKET_RANK[s.bucket] > BUCKET_RANK[worst.bucket]) worst = s;
  }
  return worst ?? { applicationId: '', monthsInArrears: 0, amountOverdue: 0, bucket: 'clean' };
}

/** Replay one loan's append-only event history to find the worst "due minus paid" it ever
 *  reached, and when. Returns null if the loan was never behind. An on-time event is credited
 *  BEFORE its arrears snapshot is taken (it closed its instalment right on schedule, so it
 *  never opened a gap); a late event is credited AFTER (it was overdue up until the moment it
 *  landed, so that moment's snapshot must still see the gap it was closing). A missed event is
 *  never credited. */
function peakBehindOverTime(app: ApplicationRecord, tenorMonths: number): { bucket: StandingBucket; at: Date } | null {
  const start = app.resolvedAt ?? app.filedAt;
  const events = [...(app.repayments ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  let paidSoFar = 0;
  let peak: { bucket: StandingBucket; at: Date } | null = null;
  for (const e of events) {
    const at = new Date(e.at);
    if (e.outcome === 'on-time') paidSoFar++;
    const dueCount = Math.min(tenorMonths, monthsElapsed(start, at));
    const behind = Math.max(0, dueCount - paidSoFar);
    const bucket = standingBucketFor(behind);
    if (bucket !== 'clean' && (!peak || BUCKET_RANK[bucket] > BUCKET_RANK[peak.bucket])) peak = { bucket, at };
    if (e.outcome === 'late') paidSoFar++;
  }
  return peak;
}

/** The worst scar across every loan, still inside the trailing 12-month window as of `now`. */
export function scarAcross(
  loans: { app: ApplicationRecord; tenorMonths: number }[],
  now: Date = new Date()
): StandingScar | null {
  let worst: StandingScar | null = null;
  for (const { app, tenorMonths } of loans) {
    const peak = peakBehindOverTime(app, tenorMonths);
    if (!peak) continue;
    const monthsAgo = monthsElapsed(peak.at.toISOString(), now);
    if (monthsAgo >= SCAR_WINDOW_MONTHS) continue;
    if (!worst || BUCKET_RANK[peak.bucket] > BUCKET_RANK[worst.bucket]) worst = { bucket: peak.bucket, reachedMonthsAgo: monthsAgo };
  }
  return worst;
}

/** Top-level entry point, mirroring the borrower-app port's signature and semantics. */
export function computeRepaymentStanding(
  loans: { app: ApplicationRecord; tenorMonths: number }[],
  now: Date = new Date()
): RepaymentStanding {
  const cur = currentStandingAcross(loans, now);
  const scar = scarAcross(loans, now);
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

/** Worst-of the passport's own signed standing (arrears at other lenders) and this lender's
 *  own applications (arrears at THIS lender, computed from ApplicationRecord.repayments — the
 *  console's own real ledger). Mirrors the anti-stacking presentment check's "prefer signed
 *  cross-party evidence, but also check local state" pattern. */
export function mergedStanding(passport: CreditPassport, ownApplications: ApplicationRecord[], stored: StoredPolicy): RepaymentStanding {
  const ownLoans = ownApplications
    .filter((a) => a.subject === passport.subject && a.status === 'approved')
    .map((a) => {
      const tenorMonths = stored.products.find((p) => p.label === a.tierLabel)?.tenorMonths ?? 12;
      return { app: a, tenorMonths };
    });
  const ownStanding = computeRepaymentStanding(ownLoans);
  const BUCKET_RANK: Record<StandingBucket, number> = { clean: 0, slipping: 1, arrears: 2, impaired: 3 };
  const passportBucket: StandingBucket = passport.standing?.current.bucket ?? 'clean';
  const current = BUCKET_RANK[ownStanding.current.bucket] >= BUCKET_RANK[passportBucket] ? ownStanding.current : passport.standing!.current;

  // Merge scars independently of which side's CURRENT bucket won: a clean-today own book (e.g.
  // a single perfectly-paid loan) must not erase a worse historical scar signed into the
  // passport from another lender -- the scar is meant to stay visible for its own 12-month
  // window regardless of who currently looks worse.
  const passportScar = passport.standing?.scar ?? null;
  const scar =
    !ownStanding.scar ? passportScar
    : !passportScar ? ownStanding.scar
    : BUCKET_RANK[ownStanding.scar.bucket] !== BUCKET_RANK[passportScar.bucket]
      ? (BUCKET_RANK[ownStanding.scar.bucket] > BUCKET_RANK[passportScar.bucket] ? ownStanding.scar : passportScar)
      : (ownStanding.scar.reachedMonthsAgo <= passportScar.reachedMonthsAgo ? ownStanding.scar : passportScar);

  return {
    current,
    scar,
    discountEligible: current.bucket === 'clean' || current.bucket === 'slipping',
  };
}
