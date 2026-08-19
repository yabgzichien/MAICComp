// src/lib/commitmentRecord.ts
// How reliably the borrower has paid their own declared recurring commitments (bills + DCA
// contributions) on time. Pure, unit-tested, no UI/DB imports.
//
// IN-APP EVIDENCE ONLY, NOT A CREDIT SIGNAL. Like `savingsHabit.ts`, nothing here reaches
// `creditScore.ts`, `dataConfidence.ts`, `consentScopes.ts`, or any loan decision, and it must
// stay that way. A commitment's due date is a number the borrower set for themselves — unlike
// `detectObligations` in obligations.ts, which infers a recurring outflow's cadence from months
// of actual ledger history, nothing here is corroborated against independent evidence. Scoring
// it would reward setting an easy due date (the 28th, paid on the 1st, always "early"), which is
// exactly the kind of gameable signal the rest of this codebase is built to avoid. If this ever
// changes, it needs its own `ENGINE_VERSION` bump and a corroboration rule, not a quiet wiring-in
// here.
import type { CommitmentOccurrence } from './commitments';

export interface CommitmentRecord {
  onTime: number;
  late: number;
  skipped: number;
  /** onTime + late — the resolved-and-owed total the ratio is computed over. Excludes skipped
   *  occurrences, the same way a bill that never applied shouldn't count against you either. */
  total: number;
  /** 0 when `total` is 0, so an empty record reads as "nothing yet" rather than a false 100%. */
  onTimeRatio: number;
  /** Distinct calendar months with at least one resolved (paid/late/skipped) occurrence. */
  monthsObserved: number;
}

const EMPTY: CommitmentRecord = { onTime: 0, late: 0, skipped: 0, total: 0, onTimeRatio: 0, monthsObserved: 0 };

/** Tally on-time vs. late payment across every occurrence a commitment ever generated. */
export function computeCommitmentRecord(occurrences: CommitmentOccurrence[]): CommitmentRecord {
  if (occurrences.length === 0) return EMPTY;

  let onTime = 0;
  let late = 0;
  let skipped = 0;
  const months = new Set<string>();

  for (const o of occurrences) {
    if (o.status === 'paid') { onTime++; months.add(o.month); }
    else if (o.status === 'late') { late++; months.add(o.month); }
    else if (o.status === 'skipped') { skipped++; months.add(o.month); }
  }

  const total = onTime + late;
  return {
    onTime,
    late,
    skipped,
    total,
    onTimeRatio: total > 0 ? onTime / total : 0,
    monthsObserved: months.size,
  };
}
