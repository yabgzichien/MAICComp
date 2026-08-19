import {
  cadenceDays,
  cadenceLabel,
  isReminderCadence,
  localDayNumber,
  logReminderBody,
  owedReminderBody,
  OWED_REMINDER_MINUTE,
  planLogReminders,
  planOwedReminders,
  PLAN_HORIZON,
  REMINDER_HOUR,
  type ReminderCadence,
} from '../src/lib/reminders';
import { AGING_DAYS, type OpenShare, type PersonDebt } from '../src/lib/split';

/**
 * A local wall-clock instant. The planner deals in local calendar days and a local fire hour,
 * so every fixture here is built through the local-time constructor rather than an ISO string
 * (which would be parsed as UTC and skew the day boundary under a non-UTC TZ).
 */
function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 5, day, hour, minute, 0, 0); // June 2026
}

function debt(over: Partial<PersonDebt> = {}): PersonDebt {
  return { personId: 'p1', name: 'Ali', total: 42.5, shares: [], oldestDays: 20, ...over };
}

function share(over: Partial<OpenShare> = {}): OpenShare {
  return {
    shareId: 's1',
    personId: 'p1',
    personName: 'Ali',
    outstanding: 42.5,
    billDate: '2026-05-20',
    merchant: 'Kopitiam',
    ...over,
  };
}

describe('cadenceDays', () => {
  it('maps every cadence to its step in days', () => {
    expect(cadenceDays('daily')).toBe(1);
    expect(cadenceDays('weekly')).toBe(7);
  });

  it('returns null for off, which is what disables the whole plan', () => {
    expect(cadenceDays('off')).toBeNull();
  });
});

describe('cadenceLabel', () => {
  it('labels each cadence for the Settings pills', () => {
    expect(cadenceLabel('off')).toBe('Off');
    expect(cadenceLabel('daily')).toBe('Daily');
    expect(cadenceLabel('weekly')).toBe('Weekly');
  });
});

describe('isReminderCadence', () => {
  it('accepts the three known cadences', () => {
    expect(isReminderCadence('off')).toBe(true);
    expect(isReminderCadence('weekly')).toBe(true);
  });

  it('rejects anything a hand-edited app_meta row could hold', () => {
    expect(isReminderCadence('hourly')).toBe(false);
    expect(isReminderCadence('')).toBe(false);
    expect(isReminderCadence(null)).toBe(false);
    expect(isReminderCadence(undefined)).toBe(false);
    expect(isReminderCadence(7)).toBe(false);
  });
});

describe('localDayNumber', () => {
  it('gives consecutive days consecutive numbers', () => {
    expect(localDayNumber(at(11, 9)) - localDayNumber(at(10, 9))).toBe(1);
  });

  it('is stable across the hours of one local day', () => {
    expect(localDayNumber(at(10, 0, 1))).toBe(localDayNumber(at(10, 23, 59)));
  });
});

describe('planLogReminders', () => {
  const day10 = localDayNumber(at(10, 12));

  it('returns nothing when the reminder is off', () => {
    expect(planLogReminders({ cadence: 'off', lastLoggedDay: day10 }, at(10, 12))).toEqual([]);
  });

  it('pushes tonight past, to tomorrow, when you already logged today', () => {
    const plan = planLogReminders({ cadence: 'daily', lastLoggedDay: day10 }, at(10, 12));
    expect(plan[0].at).toEqual(at(11, REMINDER_HOUR));
  });

  it('fires tonight when you last logged days ago and it is not yet 10pm', () => {
    const plan = planLogReminders({ cadence: 'daily', lastLoggedDay: day10 - 3 }, at(10, 12));
    expect(plan[0].at).toEqual(at(10, REMINDER_HOUR));
  });

  it('rolls to tomorrow when tonight has already passed', () => {
    const plan = planLogReminders({ cadence: 'daily', lastLoggedDay: day10 - 3 }, at(10, 23));
    expect(plan[0].at).toEqual(at(11, REMINDER_HOUR));
  });

  it('rolls forward at exactly the fire time rather than scheduling in the past', () => {
    const plan = planLogReminders({ cadence: 'daily', lastLoggedDay: day10 - 3 }, at(10, REMINDER_HOUR));
    expect(plan[0].at).toEqual(at(11, REMINDER_HOUR));
  });

  it('anchors on today when nothing has ever been logged, rather than nudging immediately', () => {
    const plan = planLogReminders({ cadence: 'daily', lastLoggedDay: null }, at(10, 12));
    expect(plan[0].at).toEqual(at(11, REMINDER_HOUR));
  });

  it('spaces occurrences by the cadence', () => {
    const weekly = planLogReminders({ cadence: 'weekly', lastLoggedDay: day10 }, at(10, 12));
    expect(weekly[0].at).toEqual(at(17, REMINDER_HOUR));
    expect(weekly[1].at).toEqual(at(24, REMINDER_HOUR));
  });

  it('arms a full horizon, every entry in the future and on the hour', () => {
    const now = at(10, 12);
    for (const cadence of ['daily', 'weekly'] as ReminderCadence[]) {
      const plan = planLogReminders({ cadence, lastLoggedDay: day10 - 5 }, now);
      expect(plan).toHaveLength(PLAN_HORIZON);
      for (const entry of plan) {
        expect(entry.at.getTime()).toBeGreaterThan(now.getTime());
        expect(entry.at.getHours()).toBe(REMINDER_HOUR);
        expect(entry.at.getMinutes()).toBe(0);
      }
    }
  });

  it('ages the copy along the ladder so a later rung is not stale on arrival', () => {
    const plan = planLogReminders({ cadence: 'daily', lastLoggedDay: day10 }, at(10, 12));
    // Rung 0 fires the day after the last log, rung 6 fires seven days after it.
    expect(plan[0].body).toContain('since yesterday');
    expect(plan[6].body).toContain('7 days');
  });
});

