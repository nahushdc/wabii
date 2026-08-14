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

// Pattern insight needs multiple logged occurrences to say anything about
// frequency/timing — Theme insight can work off a single relevant entry.
const MIN_ENTRIES_FOR_PATTERN = 3;
const MAX_ENTRIES_FOR_THEME = 10;

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
    const insightType: 'theme' | 'pattern' = body?.insight_type === 'theme' ? 'theme' : 'pattern';
    if (!themeId) return json({ error: 'theme_id required' }, 400);

    const { data: theme, error: themeErr } = await supabase
      .from('prompt_themes')
      .select('name, focus, motivation')
      .eq('id', themeId)
      .eq('user_id', user.id)
      .single();
    if (themeErr || !theme) return json({ error: 'theme not found' }, 404);

    const focusContext = theme.focus ? `\nWhat they wanted to explore with this pursuit: ${theme.focus}` : '';
    const motivationContext = theme.motivation ? `\nWhy this matters to them: ${theme.motivation}` : '';

    if (insightType === 'theme') {
      // Content-based, semantic — pull the entries most related to this
      // pursuit from across the WHOLE journal (not just ones explicitly
      // logged under it), the same way search-entries finds matches.
      const model = new Supabase.ai.Session('gte-small');
      const query = [theme.name, theme.focus].filter(Boolean).join(' — ');
      const embedding = await model.run(query, { mean_pool: true, normalize: true });

      const { data: matches, error: matchErr } = await supabase.rpc('match_journal_entries', {
        query_embedding: JSON.stringify(Array.from(embedding as number[])),
        match_user_id: user.id,
        match_count: MAX_ENTRIES_FOR_THEME,
      });
      if (matchErr) throw matchErr;

      if (!matches || matches.length === 0) {
        // No journal entries exist yet at all — nothing for embeddings to match against.
        return json({ insufficient: true, kind: 'theme', theme_name: theme.name });
      }

      const entriesText = matches.map((e: any, i: number) => {
        const date = new Date(e.created_at).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        });
        return `Entry ${i + 1} (${date}, ${Math.round(e.similarity * 100)}% related):\n${e.content}`;
      }).join('\n\n---\n\n');

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: `You are a thoughtful reflection companion. Someone has a "pursuit" — an ongoing personal question they're exploring — described as "${theme.name}".${focusContext}${motivationContext}

Below are journal entries from across their whole journal that are most semantically related to this pursuit (they weren't necessarily written specifically for it). Write a short (3-4 sentence) description of what this pursuit actually seems to be about for them — what's underneath it, grounded strictly in these entries. This is about content and meaning, not timing or frequency. Don't just restate the pursuit's name back. Second person ("you"). Plain prose, no headers, no bullet points.

Journal entries:
${entriesText}`,
          },
        ],
      });

      const content = message.content[0].type === 'text' ? message.content[0].text : '';

      const { data: saved, error: insertErr } = await supabase
        .from('theme_insights')
        .insert({ user_id: user.id, theme_id: themeId, content, insight_type: 'theme' })
        .select('id')
        .single();
      if (insertErr) throw insertErr;

      return json({ id: saved.id, content, insight_type: 'theme' });
    }

    // Pattern — structural/temporal, requires multiple entries explicitly
    // logged under this pursuit so there's an actual timeline to analyze.
    const { data: entries, error: entriesErr } = await supabase
      .from('journal_entries')
      .select('content, created_at')
      .eq('prompt_theme_id', themeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (entriesErr) throw entriesErr;

    const entryCount = entries?.length ?? 0;
    if (entryCount < MIN_ENTRIES_FOR_PATTERN) {
      return json({
        insufficient: true,
        kind: 'pattern',
        theme_name: theme.name,
        count: entryCount,
        needed: MIN_ENTRIES_FOR_PATTERN,
      });
    }

    const entriesText = entries.map((e, i) => {
      const date = new Date(e.created_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });
      const time = new Date(e.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `Entry ${i + 1} (${date}, ${time}):\n${e.content}`;
    }).join('\n\n---\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a thoughtful, warm reflection companion. Below are someone's journal entries, all logged over time under a pursuit called "${theme.name}".${focusContext}${motivationContext}

Analyze the STRUCTURE and TIMING of when this comes up — not what it's about in general, but specifically:
- Frequency: how often it recurs
- Timing: any pattern in time of day, day of week, or life circumstance
- Triggers: what seems to set it off, based on what's written right before/around it
- Sequence: how it tends to escalate, resolve, or repeat across entries

Be honest but kind — this is for the person's own reflection, not an evaluation. Be specific and grounded in the entries, not generic. 3–4 paragraphs. No bullet points. No headers. Just thoughtful prose.

Journal entries:
${entriesText}`,
        },
      ],
    });

    const content = message.content[0].type === 'text' ? message.content[0].text : '';

    const { data: saved, error: insertErr } = await supabase
      .from('theme_insights')
      .insert({ user_id: user.id, theme_id: themeId, content, insight_type: 'pattern' })
      .select('id')
      .single();
    if (insertErr) throw insertErr;

    return json({ id: saved.id, content, insight_type: 'pattern' });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
