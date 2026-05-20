import { createClient } from 'npm:@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Get the current hour (0–23) in a given timezone
function getLocalHour(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  return hour === 24 ? 0 : hour; // handle midnight edge case
}

// Get the UTC timestamp for midnight of today in a given timezone
function getStartOfLocalDay(timezone: string, date: Date): Date {
  const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date); // "YYYY-MM-DD"
  const utcMs = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const localMs = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getTime();
  const offsetMs = utcMs - localMs;
  const midnightNaive = new Date(`${localDateStr}T00:00:00Z`);
  return new Date(midnightNaive.getTime() + offsetMs);
}

Deno.serve(async () => {
  try {
    const now = new Date();

    // Fetch all users with notifications enabled and a push token
    const { data: users, error } = await supabase
      .from('users')
      .select('id, push_token, timezone, notify_hour')
      .eq('notify_enabled', true)
      .not('push_token', 'is', null);

    if (error) throw error;

    const toSend = [];
    const results = [];

    for (const user of users ?? []) {
      const timezone = user.timezone || 'UTC';
      const localHour = getLocalHour(timezone, now);

      // Only proceed if it's their chosen reminder hour
      if (localHour !== (user.notify_hour ?? 19)) {
        results.push({ user_id: user.id, status: 'skipped — not their hour' });
        continue;
      }

      // Check if they've already journaled today (in their local timezone)
      const startOfDay = getStartOfLocalDay(timezone, now);
      const { count } = await supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', startOfDay.toISOString());

      if ((count ?? 0) > 0) {
        results.push({ user_id: user.id, status: 'skipped — already journaled today' });
        continue;
      }

      toSend.push({
        to: user.push_token,
        title: 'Time to reflect 🌿',
        body: "How was your day? Take a moment to write.",
        sound: 'default',
      });

      results.push({ user_id: user.id, status: 'notification sent' });
    }

    // Send all notifications in one batch via Expo Push API
    if (toSend.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSend),
      });
    }

    return new Response(JSON.stringify({ success: true, sent: toSend.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
