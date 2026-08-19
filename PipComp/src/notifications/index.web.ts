// src/notifications/index.web.ts
// Web stand-in for the notification adapter. Metro picks this file over index.ts whenever the
// platform is web, so `expo-notifications` is never resolved into the Vercel bundle.
//
// It is a no-op rather than a browser-Notification implementation on purpose. Without a
// service worker and a push subscription the browser cannot deliver anything once the tab is
// closed, which is the only moment a reminder is worth anything. Settings hides the whole
// section on web instead of offering a control that quietly does nothing.

import type { ReminderPlanEntry } from '../lib/reminders';

export type ReminderKind = 'log' | 'owed';

export interface ReminderPlan {
  log: ReminderPlanEntry[];
  owed: ReminderPlanEntry[];
}

export async function configureNotifications(): Promise<void> {
  /* no notifications on web */
}

export async function ensurePermission(): Promise<boolean> {
  return false;
}

export async function syncScheduledReminders(_plan: ReminderPlan): Promise<void> {
  /* no notifications on web */
}

export async function listScheduledReminders(): Promise<{ kind: string; at: string }[]> {
  return [];
}
