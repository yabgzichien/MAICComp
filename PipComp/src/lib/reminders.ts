// src/lib/reminders.ts
// Pure scheduling logic for the two local reminders: log your spending, and chase what you
// are owed. No Expo imports, no DB, no clock reads  every function takes `now` explicitly so
// the whole file is unit-testable the way the rest of src/lib is.
//
// Why a ladder of one-shot notifications rather than one repeating trigger:
//
//   1. The log reminder is suppressed when you already logged inside the current window, and
//      a repeating trigger fires blindly. Only a re-planned one-shot can skip a day.
//
// So the planner emits the next PLAN_HORIZON occurrences and the caller re-arms them every
// time the app comes to the foreground. That gives a week of coverage from the last time the
// app was opened, which is ample for a habit whose whole point is opening the app.

import { AGING_DAYS, type PersonDebt } from './split';
import { fmt } from './format';

export type ReminderCadence = 'off' | 'daily' | 'weekly';

/** Every accepted cadence, in the order the Settings pills render them. */
export const REMINDER_CADENCES: ReminderCadence[] = ['off', 'daily', 'weekly'];

/** Fixed fire time, 22:00 local. Late enough that the day's spending has happened. */
export const REMINDER_HOUR = 22;

/** The owed nudge sits five minutes later so the two never arrive on the same minute. */
export const OWED_REMINDER_MINUTE = 5;

/** How many future one-shots to keep armed. One week of daily cover. */
export const PLAN_HORIZON = 7;

/** How often to chase an unpaid friend once their debt has aged past `AGING_DAYS`. */
const OWED_CADENCE_DAYS = 7;

export const LOG_REMINDER_TITLE = 'Anything to log?';
export const OWED_REMINDER_TITLE = 'Still waiting on someone';

/** One scheduled reminder: when it fires and the copy baked in at scheduling time. */
export interface ReminderPlanEntry {
  at: Date;
  title: string;
  body: string;
}

/** Days between nudges, or null when the reminder is switched off. */
export function cadenceDays(cadence: ReminderCadence): number | null {
  switch (cadence) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    default:
      return null;
  }
}

/** Human label for the Settings pills. */
export function cadenceLabel(cadence: ReminderCadence): string {
  switch (cadence) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    default:
      return 'Off';
  }
}

/** True when `value` is a cadence this build understands. Guards what comes back out of app_meta. */
export function isReminderCadence(value: unknown): value is ReminderCadence {
  return typeof value === 'string' && (REMINDER_CADENCES as string[]).includes(value);
}

/**
 * Days since the local epoch for the calendar day `d` falls on in the device's own timezone.
 *
 * Local rather than UTC because the fire time is a wall-clock hour: at 22:00 in UTC+8 the UTC
 * date has not yet rolled over, so a UTC day number would put the evening nudge on the wrong
 * calendar day.
 */
export function localDayNumber(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** A local `Date` at `hour:minute` on the calendar day `dayNumber` identifies. */
function atLocalTime(dayNumber: number, hour: number, minute: number): Date {
  // Read the calendar date off the UTC instant, then rebuild through the local-time
  // constructor so the result lands at the wall-clock hour rather than the UTC hour.
  const utc = new Date(dayNumber * 86_400_000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), hour, minute, 0, 0);
}

/**
 * The first day on or after `startDay` whose fire time is strictly in the future, stepping in
 * whole cadences so the schedule stays on the same footing it was anchored to.
 */
function firstFutureDay(startDay: number, step: number, hour: number, minute: number, now: Date): number {
  let day = startDay;
  while (atLocalTime(day, hour, minute).getTime() <= now.getTime()) day += step;
  return day;
}

export interface LogReminderInput {
  cadence: ReminderCadence;
  /**
   * Day number of the last transaction the user logged, or null if they never have.
   *
   * Comes from `lastActiveDay` in lib/streak.ts, which counts in UTC days. For a row carrying
   * a `date` the two agree exactly, since a bare YYYY-MM-DD parses as UTC midnight of that
   * same calendar day. They can differ by one only for an undated row falling back to
   * `createdAt` that was written in the small hours, which at worst nudges a day early.
   */
  lastLoggedDay: number | null;
}

