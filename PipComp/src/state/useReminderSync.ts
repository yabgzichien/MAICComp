// src/state/useReminderSync.ts
// Keeps the scheduled local reminders in step with the data they are about.
//
// lib/reminders.ts plans a ladder of one-shot notifications rather than one repeating trigger
// (see the header there for why), which means something has to re-arm the ladder. This is that
// something: it re-plans on mount, whenever the app returns to the foreground, and whenever
// the inputs change  so saving a transaction immediately pushes tonight's nudge out to
// tomorrow, and settling the last debt cancels the chase.
//
// Follows the AppState pattern from useLenderSyncPoll.ts, minus the interval. There is nothing
// arriving from outside to poll for here: the plan only changes when the user does something,
// and every one of those somethings already re-renders this hook.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { todayISO } from '../lib/duplicates';
import { planLogReminders, planOwedReminders } from '../lib/reminders';
import { groupOpenSharesByPerson, oldestOverdueDays } from '../lib/split';
import { lastActiveDay } from '../lib/streak';
import { configureNotifications, syncScheduledReminders } from '../notifications';
import { useAppData } from './store';

/**
 * Re-arm the local reminder schedule for as long as the app is mounted. Best-effort: a denied
 * permission or a platform without notifications (the web build resolves the no-op adapter)
 * degrades to doing nothing, and never surfaces an error to the user.
 */
export function useReminderSync(): void {
  const { ready, transactions, openShares, reminderCadence, owedReminderEnabled } = useAppData();

  useEffect(() => {
    // Before the first load lands, `transactions` is still empty and would look like a user
    // who has never logged anything, arming a nudge that the very next render retracts.
    if (!ready) return;

    let alive = true;

    const sync = async () => {
      try {
        await configureNotifications();
        if (!alive) return;

        const now = new Date();
        const today = todayISO();
        const debts = groupOpenSharesByPerson(openShares, today);

        await syncScheduledReminders({
          log: planLogReminders(
            { cadence: reminderCadence, lastLoggedDay: lastActiveDay(transactions, now) },
            now
          ),
          owed: planOwedReminders(
            {
              enabled: owedReminderEnabled,
              oldestOverdueDays: oldestOverdueDays(openShares, today),
              debts,
            },
            now
          ),
        });
      } catch {
        /* reminders are a convenience; never let them break a screen */
      }
    };

    sync();
    // Foreground signal, same as the lender poll: coming back to the app is the moment the
    // ladder is most likely stale, since a day may have passed since it was last planned.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, [ready, transactions, openShares, reminderCadence, owedReminderEnabled]);
}
