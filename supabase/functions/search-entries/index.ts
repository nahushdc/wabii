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

// Cap how many matched entries feed the summary — keeps the prompt small and
// the summary focused on the strongest matches rather than every result.
const MAX_ENTRIES_FOR_SUMMARY = 8;

// Fallback used only if the `ai_prompts` row is missing (e.g. before the
// migration ran on some environment).
const DEFAULT_TEMPLATE = `Someone searched their own journal for: "{{query}}"

Below are journal entries that matched. Respond in exactly this format:

SHORT: <one short sentence, under 15 words, directly answering what they asked, second person ("you")>
DETAILED:
<2-3 short bullet points, one per line, no numbering or dashes, under 20 words each>

Ground everything strictly in what's actually written — don't invent details or generalize beyond the entries.

Journal entries:
{{entries}}`;

type Summary = { short: string; points: string[] };

async function getPromptTemplate(): Promise<string> {
  const { data } = await supabase.from('ai_prompts').select('template').eq('key', 'search_summary').maybeSingle();
  return data?.template ?? DEFAULT_TEMPLATE;
}

function parsePoints(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim().replace(/^[-•*\d.)]+\s*/, ''))
    .filter(Boolean);
}

function parseSummary(text: string): Summary {
  const detailedIdx = text.indexOf('DETAILED:');
  const shortPart = (detailedIdx === -1 ? text : text.slice(0, detailedIdx))
    .replace(/^SHORT:\s*/i, '')
    .trim();
  const detailedPart = detailedIdx === -1 ? '' : text.slice(detailedIdx + 'DETAILED:'.length);
  return { short: shortPart, points: parsePoints(detailedPart) };
}

async function summarizeResults(query: string, entries: { content: string; created_at: string }[]): Promise<Summary> {
  const entriesText = entries.slice(0, MAX_ENTRIES_FOR_SUMMARY).map((e, i) => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    return `Entry ${i + 1} (${date}):\n${e.content}`;
  }).join('\n\n---\n\n');

  const template = await getPromptTemplate();
  const prompt = template
    .replaceAll('{{query}}', query)
    .replaceAll('{{entries}}', entriesText);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  return parseSummary(text);
}

Deno.serve(async (req) => {
  try {
    const { query, user_id, match_count = 10 } = await req.json();
    if (!query || !user_id) {
      return new Response(JSON.stringify({ error: 'query and user_id required' }), { status: 400 });
    }

    // Embed the search query
    const model = new Supabase.ai.Session('gte-small');
    const embedding = await model.run(query, { mean_pool: true, normalize: true });

    // Find similar entries
    const { data, error } = await supabase.rpc('match_journal_entries', {
      query_embedding: JSON.stringify(Array.from(embedding as number[])),
      match_user_id: user_id,
      match_count,
    });

    if (error) throw error;

    const results = data ?? [];
    let summary: Summary = { short: '', points: [] };
    if (results.length > 0) {
      try {
        summary = await summarizeResults(query, results);
      } catch {
        // A failed summary shouldn't fail the whole search — the client
        // just won't show a summary card if this comes back empty.
      }
    }

    return new Response(JSON.stringify({ results, summary_short: summary.short, summary_points: summary.points }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
