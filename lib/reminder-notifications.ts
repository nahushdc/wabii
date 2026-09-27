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

// Notification copy varies by time of day instead of always saying "Time to
// reflect" — a few variants per bucket, rotated by day so a whole 14-day
// window doesn't say the exact same thing every morning.
const TIME_BUCKET_MESSAGES: { title: string; body: string }[][] = [
  // morning: 5am - 11:59am
  [
    { title: 'Good morning ☀️', body: 'A blank page and a fresh start — what\'s on your mind?' },
    { title: 'Rise and reflect 🌅', body: 'Before the day runs off with you, a few words for yourself.' },
    { title: 'Morning check-in ☕', body: 'How are you actually doing today?' },
  ],
  // midday: 12pm - 4:59pm
  [
    { title: 'Midday pause 🌤', body: 'A quick breather — what\'s been on your mind so far today?' },
    { title: 'Halfway through 🌿', body: 'Take two minutes for yourself before the day carries on.' },
    { title: 'Lunch break thoughts 🥪', body: 'Whatever\'s on your mind, it\'s got a home here.' },
  ],
  // evening: 5pm - 8:59pm
  [
    { title: 'Evening check-in 🌙', body: 'How did today actually feel?' },
    { title: 'Winding down 🌆', body: 'Before you switch off, a moment to look back.' },
    { title: 'End-of-day reflection ✨', body: 'What\'s one thing worth remembering about today?' },
  ],
  // night: 9pm - 4:59am
  [
    { title: 'Late night thoughts 🌌', body: 'Can\'t sleep, or just up late? Get it out of your head and onto the page.' },
    { title: 'One more thing before bed 🌙', body: 'Sometimes the clearest thoughts come right before sleep.' },
  ],
];

function timeBucketFor(hour: number): { title: string; body: string }[] {
  if (hour >= 5 && hour < 12) return TIME_BUCKET_MESSAGES[0];
  if (hour >= 12 && hour < 17) return TIME_BUCKET_MESSAGES[1];
  if (hour >= 17 && hour < 21) return TIME_BUCKET_MESSAGES[2];
  return TIME_BUCKET_MESSAGES[3];
}

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
  const variants = timeBucketFor(reminder.hour);
  const customBody = reminder.message?.trim();

  for (let d = 0; d <= DAYS_AHEAD; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    date.setHours(reminder.hour, reminder.minute, 0, 0);

    if (date.getTime() <= now.getTime()) continue; // don't schedule times already past today
    if (!reminder.days_of_week.includes(date.getDay())) continue;

    const occurrenceDate = toDateKey(date);
    const variant = variants[d % variants.length];
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: variant.title,
        body: customBody || variant.body,
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
