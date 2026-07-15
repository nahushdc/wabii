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

// Get the current minute (0–59) in a given timezone
function getLocalMinute(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    minute: 'numeric',
  }).formatToParts(date);
  return parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
}

// Get the current day of week (0=Sun..6=Sat) in a given timezone
function getLocalDayOfWeek(timezone: string, date: Date): number {
  const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date); // "YYYY-MM-DD"
  return new Date(`${localDateStr}T00:00:00Z`).getUTCDay();
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

    // Fetch all enabled reminders, joined with the owning user's push token and timezone
    const { data: reminders, error } = await supabase
      .from('reminders')
      .select('id, user_id, hour, minute, days_of_week, message, skip_if_journaled, prompt_theme_id, users!inner(push_token, timezone)')
      .eq('enabled', true);

    if (error) throw error;

    const toSend = [];
    const results = [];

    for (const reminder of reminders ?? []) {
      const user = reminder.users as unknown as { push_token: string | null; timezone: string | null };
      if (!user?.push_token) {
        results.push({ reminder_id: reminder.id, status: 'skipped — no push token' });
        continue;
      }

      const timezone = user.timezone || 'UTC';
      const localHour = getLocalHour(timezone, now);
      const localMinute = getLocalMinute(timezone, now);

      // Only proceed if it's this reminder's exact chosen time
      if (localHour !== reminder.hour || localMinute !== reminder.minute) {
        results.push({ reminder_id: reminder.id, status: 'skipped — not its time' });
        continue;
      }

      // Only proceed if today is one of this reminder's chosen days
      const localDayOfWeek = getLocalDayOfWeek(timezone, now);
      if (!reminder.days_of_week?.includes(localDayOfWeek)) {
        results.push({ reminder_id: reminder.id, status: 'skipped — not its day' });
        continue;
      }

      // Check if they've already journaled today (in their local timezone),
      // but only skip on that basis if this reminder opted into that behavior.
      if (reminder.skip_if_journaled) {
        const startOfDay = getStartOfLocalDay(timezone, now);
        const { count } = await supabase
          .from('journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', reminder.user_id)
          .gte('created_at', startOfDay.toISOString());

        if ((count ?? 0) > 0) {
          results.push({ reminder_id: reminder.id, status: 'skipped — already journaled today' });
          continue;
        }
      }

      toSend.push({
        to: user.push_token,
        title: 'Time to reflect 🌿',
        body: reminder.message?.trim() || "How was your day? Take a moment to write.",
        sound: 'default',
        data: { prompt_theme_id: reminder.prompt_theme_id ?? null },
      });

      results.push({ reminder_id: reminder.id, status: 'notification sent' });
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