/**
 * When to nudge the user to log their spending.
 *
 * The anchor is the last day they logged, so logging pushes the next nudge a full cadence out.
 * That is the whole "skip if already logged" behaviour: on a daily cadence, logging today
 * moves tonight's nudge to tomorrow, and the caller re-plans on every foreground.
 *
 * A user who has never logged anything is anchored on today rather than nudged immediately.
 */
export function planLogReminders(input: LogReminderInput, now: Date): ReminderPlanEntry[] {
  const step = cadenceDays(input.cadence);
  if (step === null) return [];

  const today = localDayNumber(now);
  const anchor = input.lastLoggedDay ?? today;
  const first = firstFutureDay(anchor + step, step, REMINDER_HOUR, 0, now);

  const out: ReminderPlanEntry[] = [];
  for (let i = 0; i < PLAN_HORIZON; i++) {
    const day = first + i * step;
    // Each rung states the gap as it will actually stand on the evening it fires, not as it
    // stands now, so the last one in the ladder is not a week out of date when it arrives.
    const daysSince = input.lastLoggedDay === null ? null : day - input.lastLoggedDay;
    out.push({
      at: atLocalTime(day, REMINDER_HOUR, 0),
      title: LOG_REMINDER_TITLE,
      body: logReminderBody(daysSince),
    });
  }
  return out;
}

export interface OwedReminderInput {
  enabled: boolean;
  /** Age of the oldest unpaid bill across everyone, from `oldestOverdueDays` in lib/split.ts. */
  oldestOverdueDays: number;
  /** Who owes what, biggest first, from `groupOpenSharesByPerson`. */
  debts: PersonDebt[];
}

/**
 * When to nudge the user to chase a friend, weekly, and only once a debt has aged past
 * `AGING_DAYS`. Below that threshold it is still a favour rather than something to chase, and
 * the Owed screen does not call it overdue either.
 */
export function planOwedReminders(input: OwedReminderInput, now: Date): ReminderPlanEntry[] {
  if (!input.enabled) return [];
  if (input.oldestOverdueDays < AGING_DAYS) return [];
  if (input.debts.length === 0) return [];

  const first = firstFutureDay(
    localDayNumber(now),
    OWED_CADENCE_DAYS,
    REMINDER_HOUR,
    OWED_REMINDER_MINUTE,
    now
  );

  const out: ReminderPlanEntry[] = [];
  for (let i = 0; i < PLAN_HORIZON; i++) {
    const day = first + i * OWED_CADENCE_DAYS;
    out.push({
      at: atLocalTime(day, REMINDER_HOUR, OWED_REMINDER_MINUTE),
      title: OWED_REMINDER_TITLE,
      // Ages advance with each rung for the same reason the log ladder's do.
      body: owedReminderBody(input.debts, day - localDayNumber(now)),
    });
  }
  return out;
}

/** The log nudge's copy. `daysSince` is null when nothing has ever been logged. */
export function logReminderBody(daysSince: number | null): string {
  if (daysSince === null) {
    return 'You have not logged anything yet. Add your first transaction and I will start keeping track.';
  }
  if (daysSince <= 1) {
    return 'Nothing logged since yesterday. A minute now keeps your record honest.';
  }
  return `It has been ${daysSince} days since you logged anything. Your coverage is slipping.`;
}

// --- Recurring commitments (bills + DCA investments) ------------------------------------
//
// Unlike the log/owed ladders above, this is not one cadence stepped forward — it is a small,
// capped set of one-shot nudges re-derived from whatever is currently unresolved, so the same
// re-plan-on-foreground mechanism keeps it honest: paying a bill (or the month rolling over)
// drops it from the next sync without anything having to be explicitly cancelled.

export const COMMITMENT_DIGEST_TITLE = 'Bills this month';
export const COMMITMENT_OVERDUE_TITLE = 'Overdue';

/** How many months ahead to keep a digest armed for. */
const COMMITMENT_DIGEST_MONTHS = 3;
/** An overdue commitment is nudged this many days after its due date. */
const COMMITMENT_OVERDUE_DELAY_DAYS = 2;
/** Hard ceiling on individual overdue nudges — the OS caps total pending local notifications,
 *  and the log + owed ladders already use up to 14 of that budget between them. */
const COMMITMENT_OVERDUE_CAP = 5;

