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

const NOTIFICATIONS_ENABLED = true;

function isLastDayOfUtcMonth(now: Date): boolean {
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(now.getUTCDate() + 1);
  return tomorrow.getUTCDate() === 1;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.user_id ?? null;
    const force = body?.force === true; // lets us manually trigger a test run regardless of date
    const requestedMonthStart = typeof body?.month_start === 'string' ? body.month_start : null;

    const now = new Date();
    if (!force && !isLastDayOfUtcMonth(now)) {
      return new Response(JSON.stringify({ success: true, skipped: 'not the last day of the month' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsedRequestedMonth = requestedMonthStart ? new Date(`${requestedMonthStart}T00:00:00.000Z`) : null;
    if (requestedMonthStart && (!parsedRequestedMonth || Number.isNaN(parsedRequestedMonth.getTime()))) {
      throw new Error('month_start must be a valid YYYY-MM-DD date');
    }

    // A specific month is only accepted for an explicitly forced/manual run.
    // Scheduled runs always use the current month.
    const monthStart = force && parsedRequestedMonth
      ? new Date(Date.UTC(parsedRequestedMonth.getUTCFullYear(), parsedRequestedMonth.getUTCMonth(), 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const monthStartStr = monthStart.toISOString().split('T')[0];

    let usersQuery = supabase.from('users').select('id, email, monthly_reflections_enabled, push_token');
    if (targetUserId) usersQuery = usersQuery.eq('id', targetUserId);
    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    const results = [];

    for (const user of users ?? []) {
      if (user.monthly_reflections_enabled === false) {
        results.push({ user_id: user.id, status: 'skipped — monthly reflections disabled' });
        continue;
      }

      const { data: existing } = await supabase
        .from('monthly_digests')
        .select('id')
        .eq('user_id', user.id)
        .eq('month_start', monthStartStr)
        .maybeSingle();
      if (existing) {
        results.push({ user_id: user.id, status: 'skipped — already generated this month' });
        continue;
      }

      const { data: monthEntries, error: monthError } = await supabase
        .from('journal_entries')
        .select('content, created_at')
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', nextMonthStart.toISOString())
        .order('created_at', { ascending: true });

      if (monthError || !monthEntries || monthEntries.length === 0) {
        results.push({ user_id: user.id, status: 'skipped — no entries' });
        continue;
      }

      const entriesText = monthEntries.map((e, i) => {
        const date = new Date(e.created_at).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        });
        return `Entry ${i + 1} (${date}):\n${e.content}`;
      }).join('\n\n---\n\n');

      const { data: pursuits } = await supabase
        .from('prompt_themes')
        .select('id, name, focus')
        .eq('user_id', user.id)
        .eq('status', 'active');

      let pursuitsPromptSection = '';
      if (pursuits && pursuits.length > 0) {
        const { data: monthEntriesWithTheme } = await supabase
          .from('journal_entries')
          .select('content, created_at, prompt_theme_id')
          .eq('user_id', user.id)
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', nextMonthStart.toISOString())
          .not('prompt_theme_id', 'is', null);

        const byTheme: Record<string, typeof monthEntriesWithTheme> = {};
        for (const e of monthEntriesWithTheme ?? []) {
          const key = e.prompt_theme_id as string;
          (byTheme[key] ??= []).push(e);
        }
        const pursuitBlocks = pursuits.map(p => {
          const entries = byTheme[p.id] ?? [];
          if (entries.length === 0) {
            return `Pursuit: "${p.name}"${p.focus ? ` (focus: ${p.focus})` : ''}\nNo entries logged against this pursuit this month.`;
          }
          const text = entries.map((e: any, i: number) =>
            `Entry ${i + 1} (${new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}):\n${e.content}`
          ).join('\n\n');
          return `Pursuit: "${p.name}"${p.focus ? ` (focus: ${p.focus})` : ''}\n${text}`;
        }).join('\n\n---\n\n');

        pursuitsPromptSection = `\n\nThe person is also tracking these ongoing "pursuits" — standing personal questions they're deliberately exploring. Below, for each pursuit, is what (if anything) they logged against it this month specifically. In the "Your pursuits this month" section, write one short line naming a genuine theme (what it seems to be about) or pattern (when/how it recurs) you can detect — grounded strictly in that pursuit's entries below, not the rest of the month. If a pursuit has no entries this month, or too little to say anything real, say so plainly (e.g. "Nothing logged this month — no pattern to report.") rather than inventing one.

${pursuitBlocks}`;
      }

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1600,
        messages: [
          {
            role: 'user',
            content: `You are a thoughtful, warm reflection companion. Below are someone's journal entries from the past month. Write a monthly reflection that feels personal and insightful — not generic.

Your reflection should:
- Take the longer view a month allows — notice arcs, shifts, and recurring themes that a single week wouldn't show
- Notice specific patterns, themes, or recurring feelings across the entries
- Highlight moments of growth, tension, or change — name them specifically
- Be honest but kind — this is for the person's own reflection, not an evaluation
- Feel like it was written by someone who actually read every word, not a summary bot
- Use exactly this readable structure:
  1. "## A month in view" followed by 2–3 short, thoughtful paragraphs.
  2. "## Patterns I noticed" followed by 2–4 concise bullet points. Each bullet must name a recurring pattern and the context that supports it. Do not diagnose or present speculation as fact.
  3. If pursuits are included below, add "## Your pursuits this month" followed by their short observations.
- The patterns section is essential even if there are no pursuits. Only include patterns genuinely supported by the entries; if evidence is limited, say that gently instead of forcing a conclusion.
${pursuitsPromptSection}
Journal entries:
${entriesText}`,
          },
        ],
      });

      const digestContent = message.content[0].type === 'text' ? message.content[0].text : '';

      const { data: inserted, error: insertError } = await supabase
        .from('monthly_digests')
        .insert({
          user_id: user.id,
          content: digestContent,
          month_start: monthStartStr,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      if (NOTIFICATIONS_ENABLED && user.push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{
            to: user.push_token,
            title: 'Your monthly reflection is ready 🌙',
            body: 'A look back at your month, and the pursuits you explored.',
            sound: 'default',
            data: { monthly_digest_id: inserted.id },
          }]),
        });
      }

      results.push({ user_id: user.id, status: 'monthly digest created', entries: monthEntries.length });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
