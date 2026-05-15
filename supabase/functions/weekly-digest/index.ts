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

Deno.serve(async (req) => {
  try {
    // Allow passing a specific user_id for testing, otherwise process all users
    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.user_id ?? null;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // Get users to process
    let usersQuery = supabase.from('users').select('id, email');
    if (targetUserId) usersQuery = usersQuery.eq('id', targetUserId);
    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    const results = [];

    for (const user of users ?? []) {
      // Get this week's entries
      const { data: entries, error: entriesError } = await supabase
        .from('journal_entries')
        .select('content, created_at')
        .eq('user_id', user.id)
        .gte('created_at', weekStart.toISOString())
        .order('created_at', { ascending: true });

      if (entriesError || !entries || entries.length === 0) {
        results.push({ user_id: user.id, status: 'skipped — no entries' });
        continue;
      }

      // Format entries for the prompt
      const entriesText = entries.map((e, i) => {
        const date = new Date(e.created_at).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        });
        return `Entry ${i + 1} (${date}):\n${e.content}`;
      }).join('\n\n---\n\n');

      // Call Claude
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

Journal entries:
${entriesText}`,
          },
        ],
      });

      const digestContent = message.content[0].type === 'text' ? message.content[0].text : '';

      // Store digest
      const { error: insertError } = await supabase
        .from('weekly_digests')
        .insert({
          user_id: user.id,
          content: digestContent,
          week_start: weekStart.toISOString().split('T')[0],
        });

      if (insertError) throw insertError;
      results.push({ user_id: user.id, status: 'digest created', entries: entries.length });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
