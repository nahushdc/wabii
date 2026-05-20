import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';
import Anthropic from 'npm:@anthropic-ai/sdk';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
});

function toLocalDateStr(iso: string): string {
  // Returns YYYY-MM-DD in UTC (server has no user tz, so we compare dates consistently)
  return iso.slice(0, 10);
}

function calculateStreak(allDates: string[]): number {
  if (allDates.length === 0) return 0;

  const unique = Array.from(new Set(allDates.map(toLocalDateStr))).sort((a, b) => b.localeCompare(a));

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  if (unique[0] !== today && unique[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 864e5);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

function streakContext(streak: number, weeklyCount: number): string {
  if (streak === 0) return '';

  const lines: string[] = [];

  if (streak >= 30) {
    lines.push(`They are on a remarkable ${streak}-day journaling streak — over a month of showing up for themselves consistently.`);
  } else if (streak >= 14) {
    lines.push(`They are on a ${streak}-day journaling streak — two weeks of consistent self-reflection.`);
  } else if (streak >= 7) {
    lines.push(`They are on a ${streak}-day journaling streak — a full week of showing up.`);
  } else if (streak >= 3) {
    lines.push(`They are on a ${streak}-day journaling streak, building a real habit.`);
  } else {
    lines.push(`They wrote ${streak} day${streak > 1 ? 's' : ''} in a row this week.`);
  }

  if (weeklyCount === 7) {
    lines.push(`They wrote every single day this week — a perfect week.`);
  } else if (weeklyCount >= 5) {
    lines.push(`They wrote ${weeklyCount} out of 7 days this week.`);
  }

  return lines.join(' ');
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.user_id ?? null;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    let usersQuery = supabase.from('users').select('id, email');
    if (targetUserId) usersQuery = usersQuery.eq('id', targetUserId);
    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    const results = [];

    for (const user of users ?? []) {
      // Fetch this week's entries for the reflection
      const { data: weekEntries, error: weekError } = await supabase
        .from('journal_entries')
        .select('content, created_at')
        .eq('user_id', user.id)
        .gte('created_at', weekStart.toISOString())
        .order('created_at', { ascending: true });

      if (weekError || !weekEntries || weekEntries.length === 0) {
        results.push({ user_id: user.id, status: 'skipped — no entries' });
        continue;
      }

      // Fetch ALL entry dates to calculate streak
      const { data: allEntries } = await supabase
        .from('journal_entries')
        .select('created_at')
        .eq('user_id', user.id);

      const allDates = (allEntries ?? []).map(e => e.created_at);
      const streak = calculateStreak(allDates);
      const streakNote = streakContext(streak, weekEntries.length);

      // Format entries for the prompt
      const entriesText = weekEntries.map((e, i) => {
        const date = new Date(e.created_at).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        });
        return `Entry ${i + 1} (${date}):\n${e.content}`;
      }).join('\n\n---\n\n');

      const streakPromptSection = streakNote
        ? `\nAbout their journaling habit this week: ${streakNote} Acknowledge this naturally — not as a trophy or a metric, but as a quiet sign of commitment to themselves. Weave it in organically, not as a separate section.\n`
        : '';

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are a thoughtful, warm reflection companion. Below are someone's journal entries from the past week. Write a weekly digest that feels personal and insightful — not generic.

Your digest should:
- Notice specific patterns, themes, or recurring feelings across the entries
- Highlight moments of growth, tension, or shift — name them specifically
- Be honest but kind — this is for the person's own reflection, not an evaluation
- Feel like it was written by someone who actually read every word, not a summary bot
- Be 3–4 paragraphs. No bullet points. No headers. Just thoughtful prose.
${streakPromptSection}
Journal entries:
${entriesText}`,
          },
        ],
      });

      const digestContent = message.content[0].type === 'text' ? message.content[0].text : '';

      const { error: insertError } = await supabase
        .from('weekly_digests')
        .insert({
          user_id: user.id,
          content: digestContent,
          week_start: weekStart.toISOString().split('T')[0],
        });

      if (insertError) throw insertError;
      results.push({ user_id: user.id, status: 'digest created', entries: weekEntries.length, streak });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
