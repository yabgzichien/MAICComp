import type { ExtractedTxn } from './types';

const WEEKDAYS =['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** e.g. "Tuesday · 1 June" */
export function longDate(d: Date = new Date()): string {
  return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** e.g. "1 Jun"; accepts ISO date or datetime, empty string on bad input. */
export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** e.g. "1 Jun 2026"; accepts ISO date or datetime, empty string on bad input. */
export function fullDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Strict `YYYY-MM-DD` matcher — the only date-string shape this module rewrites. */
export const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True if `s` is a strict `YYYY-MM-DD` string AND a *genuinely* valid calendar date —
 * not just something `Date` parses via silent rollover (e.g. `new Date('2026-13-45')`
 * doesn't throw or produce `Invalid Date`, it rolls over to 2027-02-14). We guard
 * against that by round-tripping: construct the UTC date from the captured numbers
 * and verify the components survive unchanged.
 */
export function isValidIsoDate(s: string | null | undefined): boolean {
  if (!s) return false;
  const m = s.match(ISO_DATE_RE);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** Pull the 4-digit year out of a strict, *genuinely valid* `YYYY-MM-DD` string, or null. */
function yearOf(iso: string | null): number | null {
  if (!iso || !isValidIsoDate(iso)) return null;
  const m = iso.match(ISO_DATE_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Replace the year component of a strict `YYYY-MM-DD` string, keeping month/day. */
function withYear(iso: string, year: number): string {
  return `${String(year).padStart(4, '0')}${iso.slice(4)}`;
}

/**
 * Apply a user's edit to one transaction's date, with year-propagation:
 * receipts/screenshots are almost always one statement period, so if the user
 * corrects the *year* of one item, that correction is very likely true for the
 * whole batch — apply the new year (month/day untouched) to every other item
 * that has a parseable date.
 *
 * - The edited item gets `newDate` verbatim (year, month, day all replaced).
 * - Propagation only fires when the edited item's *original* date was a
 *   parseable `YYYY-MM-DD` string AND `newDate` is also parseable AND the
 *   year actually changed — with no original year, there's nothing to "change".
 * - Items with `date: null` or unparseable dates are left as-is (nothing to rewrite).
 * - Returns a new array; does not mutate `items`.
 */
export function applyDateEdit(items: ExtractedTxn[], editedIndex: number, newDate: string | null): ExtractedTxn[] {
  const original = items[editedIndex];
  const next = items.map((it, i) => (i === editedIndex ? { ...it, date: newDate } : { ...it }));

  const oldYear = original ? yearOf(original.date) : null;
  const newYear = yearOf(newDate);
  if (oldYear === null || newYear === null || oldYear === newYear) return next;

  for (let i = 0; i < next.length; i++) {
    if (i === editedIndex) continue;
    const d = next[i].date;
    if (d && isValidIsoDate(d)) {
      next[i] = { ...next[i], date: withYear(d, newYear) };
    }
  }
  return next;
}

/** True if the ISO date/datetime falls in the same calendar month as `now`. */
export function isThisMonth(iso?: string | null, now: Date = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Current month name, e.g. "June". */
export function monthName(now: Date = new Date()): string {
  return MONTHS[now.getMonth()];
}

/** A 'YYYY-MM' key as a readable label, e.g. "June 2026" (full=false → "Jun '26"). */
export function monthLabel(monthKey: string, full = true): string {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthKey;
  const year = m[1];
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return monthKey;
  return full ? `${MONTHS[idx]} ${year}` : `${MONTHS_SHORT[idx]} '${year.slice(2)}`;
}