describe('planOwedReminders', () => {
  const debts = [debt()];

  it('returns nothing when switched off', () => {
    expect(
      planOwedReminders({ enabled: false, oldestOverdueDays: 30, debts }, at(10, 12))
    ).toEqual([]);
  });

  it('stays quiet one day below the aging threshold', () => {
    expect(
      planOwedReminders({ enabled: true, oldestOverdueDays: AGING_DAYS - 1, debts }, at(10, 12))
    ).toEqual([]);
  });

  it('starts chasing exactly at the aging threshold', () => {
    const plan = planOwedReminders(
      { enabled: true, oldestOverdueDays: AGING_DAYS, debts },
      at(10, 12)
    );
    expect(plan).toHaveLength(PLAN_HORIZON);
  });

  it('returns nothing when nobody owes anything, whatever the age says', () => {
    expect(
      planOwedReminders({ enabled: true, oldestOverdueDays: 99, debts: [] }, at(10, 12))
    ).toEqual([]);
  });

  it('fires weekly, offset from the log reminder so they never collide', () => {
    const plan = planOwedReminders({ enabled: true, oldestOverdueDays: 30, debts }, at(10, 12));
    expect(plan[0].at).toEqual(at(10, REMINDER_HOUR, OWED_REMINDER_MINUTE));
    expect(plan[1].at).toEqual(at(17, REMINDER_HOUR, OWED_REMINDER_MINUTE));
    expect(plan[0].at.getMinutes()).toBe(OWED_REMINDER_MINUTE);
  });

  it('rolls to the next week when tonight has already passed', () => {
    const plan = planOwedReminders({ enabled: true, oldestOverdueDays: 30, debts }, at(10, 23));
    expect(plan[0].at).toEqual(at(17, REMINDER_HOUR, OWED_REMINDER_MINUTE));
  });
});

describe('logReminderBody', () => {
  it('invites a first entry when nothing has ever been logged', () => {
    expect(logReminderBody(null)).toContain('have not logged anything yet');
  });

  it('reads naturally at a one-day gap rather than saying "1 days"', () => {
    expect(logReminderBody(1)).toContain('since yesterday');
    expect(logReminderBody(1)).not.toContain('1 days');
  });

  it('counts the days once the gap has opened up', () => {
    expect(logReminderBody(5)).toContain('5 days');
  });
});

describe('owedReminderBody', () => {
  it('says nothing is outstanding when nobody owes you', () => {
    expect(owedReminderBody([])).toContain('Nobody owes you');
  });

  it('names the person, the amount, and the age for a single debt', () => {
    const body = owedReminderBody([debt({ name: 'Ali', total: 42.5, oldestDays: 20 })]);
    expect(body).toBe('Ali has owed you RM 42.50 for 20 days. Worth a nudge.');
  });

  it('counts one other in the singular', () => {
    expect(owedReminderBody([debt(), debt({ personId: 'p2', name: 'Siti' })])).toContain(
      'One other is waiting too'
    );
  });

  it('counts several others in the plural', () => {
    const many = [debt(), debt({ personId: 'p2' }), debt({ personId: 'p3' })];
    expect(owedReminderBody(many)).toContain('2 others are waiting too');
  });

  it('advances the age for a rung scheduled further out', () => {
    expect(owedReminderBody([debt({ oldestDays: 20 })], 7)).toContain('for 27 days');
  });

  it('ignores the share list, which it never reads', () => {
    const body = owedReminderBody([debt({ shares: [share(), share({ shareId: 's2' })] })]);
    expect(body).toContain('Ali has owed you');
  });
});
