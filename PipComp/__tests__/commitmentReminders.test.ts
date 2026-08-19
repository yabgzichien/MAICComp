import { planCommitmentReminders, REMINDER_HOUR, type CommitmentReminderRow } from '../src/lib/reminders';

/** A local wall-clock instant, matching reminders.test.ts's convention. */
function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 5, day, hour, minute, 0, 0); // June 2026
}

function row(over: Partial<CommitmentReminderRow> = {}): CommitmentReminderRow {
  return { dueDate: '2026-06-20', amount: 100, label: 'Maxis', status: 'scheduled', ...over };
}

describe('planCommitmentReminders', () => {
  it('returns nothing when disabled', () => {
    expect(planCommitmentReminders({ enabled: false, occurrences: [row()] }, at(1, 8))).toEqual([]);
  });

  it('returns nothing when there is nothing unresolved', () => {
    const occs = [row({ status: 'paid' }), row({ status: 'skipped' })];
    expect(planCommitmentReminders({ enabled: true, occurrences: occs }, at(1, 8))).toEqual([]);
  });

  it('never generates a nudge for a paid, late, or skipped row', () => {
    // 'late' still counts as resolved for reminder purposes  it already happened.
    const occs = [row({ status: 'paid' }), row({ status: 'late' }), row({ status: 'skipped' })];
    expect(planCommitmentReminders({ enabled: true, occurrences: occs }, at(1, 8))).toEqual([]);
  });

  it('emits one digest for a month with unpaid bills, the evening before the earliest due date', () => {
    const occs = [row({ dueDate: '2026-06-20', amount: 100 }), row({ dueDate: '2026-06-25', amount: 50, label: 'Astro' })];
    const plan = planCommitmentReminders({ enabled: true, occurrences: occs }, at(1, 8));
    expect(plan).toHaveLength(1);
    expect(plan[0].title).toBe('Bills this month');
    expect(plan[0].body).toBe('2 bills due this month · RM 150.00');
    expect(plan[0].at).toEqual(at(19, REMINDER_HOUR, 0));
  });

  it('caps the digest at 3 months ahead', () => {
    const occs = [
      row({ dueDate: '2026-06-05' }),
      row({ dueDate: '2026-07-05' }),
      row({ dueDate: '2026-08-05' }),
      row({ dueDate: '2026-09-05' }),
    ];
    const plan = planCommitmentReminders({ enabled: true, occurrences: occs }, at(1, 8));
    expect(plan.filter((p) => p.title === 'Bills this month')).toHaveLength(3);
  });

  it('does not schedule a digest fire time in the past  the sync just missed the "day before"', () => {
    // Due date is today; "day before" already elapsed, so the digest should still land in the
    // future (today's remaining slot, or tomorrow), never silently drop.
    const occs = [row({ dueDate: '2026-06-10' })];
    const plan = planCommitmentReminders({ enabled: true, occurrences: occs }, at(10, 8));
    expect(plan[0].at.getTime()).toBeGreaterThan(at(10, 8).getTime());
  });

  it('emits an overdue nudge 2 days after a scheduled row\'s due date has passed', () => {
    // Due yesterday (the 5th), checked on the morning of the 6th: +2 days (the 7th) is still
    // ahead of "now", so the nudge lands exactly there rather than being clamped to today.
    const occs = [row({ dueDate: '2026-06-05', label: 'Maxis', amount: 89 })];
    const plan = planCommitmentReminders({ enabled: true, occurrences: occs }, at(6, 8));
    const overdue = plan.find((p) => p.title === 'Overdue');
    expect(overdue).toBeDefined();
    expect(overdue!.at).toEqual(at(7, REMINDER_HOUR, 5));
    expect(overdue!.body).toContain('Maxis');
    expect(overdue!.body).toContain('RM 89.00');
  });

  it('pushes a badly-overdue nudge to the next future slot instead of the elapsed +2-day one', () => {
    const occs = [row({ dueDate: '2026-06-01' })]; // 9 days overdue by the 10th
    const plan = planCommitmentReminders({ enabled: true, occurrences: occs }, at(10, 8));
    const overdue = plan.find((p) => p.title === 'Overdue');
    expect(overdue!.at.getTime()).toBeGreaterThan(at(10, 8).getTime());
  });

  it('caps overdue nudges at 5', () => {
    const occs = Array.from({ length: 8 }, (_, i) => row({ dueDate: `2026-06-0${(i % 9) + 1}`, label: `Bill ${i}` }));
    const plan = planCommitmentReminders({ enabled: true, occurrences: occs }, at(15, 8));
    expect(plan.filter((p) => p.title === 'Overdue')).toHaveLength(5);
  });

  it('a not-yet-due row generates no overdue nudge, only the digest', () => {
    const occs = [row({ dueDate: '2026-06-25' })];
    const plan = planCommitmentReminders({ enabled: true, occurrences: occs }, at(1, 8));
    expect(plan.find((p) => p.title === 'Overdue')).toBeUndefined();
    expect(plan.find((p) => p.title === 'Bills this month')).toBeDefined();
  });
});