export interface CommitmentReminderRow {
  dueDate: string; // 'YYYY-MM-DD'
  amount: number;
  label: string;
  status: 'scheduled' | 'paid' | 'late' | 'skipped';
}

export interface CommitmentReminderInput {
  enabled: boolean;
  occurrences: CommitmentReminderRow[];
}

/** `dayNumber` for a plain 'YYYY-MM-DD' string, read as a local calendar date. */
function dayNumberOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return localDayNumber(new Date(y, m - 1, d, 12));
}

/** The next local `hour:minute` that is strictly after `now`, never earlier than `minDay` —
 *  a fire time that would otherwise land in the past is pushed to the next day's slot instead
 *  of being silently dropped, so a badly-overdue bill still gets a nudge on the next sync. */
function nextSlotOnOrAfter(minDay: number, hour: number, minute: number, now: Date): Date {
  let day = Math.max(minDay, localDayNumber(now));
  let at = atLocalTime(day, hour, minute);
  if (at.getTime() <= now.getTime()) {
    day += 1;
    at = atLocalTime(day, hour, minute);
  }
  return at;
}

/**
 * When to nudge about recurring commitments (bills and DCA contributions): one monthly digest
 * per month with anything still unpaid, plus one nudge per commitment that is currently overdue.
 * A 'paid'/'late'/'skipped' occurrence never generates a nudge — only 'scheduled' rows do, so
 * ticking a bill (or the app matching it to an existing transaction) retracts its reminder on
 * the next re-plan the same way logging a transaction retracts the log nudge.
 */
export function planCommitmentReminders(input: CommitmentReminderInput, now: Date): ReminderPlanEntry[] {
  if (!input.enabled) return [];
  const unresolved = input.occurrences.filter((o) => o.status === 'scheduled');
  if (unresolved.length === 0) return [];

  const today = localDayNumber(now);
  const out: ReminderPlanEntry[] = [];

  const byMonth = new Map<string, CommitmentReminderRow[]>();
  for (const o of unresolved) {
    const mk = o.dueDate.slice(0, 7);
    const rows = byMonth.get(mk);
    if (rows) rows.push(o);
    else byMonth.set(mk, [o]);
  }
  const months = [...byMonth.keys()].sort().slice(0, COMMITMENT_DIGEST_MONTHS);
  for (const mk of months) {
    const rows = byMonth.get(mk)!;
    const earliestDueDay = Math.min(...rows.map((r) => dayNumberOf(r.dueDate)));
    const at = nextSlotOnOrAfter(earliestDueDay - 1, REMINDER_HOUR, 0, now);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    out.push({
      at,
      title: COMMITMENT_DIGEST_TITLE,
      body: `${rows.length} bill${rows.length === 1 ? '' : 's'} due this month · RM ${fmt(total)}`,
    });
  }

  const overdue = unresolved
    .filter((o) => dayNumberOf(o.dueDate) < today)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .slice(0, COMMITMENT_OVERDUE_CAP);
  for (const o of overdue) {
    const at = nextSlotOnOrAfter(dayNumberOf(o.dueDate) + COMMITMENT_OVERDUE_DELAY_DAYS, REMINDER_HOUR, OWED_REMINDER_MINUTE, now);
    out.push({
      at,
      title: COMMITMENT_OVERDUE_TITLE,
      body: `${o.label} was due ${shortDaysAgo(dayNumberOf(o.dueDate), today)} · RM ${fmt(o.amount)}`,
    });
  }

  return out;
}

function shortDaysAgo(dueDay: number, today: number): string {
  const days = Math.max(0, today - dueDay);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * The owed nudge's copy, naming the biggest debt and counting the rest.
 *
 * `daysAhead` shifts every age forward to what it will be on the evening this fires, so a
 * reminder scheduled three weeks out does not arrive quoting today's number.
 */
export function owedReminderBody(debts: PersonDebt[], daysAhead = 0): string {
  if (debts.length === 0) return 'Nobody owes you anything right now.';

  const [top] = debts;
  const days = top.oldestDays + daysAhead;
  const lead = `${top.name} has owed you RM ${fmt(top.total)} for ${days} days.`;

  if (debts.length === 1) return `${lead} Worth a nudge.`;
  if (debts.length === 2) return `${lead} One other is waiting too.`;
  return `${lead} ${debts.length - 1} others are waiting too.`;
}
