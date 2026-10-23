// Remembers (in memory only) that the user just opened the app from a reminder
// notification, so an entry saved soon after can be tagged as "from a reminder".
// A cold launch from the notification and the entry save happen in the same
// process, so in-memory is enough; it deliberately doesn't survive a restart.
const WINDOW_MS = 30 * 60 * 1000;

let openedAt: number | null = null;
const handledResponseIds = new Set<string>();

// Returns false if this notification tap was already counted (the listener and
// getLastNotificationResponseAsync can both report the same launch tap).
export function markReminderOpened(responseId: string): boolean {
  if (handledResponseIds.has(responseId)) return false;
  handledResponseIds.add(responseId);
  openedAt = Date.now();
  return true;
}

// True once per reminder tap, if an entry is saved within the window.
export function consumeReminderAttribution(): boolean {
  if (openedAt === null) return false;
  const fresh = Date.now() - openedAt <= WINDOW_MS;
  openedAt = null;
  return fresh;
}
