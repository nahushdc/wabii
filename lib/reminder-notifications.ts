import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

// Reminders fire via iOS/Android's own local notification scheduler instead
// of a server cron + push round-trip — no network dependency at delivery
// time, and the device's own clock/timezone is used automatically. Each
// upcoming occurrence (not one indefinitely-repeating notification) is
// scheduled individually, tracked in a local JSON file mapping
// (reminderId, date) -> the OS notification id, so a single day's occurrence
// can be cancelled — e.g. when the user journals — without touching the
// rest of the recurring schedule.

type ScheduledOccurrence = {
  reminderId: string;
  occurrenceDate: string; // YYYY-MM-DD, device-local calendar date
  notificationId: string;
};

type ReminderForScheduling = {
  id: string;
  hour: number;
  minute: number;
  message: string | null;
  days_of_week: number[];
  enabled: boolean;
};

const STORAGE_PATH = `${FileSystem.documentDirectory}reminder-notifications.json`;
const DAYS_AHEAD = 14;

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function readAll(): Promise<ScheduledOccurrence[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(STORAGE_PATH);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAll(occurrences: ScheduledOccurrence[]): Promise<void> {
  await FileSystem.writeAsStringAsync(STORAGE_PATH, JSON.stringify(occurrences));
}

// Cancels every currently-scheduled occurrence for one reminder (used before
// a full reschedule, and on delete/disable) — does not touch other reminders.
export async function cancelAllForReminder(reminderId: string): Promise<void> {
  const occurrences = await readAll();
  const toCancel = occurrences.filter(o => o.reminderId === reminderId);
  const remaining = occurrences.filter(o => o.reminderId !== reminderId);
  for (const o of toCancel) {
    await Notifications.cancelScheduledNotificationAsync(o.notificationId).catch(() => {});
  }
  await writeAll(remaining);
}

// Cancels only ONE day's occurrence — used when the user journals before a
// reminder fires, so today's nudge disappears while tomorrow's (and the
// rest of the recurring schedule) is untouched.
export async function cancelReminderForOccurrence(reminderId: string, occurrenceDate: string): Promise<void> {
  const occurrences = await readAll();
  const match = occurrences.find(o => o.reminderId === reminderId && o.occurrenceDate === occurrenceDate);
  if (!match) return;
  await Notifications.cancelScheduledNotificationAsync(match.notificationId).catch(() => {});
  await writeAll(occurrences.filter(o => o !== match));
}

// (Re)schedules the next DAYS_AHEAD days of occurrences for one reminder,
// replacing whatever was scheduled for it before. Safe to call after any
// create/edit/enable/disable — always starts from a clean slate for this
// reminder specifically.
export async function scheduleReminderOccurrences(reminder: ReminderForScheduling): Promise<void> {
  await cancelAllForReminder(reminder.id);
  if (!reminder.enabled) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const occurrences = await readAll();
  const now = new Date();

  for (let d = 0; d <= DAYS_AHEAD; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    date.setHours(reminder.hour, reminder.minute, 0, 0);

    if (date.getTime() <= now.getTime()) continue; // don't schedule times already past today
    if (!reminder.days_of_week.includes(date.getDay())) continue;

    const occurrenceDate = toDateKey(date);
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to reflect 🌿',
        body: reminder.message?.trim() || 'How was your day? Take a moment to write.',
        sound: 'default',
        data: { reminderId: reminder.id, occurrenceDate },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });

    occurrences.push({ reminderId: reminder.id, occurrenceDate, notificationId });
  }

  await writeAll(occurrences);
}

// Full re-sync against the server's reminders — call on app foreground to
// top up the rolling DAYS_AHEAD window as days pass, and to pick up
// reminders created/edited/deleted elsewhere (another device, or before
// notification permission was granted).
export async function syncAllReminderNotifications(): Promise<void> {
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id, hour, minute, message, days_of_week, enabled');
  if (error || !reminders) return;

  // Drop any locally-tracked occurrences for reminders that no longer exist
  // server-side (e.g. deleted from another device).
  const validIds = new Set(reminders.map(r => r.id));
  const occurrences = await readAll();
  const orphaned = occurrences.filter(o => !validIds.has(o.reminderId));
  for (const o of orphaned) {
    await Notifications.cancelScheduledNotificationAsync(o.notificationId).catch(() => {});
  }
  if (orphaned.length > 0) {
    await writeAll(occurrences.filter(o => validIds.has(o.reminderId)));
  }

  for (const reminder of reminders) {
    await scheduleReminderOccurrences({
      id: reminder.id,
      hour: reminder.hour,
      minute: reminder.minute,
      message: reminder.message,
      days_of_week: reminder.days_of_week ?? [],
      enabled: reminder.enabled,
    });
  }
}

// Called right after a journal entry is successfully saved — cancels today's
// occurrence for every enabled reminder that has skip_if_journaled on,
// without touching tomorrow's (or any other reminder's) schedule.
export async function cancelTodaysReminderOccurrencesIfJournaled(): Promise<void> {
  const { data: reminders } = await supabase
    .from('reminders')
    .select('id')
    .eq('enabled', true)
    .eq('skip_if_journaled', true);
  if (!reminders || reminders.length === 0) return;

  const today = toDateKey(new Date());
  for (const reminder of reminders) {
    await cancelReminderForOccurrence(reminder.id, today);
  }
}
