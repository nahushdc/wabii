import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';
import AnthropicClient from 'npm:@anthropic-ai/sdk';
import { Anthropic } from 'npm:@posthog/ai/anthropic';
import { PostHog } from 'npm:posthog-node';
import { getPrompt } from '../_shared/prompts.ts';

const posthogProjectToken = Deno.env.get('POSTHOG_PROJECT_TOKEN');
const posthogHost = Deno.env.get('POSTHOG_HOST');
const posthog = posthogProjectToken && posthogHost
  ? new PostHog(posthogProjectToken, {
      host: posthogHost,
      privacyMode: true,
      flushAt: 1,
      flushInterval: 0,
      enableExceptionAutocapture: true,
    })
  : undefined;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const anthropic = posthog
  ? new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')!, posthog })
  : new AnthropicClient({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

// Fewer entries than this and there isn't enough signal to spot a real,
// recurring thread worth naming as a pursuit.
const MIN_ENTRIES_FOR_SUGGESTIONS = 5;
// Cap how many entries feed the prompt — most recent is most relevant, and
// keeps the call cheap regardless of how large someone's journal has grown.
const MAX_ENTRIES_FOR_PROMPT = 30;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Suggestion = { name: string; focus: string; motivation: string };

function parseSuggestions(text: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const nameMatch = block.match(/NAME:\s*(.+)/i);
    const focusMatch = block.match(/FOCUS:\s*(.+)/i);
    const motivationMatch = block.match(/WHY:\s*(.+)/i);
    const name = nameMatch?.[1]?.trim();
    const focus = focusMatch?.[1]?.trim();
    const motivation = motivationMatch?.[1]?.trim();
    if (name) suggestions.push({ name, focus: focus ?? '', motivation: motivation ?? '' });
  }
  return suggestions;
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

    const { data: entries, error: entriesErr } = await supabase
      .from('journal_entries')
      .select('content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ENTRIES_FOR_PROMPT);
    if (entriesErr) throw entriesErr;

    const entryCount = entries?.length ?? 0;
    if (entryCount < MIN_ENTRIES_FOR_SUGGESTIONS) {
      return json({ insufficient: true, count: entryCount, needed: MIN_ENTRIES_FOR_SUGGESTIONS });
    }

    const { data: existingThemes } = await supabase
      .from('prompt_themes')
      .select('name')
      .eq('user_id', user.id);
    const existingNames = (existingThemes ?? []).map(t => t.name).join(', ') || 'none yet';

    const entriesText = entries!.slice().reverse().map((e, i) => {
      const date = new Date(e.created_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });
      return `Entry ${i + 1} (${date}):\n${e.content}`;
    }).join('\n\n---\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 700,
      messages: [
        {
          role: 'user',
          content: await getPrompt(supabase, 'suggest_pursuits', { existing_names: existingNames, entries: entriesText }),
        },
      ],
      ...(posthog ? {
        posthogDistinctId: user.id,
        posthogTraceId: crypto.randomUUID(),
        posthogProperties: { $ai_session_id: `suggest-pursuits-${user.id}` },
      } : {}),
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const suggestions = parseSuggestions(text);

    return json({ suggestions });
  } catch (err) {
    return json({ error: err.message }, 500);
  } finally {
    await posthog?.flush();
  }
});
