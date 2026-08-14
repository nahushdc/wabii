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
          content: `You are a thoughtful, perceptive reflection companion. Below are someone's recent journal entries.

Notice recurring tensions, questions, or topics they haven't explicitly named but that seem to genuinely matter to them — the kind of thing worth turning into a "pursuit": an ongoing personal question worth deliberately exploring, in the style of "self-sabotage," "why I avoid hard conversations," or "what actually makes me happy."

Suggest 3-5 candidate pursuits grounded specifically in what's actually written — don't invent generic self-help topics that aren't supported by the entries. Don't suggest anything close to these existing pursuits: ${existingNames}.

Respond in exactly this format, one suggestion per block, separated by a blank line, nothing else:
NAME: <a short phrase, 3-8 words>
FOCUS: <one sentence, second person ("you"), describing what to explore>
WHY: <one sentence, second person ("you"), grounded in specific moments from the entries, saying why this seems worth paying attention to right now>

Journal entries:
${entriesText}`,
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const suggestions = parseSuggestions(text);

    return json({ suggestions });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
