// One-off notifications the server sends (not the time-of-day reminders).
// The `notification_messages` table overrides these per key, editable from the
// control panel. If a row is missing or the read fails, the text here is used.

export type NotificationMessageDef = {
  label: string;
  description: string;
  title: string;
  body: string;
};

export const NOTIFICATION_MESSAGE_DEFAULTS: Record<string, NotificationMessageDef> = {
  weekly_digest_ready: {
    label: 'Weekly reflection is ready',
    description: 'Sent when someone\'s weekly reflection has been written.',
    title: 'Your weekly reflection is ready 🌿',
    body: 'A look back at your week, and the pursuits you explored.',
  },
  monthly_digest_ready: {
    label: 'Monthly reflection is ready',
    description: 'Sent when someone\'s monthly reflection has been written.',
    title: 'Your monthly reflection is ready 🌙',
    body: 'A look back at your month, and the pursuits you explored.',
  },
};

// The time-of-day reminder text every account started with. Seeded into
// `notification_zones`; the control panel can restore it. Keep in step with
// FALLBACK_CONFIG in lib/reminder-notifications.ts.
export const REMINDER_ZONE_DEFAULTS = [
  { key: 'morning', label: 'Morning', start_hour: 5, title: 'Good Morning! 🌅', bodies: [
    "Time for your morning journaling session. How are you feeling today?",
    "A fresh page is waiting. What do you want to carry into today?",
    "Before the day gets loud, take a quiet minute for your thoughts.",
    "How are you waking up today? Let it out on the page.",
    "Set your intention, or just ramble. Either way, start here.",
  ] },
  { key: 'afternoon', label: 'Afternoon', start_hour: 12, title: 'Afternoon Check-in 🌤️', bodies: [
    "How's your day going? Take a moment to reflect and journal.",
    "Pause for a breath. What has today been like so far?",
    "Halfway through the day. A few words can reset the rest of it.",
    "Something on your mind? Give it a home here.",
    "Take two minutes for yourself before the day carries on.",
  ] },
  { key: 'evening', label: 'Evening', start_hour: 17, title: 'Evening Reflection 🌙', bodies: [
    "End your day with gratitude and reflection. What are you thankful for?",
    "How did today actually feel? Let it settle onto the page.",
    "Wind down by looking back. What is worth remembering?",
    "Put the day down gently. What do you want to let go of?",
    "One good thing, one hard thing. Write them both before bed.",
  ] },
];

// `supabase` should be a service-role client.
// deno-lint-ignore no-explicit-any
export async function getNotificationMessage(supabase: any, key: string): Promise<{ title: string; body: string }> {
  const fallback = NOTIFICATION_MESSAGE_DEFAULTS[key];
  try {
    const { data } = await supabase.from('notification_messages').select('title, body').eq('key', key).maybeSingle();
    if (data?.title?.trim() && data?.body?.trim()) return { title: data.title, body: data.body };
  } catch {
    // fall back to the shipped text
  }
  return { title: fallback.title, body: fallback.body };
}
