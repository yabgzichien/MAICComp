// src/lib/streak.ts
// Pure recording-streak helper  pure motivation, NOT a credit signal. It counts
// consecutive days the user logged at least one transaction (any source, including
// manual), with a one-day grace so recording every other day keeps the streak alive.
//
// Distinct from `coverage` (lib/coverage.ts): coverage is the honest completeness signal
// that feeds the score and excludes manual entries; the streak only nudges the daily habit
// that improves coverage, so gaming it gains nothing.

export interface StreakInput {
  date?: string | null;
  createdAt: string;
  source?: string;
}

/** UTC day number (days since epoch) of an ISO date/datetime, or null. */
function utcDayNumber(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 86_400_000);
}

/**
 * Current recording streak: the length of the most recent run of active days where each
 * active day is within `graceDays + 1` of the previous one. Returns 0 if the most recent
 * activity is already older than that window (the streak has lapsed).
 */
export function computeStreak(txns: StreakInput[], now: Date = new Date(), graceDays = 1): number {
  const maxGap = graceDays + 1;
  const today = Math.floor(now.getTime() / 86_400_000);

  const days = new Set<number>();
  for (const tx of txns) {
    const d = utcDayNumber(tx.date) ?? utcDayNumber(tx.createdAt);
    if (d !== null && d <= today) days.add(d);
  }
  if (days.size === 0) return 0;

  const sorted = [...days].sort((a, b) => b - a); // most recent first
  if (today - sorted[0] > maxGap) return 0; // lapsed

  let streak = 1;
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (prev - sorted[i] <= maxGap) {
      streak++;
      prev = sorted[i];
    } else {
      break;
    }
  }
  return streak;
}
