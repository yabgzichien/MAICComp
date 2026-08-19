// src/notifications/index.ts
// The only place in the app that touches expo-notifications. Everything above it deals in
// plain `ReminderPlanEntry` values from lib/reminders.ts, so the scheduling logic stays pure
// and testable and this file stays a thin, untested adapter.
//
// There is a sibling index.web.ts that no-ops every export. Metro resolves the .web.ts on
// `expo export --platform web`, which is what keeps expo-notifications (no web support) out of
// the Vercel bundle entirely. A runtime `Platform.OS` check would not: the import would still
// be resolved and shipped.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ReminderPlanEntry } from '../lib/reminders';

/** Marks a scheduled notification as ours, so a re-sync never cancels anything else. */
const PIP_REMINDER = 'pipReminder';

export type ReminderKind = 'log' | 'owed';

export interface ReminderPlan {
  log: ReminderPlanEntry[];
  owed: ReminderPlanEntry[];
}

let configured = false;

/**
 * One-time setup: show reminders even when the app is in the foreground, and give Android the
 * channel it needs before anything is scheduled against it.
 *
 * Idempotent, so the mount effect that calls it can run as often as React likes.
 */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }
}

/**
 * Whether we are allowed to post notifications, asking once if the user has not been asked.
 *
 * Never called on app start. Only the Settings pills call it, so the OS prompt appears when
 * the user has just asked for reminders rather than out of nowhere on first launch.
 */
export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  // `canAskAgain` false means a hard denial in system settings; asking again is a silent no-op.
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Replace every reminder we have scheduled with the given plan.
 *
 * Cancels by inspecting `content.data` rather than calling `cancelAllScheduledNotificationsAsync`,
 * which would also drop anything scheduled by another part of the app later on.
 */
export async function syncScheduledReminders(plan: ReminderPlan): Promise<void> {
  await configureNotifications();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((req) => (req.content.data as Record<string, unknown> | null)?.[PIP_REMINDER])
      .map((req) => Notifications.cancelScheduledNotificationAsync(req.identifier))
  );

  const entries: { kind: ReminderKind; entry: ReminderPlanEntry }[] = [
    ...plan.log.map((entry) => ({ kind: 'log' as const, entry })),
    ...plan.owed.map((entry) => ({ kind: 'owed' as const, entry })),
  ];

  for (const { kind, entry } of entries) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: entry.title,
        body: entry.body,
        data: { [PIP_REMINDER]: kind },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: entry.at,
        channelId: 'reminders',
      },
    });
  }
}

/** Every reminder currently armed. Diagnostics only; nothing in the app depends on it. */
export async function listScheduledReminders(): Promise<{ kind: string; at: string }[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .map((req) => ({
      kind: String((req.content.data as Record<string, unknown> | null)?.[PIP_REMINDER] ?? ''),
      trigger: req.trigger as { value?: number } | null,
    }))
    .filter((r) => r.kind)
    .map((r) => ({
      kind: r.kind,
      at: r.trigger?.value ? new Date(r.trigger.value).toISOString() : 'unknown',
    }));
}
