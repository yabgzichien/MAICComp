import { merchantKey } from './normalize';
import type { Transaction } from './types';

export interface DupCandidate {
  merchant: string;
  amount: number;
  date: string | null;
}

/** Extract the YYYY-MM-DD day from an ISO date/datetime, or null. */
function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/**
 * Find an already-saved transaction that a freshly-extracted item is likely a
 * duplicate of. Rule (per user's choice): same normalized merchant, same amount,
 * and same day.
 *
 * - Amount is compared with a small epsilon to tolerate float noise.
 * - "Same day" uses the candidate's own date when present, otherwise `today`
 *   (the scan day) — an item with no readable date is assumed to be from today.
 * - A saved transaction's day is its `date` when present, else the day of `createdAt`.
 *
 * Returns the first matching transaction, or null.
 */
export function findDuplicate(
  saved: Transaction[],
  candidate: DupCandidate,
  today: string
): Transaction | null {
  const key = merchantKey(candidate.merchant);
  const candDay = dayOf(candidate.date) ?? today;
  for (const s of saved) {
    if (s.merchantKey !== key) continue;
    if (Math.abs(s.amount - candidate.amount) > 0.005) continue;
    const savedDay = dayOf(s.date) ?? dayOf(s.createdAt);
    if (savedDay && savedDay === candDay) return s;
  }
  return null;
}

/** Today's date as YYYY-MM-DD (local). */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
