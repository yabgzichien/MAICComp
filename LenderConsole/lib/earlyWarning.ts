// Post-disbursement early warning (Brief S). Pure diff between the at-approval passport (or
// most recent prior check-in) and a fresh check-in: income change, surplus change, coverage
// trend, momentum direction, repayment record delta. Threshold breaches produce flags with a
// severity and an evidence string. No UI, no engine changes  informs the officer only; a flag
// can never restructure, notify, or accelerate anything on its own.

import type { CreditPassport } from './passport';

export type FlagSeverity = 'watch' | 'critical';
export type FlagKey = 'income-drop' | 'surplus-erosion' | 'coverage-stagnation' | 'momentum-reversal' | 'repayment-decline';

export interface EarlyWarningFlag {
  key: FlagKey;
  severity: FlagSeverity;
  evidence: string;
}

export interface EarlyWarningResult {
  flags: EarlyWarningFlag[];
}

// Thresholds  named constants, one-line justification each.
/** Income erosion below this share reads as noise, not a signal. */
const INCOME_DROP_WATCH = 0.15;
/** Beyond this share of income lost, the loan needs officer attention now, not at the next check-in. */
const INCOME_DROP_CRITICAL = 0.3;
/** Surplus is the buffer against a missed installment; a quarter of it eroding is worth a look. */
const SURPLUS_EROSION_WATCH = 0.25;
/** Half the buffer gone (or worse) is the same order of severity as a material income drop. */
const SURPLUS_EROSION_CRITICAL = 0.5;
/** Coverage regressing by 10+ days suggests tracking has lapsed, not just a quiet week. */
const COVERAGE_STAGNATION_WATCH_DAYS = 10;
/** A 25+ day regression is consistent with the borrower having stopped tracking altogether. */
const COVERAGE_STAGNATION_CRITICAL_DAYS = 25;
/** An on-time ratio drop of 15+ percentage points is the first sign of repayment strain. */
const REPAYMENT_DECLINE_WATCH = 0.15;
/** A 30+ point drop is a pattern, not a one-off late payment. */
const REPAYMENT_DECLINE_CRITICAL = 0.3;

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;
const pct = (x: number): number => Math.round(x * 100);

/** Fractional drop from `from` to `to`, floored at 0 (a rise is never a "drop"). Requires a positive baseline. */
function pctDrop(from: number, to: number): number {
  if (from <= 0) return 0;
  return Math.max(0, (from - to) / from);
}

/**
 * Compare a check-in passport against the baseline (the at-approval file, or the most recent
 * prior check-in) and produce severity-graded flags with an evidence string each. Independent
 * per signal  a passport can carry any combination of flags, or none.
 */
export function diffCheckIn(baseline: CreditPassport, checkIn: CreditPassport): EarlyWarningResult {
  const flags: EarlyWarningFlag[] = [];
  const a0 = baseline.assessment;
  const a1 = checkIn.assessment;

  if (a0 && a1) {
    const incomeDrop = pctDrop(a0.avgIncome, a1.avgIncome);
    if (incomeDrop >= INCOME_DROP_CRITICAL) {
      flags.push({ key: 'income-drop', severity: 'critical', evidence: `Average income fell ${pct(incomeDrop)}% (${rm(a0.avgIncome)} → ${rm(a1.avgIncome)})` });
    } else if (incomeDrop >= INCOME_DROP_WATCH) {
      flags.push({ key: 'income-drop', severity: 'watch', evidence: `Average income fell ${pct(incomeDrop)}% (${rm(a0.avgIncome)} → ${rm(a1.avgIncome)})` });
    }

    const surplusTurnedNonPositive = a0.avgMonthlySurplus > 0 && a1.avgMonthlySurplus <= 0;
    const surplusDrop = pctDrop(a0.avgMonthlySurplus, a1.avgMonthlySurplus);
    if (surplusTurnedNonPositive || surplusDrop >= SURPLUS_EROSION_CRITICAL) {
      const evidence = surplusTurnedNonPositive
        ? `Average monthly surplus turned non-positive (${rm(a0.avgMonthlySurplus)} → ${rm(a1.avgMonthlySurplus)})`
        : `Average monthly surplus fell ${pct(surplusDrop)}% (${rm(a0.avgMonthlySurplus)} → ${rm(a1.avgMonthlySurplus)})`;
      flags.push({ key: 'surplus-erosion', severity: 'critical', evidence });
    } else if (surplusDrop >= SURPLUS_EROSION_WATCH) {
      flags.push({ key: 'surplus-erosion', severity: 'watch', evidence: `Average monthly surplus fell ${pct(surplusDrop)}% (${rm(a0.avgMonthlySurplus)} → ${rm(a1.avgMonthlySurplus)})` });
    }

    const coverageDrop = a0.coverageDays - a1.coverageDays;
    if (coverageDrop >= COVERAGE_STAGNATION_CRITICAL_DAYS) {
      flags.push({ key: 'coverage-stagnation', severity: 'critical', evidence: `Data coverage dropped ${coverageDrop} days (${a0.coverageDays}d → ${a1.coverageDays}d)  tracking may have stopped` });
    } else if (coverageDrop >= COVERAGE_STAGNATION_WATCH_DAYS) {
      flags.push({ key: 'coverage-stagnation', severity: 'watch', evidence: `Data coverage dropped ${coverageDrop} days (${a0.coverageDays}d → ${a1.coverageDays}d)` });
    }
  }

  // A reversal, not a level: only flags the transition into 'falling', never a persistently-falling trend.
  const baselineDirection = baseline.momentum?.direction;
  const checkInMomentum = checkIn.momentum;
  if (checkInMomentum && checkInMomentum.direction === 'falling' && baselineDirection !== 'falling') {
    flags.push({
      key: 'momentum-reversal',
      severity: 'watch',
      evidence: `Score momentum turned falling (${checkInMomentum.scoreFrom} → ${checkInMomentum.scoreTo} over ${checkInMomentum.lookbackDays}d)`,
    });
  }

  // Only meaningful once new repayments have actually been recorded since the baseline 
  // an unchanged record is not new information, however the ratio happens to read.
  const r0 = baseline.repaymentRecord;
  const r1 = checkIn.repaymentRecord;
  if (r0 && r1 && r1.total > r0.total && r1.total > 0) {
    const ratio0 = r0.total > 0 ? r0.onTime / r0.total : 1;
    const ratio1 = r1.onTime / r1.total;
    const drop = ratio0 - ratio1;
    if (drop >= REPAYMENT_DECLINE_CRITICAL) {
      flags.push({ key: 'repayment-decline', severity: 'critical', evidence: `On-time repayment ratio fell from ${pct(ratio0)}% to ${pct(ratio1)}% (${r1.onTime}/${r1.total})` });
    } else if (drop >= REPAYMENT_DECLINE_WATCH) {
      flags.push({ key: 'repayment-decline', severity: 'watch', evidence: `On-time repayment ratio fell from ${pct(ratio0)}% to ${pct(ratio1)}% (${r1.onTime}/${r1.total})` });
    }
  }

  return { flags };
}

export type MonitoringStatus = 'active' | 'expired' | 'not-granted';

/**
 * Tier 3 monitoring status read off a passport's own signed consent receipts. A lapsed grant
 * renders as 'expired', never as a silently-unmonitored loan  the officer always sees which
 * state applies.
 */
export function monitoringStatus(passport: CreditPassport, now: Date = new Date()): MonitoringStatus {
  const grant = passport.consent?.find((r) => r.tier === 3);
  if (!grant) return 'not-granted';
  return Date.parse(grant.expiresAt) < now.getTime() ? 'expired' : 'active';
}
