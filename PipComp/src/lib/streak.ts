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
 * Every distinct day the user logged on, most recent first, ignoring anything dated after
 * `today` (a mistyped year should not invent activity that has not happened yet).
 */
function activeDays(txns: StreakInput[], today: number): number[] {
  const days = new Set<number>();
  for (const tx of txns) {
    const d = utcDayNumber(tx.date) ?? utcDayNumber(tx.createdAt);
    if (d !== null && d <= today) days.add(d);
  }
  return [...days].sort((a, b) => b - a);
}

/**
 * The most recent day the user logged anything, as a UTC day number, or null if they never
 * have. Any source counts, manual included: this answers "when did they last touch the app's
 * ledger", which is what the reminder scheduler needs to decide whether to nudge.
 */
export function lastActiveDay(txns: StreakInput[], now: Date = new Date()): number | null {
  const today = Math.floor(now.getTime() / 86_400_000);
  const sorted = activeDays(txns, today);
  return sorted.length === 0 ? null : sorted[0];
}

/**
 * Current recording streak: the length of the most recent run of active days where each
 * active day is within `graceDays + 1` of the previous one. Returns 0 if the most recent
 * activity is already older than that window (the streak has lapsed).
 */
export function computeStreak(txns: StreakInput[], now: Date = new Date(), graceDays = 1): number {
  const maxGap = graceDays + 1;
  const today = Math.floor(now.getTime() / 86_400_000);

  const last = lastActiveDay(txns, now);
  if (last === null) return 0;
  if (today - last > maxGap) return 0; // lapsed

  const sorted = activeDays(txns, today); // most recent first

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

/**
 * 7-day activity tracker (e.g. for the Dashboard streak card and home screen widget).
 * Returns an array of 7 booleans [day-6, day-5, ..., today] indicating whether any transaction
 * was logged on each of the last 7 days.
 */
export function compute7DayDots(txns: StreakInput[], now: Date = new Date()): boolean[] {
  const active = new Set<string>();
  for (const t of txns) {
    const k = t.date ?? (t.createdAt ? t.createdAt.slice(0, 10) : null);
    if (k) active.add(k);
  }
  return [...Array(7)].map((_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return active.has(`${y}-${m}-${day}`);
  });
}

