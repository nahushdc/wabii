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

    let usersQuery = supabase.from('users').select('id, email, weekly_reflections_enabled, push_token');
    if (targetUserId) usersQuery = usersQuery.eq('id', targetUserId);
    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    const results = [];

    for (const user of users ?? []) {
      if (user.weekly_reflections_enabled === false) {
        results.push({ user_id: user.id, status: 'skipped — weekly reflections disabled' });
        continue;
      }

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

      // Fetch ALL entry dates to calculate streak, and this week's entries'
      // pursuit tags so we can call out patterns/themes per pursuit below.
      const [{ data: allEntries }, { data: weekEntriesWithTheme }, { data: pursuits }] = await Promise.all([
        supabase.from('journal_entries').select('created_at').eq('user_id', user.id),
        supabase.from('journal_entries').select('content, created_at, prompt_theme_id')
          .eq('user_id', user.id).gte('created_at', weekStart.toISOString()).not('prompt_theme_id', 'is', null),
        supabase.from('prompt_themes').select('id, name, focus').eq('user_id', user.id).eq('status', 'active'),
      ]);

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

      // Build a per-pursuit breakdown so the digest can call out patterns and
      // themes specific to each pursuit, grounded only in what was actually
      // logged against it this week.
      let pursuitsPromptSection = '';
      if (pursuits && pursuits.length > 0) {
        const byTheme: Record<string, typeof weekEntriesWithTheme> = {};
        for (const e of weekEntriesWithTheme ?? []) {
          const key = e.prompt_theme_id as string;
          (byTheme[key] ??= []).push(e);
        }
        const pursuitBlocks = pursuits.map(p => {
          const entries = byTheme[p.id] ?? [];
          if (entries.length === 0) {
            return `Pursuit: "${p.name}"${p.focus ? ` (focus: ${p.focus})` : ''}\nNo entries logged against this pursuit this week.`;
          }
          const text = entries.map((e: any, i: number) =>
            `Entry ${i + 1} (${new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}):\n${e.content}`
          ).join('\n\n');
          return `Pursuit: "${p.name}"${p.focus ? ` (focus: ${p.focus})` : ''}\n${text}`;
        }).join('\n\n---\n\n');

        pursuitsPromptSection = `\n\nThe person is also tracking these ongoing "pursuits" — standing personal questions they're deliberately exploring. Below, for each pursuit, is what (if anything) they logged against it this week specifically. After your main reflection, add a section titled exactly "Your pursuits this week" and, for each pursuit listed below, write one short line naming a genuine theme (what it seems to be about) or pattern (when/how it recurs) you can detect — grounded strictly in that pursuit's entries below, not the rest of the week. If a pursuit has no entries this week, or too little to say anything real, say so plainly (e.g. "Nothing logged this week — no pattern to report.") rather than inventing one.

${pursuitBlocks}`;
      }

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1400,
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
${streakPromptSection}${pursuitsPromptSection}
Journal entries:
${entriesText}`,
          },
        ],
      });

      const digestContent = message.content[0].type === 'text' ? message.content[0].text : '';

      const { data: inserted, error: insertError } = await supabase
        .from('weekly_digests')
        .insert({
          user_id: user.id,
          content: digestContent,
          week_start: weekStart.toISOString().split('T')[0],
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      if (user.push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{
            to: user.push_token,
            title: 'Your weekly reflection is ready 🌿',
            body: 'A look back at your week, and the pursuits you explored.',
            sound: 'default',
            data: { weekly_digest_id: inserted.id },
          }]),
        });
      }

      results.push({ user_id: user.id, status: 'digest created', entries: weekEntries.length, streak });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
