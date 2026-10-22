import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { posthog } from './posthog';

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
  fireAt?: string; // ISO time the notification is due, for the "reminders due" count
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
const CONFIG_PATH = `${FileSystem.documentDirectory}reminder-notification-config.json`;
const CONFIG_TTL_MS = 5 * 60 * 1000;

// Notification copy is editable from the admin dashboard (notification_zones /
// notification_settings tables). A zone runs from its start_hour until the next
// zone's start_hour; an hour before every start_hour belongs to the latest zone
// (late night). The title is the zone greeting; the body is a gentle invitation
// to journal, rotated by day so a whole window doesn't repeat the same line.
type Zone = { start_hour: number; title: string; bodies: string[] };
type NotificationConfig = { zones: Zone[]; daysAhead: number };

// Built-in copy — used when the tables can't be fetched and nothing is cached.
const FALLBACK_CONFIG: NotificationConfig = {
  daysAhead: 14,
  zones: [
    {
      start_hour: 5, // morning
      title: "Good Morning! 🌅",
      bodies: [
        "Time for your morning journaling session. How are you feeling today?",
        "A fresh page is waiting. What do you want to carry into today?",
        "Before the day gets loud, take a quiet minute for your thoughts.",
        "How are you waking up today? Let it out on the page.",
        "Set your intention, or just ramble. Either way, start here.",
      ],
    },
    {
      start_hour: 12, // afternoon
      title: "Afternoon Check-in 🌤️",
      bodies: [
        "How's your day going? Take a moment to reflect and journal.",
        "Pause for a breath. What has today been like so far?",
        "Halfway through the day. A few words can reset the rest of it.",
        "Something on your mind? Give it a home here.",
        "Take two minutes for yourself before the day carries on.",
      ],
    },
    {
      start_hour: 17, // evening, including late night
      title: "Evening Reflection 🌙",
      bodies: [
        "End your day with gratitude and reflection. What are you thankful for?",
        "How did today actually feel? Let it settle onto the page.",
        "Wind down by looking back. What is worth remembering?",
        "Put the day down gently. What do you want to let go of?",
        "One good thing, one hard thing. Write them both before bed.",
      ],
    },
  ],
};

let cachedConfig: { config: NotificationConfig; fetchedAt: number } | null = null;

function isValidConfig(value: unknown): value is NotificationConfig {
  const c = value as NotificationConfig | null;
  return !!c && Array.isArray(c.zones) && c.zones.length > 0 && Number.isInteger(c.daysAhead) &&
    c.zones.every(z => Number.isInteger(z.start_hour) && typeof z.title === 'string' &&
      Array.isArray(z.bodies) && z.bodies.length > 0);
}

// Server copy -> last good copy on disk -> built-in copy. Never throws.
async function getConfig(forceRefresh = false): Promise<NotificationConfig> {
  if (!forceRefresh && cachedConfig && Date.now() - cachedConfig.fetchedAt < CONFIG_TTL_MS) {
    return cachedConfig.config;
  }

  try {
    const [zonesRes, settingsRes] = await Promise.all([
      supabase.from('notification_zones').select('start_hour, title, bodies').order('start_hour'),
      supabase.from('notification_settings').select('key, value').eq('key', 'days_ahead'),
    ]);
    if (!zonesRes.error && zonesRes.data && zonesRes.data.length > 0) {
      const daysAhead = Number(settingsRes.data?.[0]?.value);
      const config: NotificationConfig = {
        zones: zonesRes.data as Zone[],
        daysAhead: Number.isInteger(daysAhead) && daysAhead >= 1 && daysAhead <= 30
          ? daysAhead
          : FALLBACK_CONFIG.daysAhead,
      };
      if (isValidConfig(config)) {
        cachedConfig = { config, fetchedAt: Date.now() };
        FileSystem.writeAsStringAsync(CONFIG_PATH, JSON.stringify(config)).catch(() => {});
        return config;
      }
    }
  } catch {
    // offline — fall through to the on-disk copy
  }

  try {
    const stored = JSON.parse(await FileSystem.readAsStringAsync(CONFIG_PATH));
    if (isValidConfig(stored)) {
      cachedConfig = { config: stored, fetchedAt: Date.now() };
      return stored;
    }
  } catch {
    // no stored copy yet
  }

  cachedConfig = { config: FALLBACK_CONFIG, fetchedAt: Date.now() };
  return FALLBACK_CONFIG;
}

function zoneFor(hour: number, zones: Zone[]): Zone {
  const sorted = [...zones].sort((a, b) => a.start_hour - b.start_hour);
  let match = sorted[sorted.length - 1];
  for (const zone of sorted) {
    if (zone.start_hour <= hour) match = zone;
  }
  return match;
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

// (Re)schedules the next `daysAhead` days of occurrences for one reminder,
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
  const config = await getConfig();
  const zone = zoneFor(reminder.hour, config.zones);
  const customBody = reminder.message?.trim();

  for (let d = 0; d <= config.daysAhead; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    date.setHours(reminder.hour, reminder.minute, 0, 0);

    if (date.getTime() <= now.getTime()) continue; // don't schedule times already past today
    if (!reminder.days_of_week.includes(date.getDay())) continue;

    const occurrenceDate = toDateKey(date);
    const body = zone.bodies[d % zone.bodies.length];
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: zone.title,
        body: customBody || body,
        sound: 'default',
        data: { reminderId: reminder.id, occurrenceDate },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });

    occurrences.push({ reminderId: reminder.id, occurrenceDate, notificationId, fireAt: date.toISOString() });
  }

  await writeAll(occurrences);
}

const DUE_REPORT_PATH = `${FileSystem.documentDirectory}reminder-due-report.json`;

// Reminders are scheduled on the phone, so the server never sees one fire.
// This is the closest honest number: every time the app comes forward, count
// the scheduled occurrences whose time passed since the last report and send
// that as one analytics event. It can overcount a reminder that was due while
// the phone was off or in Do Not Disturb, and undercount one wiped by editing a
// reminder before this ran. Must run BEFORE the reschedule below, which clears
// past occurrences.
async function reportDueReminders(): Promise<void> {
  try {
    const now = Date.now();
    let lastReportedAt: number | null = null;
    try {
      lastReportedAt = JSON.parse(await FileSystem.readAsStringAsync(DUE_REPORT_PATH)).lastReportedAt ?? null;
    } catch {
      // First run: nothing reported yet.
    }
    await FileSystem.writeAsStringAsync(DUE_REPORT_PATH, JSON.stringify({ lastReportedAt: now }));
    if (lastReportedAt === null) return; // don't count a backlog on the first run

    const occurrences = await readAll();
    const due = occurrences.filter(o => {
      const t = o.fireAt ? Date.parse(o.fireAt) : NaN;
      return t > lastReportedAt! && t <= now;
    });
    if (due.length > 0) posthog?.capture('reminders_due', { count: due.length });
  } catch {
    // Analytics must never break reminder syncing.
  }
}

// Full re-sync against the server's reminders — call on app foreground to
// top up the rolling window as days pass, and to pick up
// reminders created/edited/deleted elsewhere (another device, or before
// notification permission was granted).
export async function syncAllReminderNotifications(): Promise<void> {
  await reportDueReminders();
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id, hour, minute, message, days_of_week, enabled');
  if (error || !reminders) return;

  // Pick up any copy/rule edits made in the admin dashboard before rescheduling.
  await getConfig(true);

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
