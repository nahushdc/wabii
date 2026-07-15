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

// Fewer entries than this and there isn't enough material for a meaningful analysis
const MIN_ENTRIES_FOR_INSIGHTS = 3;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const themeId = body?.theme_id;
    if (!themeId) return json({ error: 'theme_id required' }, 400);

    const { data: theme, error: themeErr } = await supabase
      .from('prompt_themes')
      .select('name')
      .eq('id', themeId)
      .eq('user_id', user.id)
      .single();
    if (themeErr || !theme) return json({ error: 'theme not found' }, 404);

    const { data: entries, error: entriesErr } = await supabase
      .from('journal_entries')
      .select('content, created_at')
      .eq('prompt_theme_id', themeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (entriesErr) throw entriesErr;

    const entryCount = entries?.length ?? 0;
    if (entryCount < MIN_ENTRIES_FOR_INSIGHTS) {
      // Not enough material yet — no model call, no row written. The client
      // renders its own empty state from these counts.
      return json({
        insufficient: true,
        theme_name: theme.name,
        count: entryCount,
        needed: MIN_ENTRIES_FOR_INSIGHTS,
      });
    }

    const entriesText = entries.map((e, i) => {
      const date = new Date(e.created_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });
      return `Entry ${i + 1} (${date}):\n${e.content}`;
    }).join('\n\n---\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a thoughtful, warm reflection companion. Below are someone's journal entries, all written in response to prompts under a theme called "${theme.name}". Write an analysis of patterns across these responses specifically.

Your analysis should:
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

    const content = message.content[0].type === 'text' ? message.content[0].text : '';

    const { data: saved, error: insertErr } = await supabase
      .from('theme_insights')
      .insert({ user_id: user.id, theme_id: themeId, content })
      .select('id')
      .single();
    if (insertErr) throw insertErr;

    return json({ id: saved.id, content });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
