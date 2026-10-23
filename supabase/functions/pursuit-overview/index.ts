import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';
import Anthropic from 'npm:@anthropic-ai/sdk';

// A pursuit is a saved question about yourself, answered from the whole
// journal. This function returns everything the pursuit page needs: how many
// entries relate to it, a weekly trend, the most related entries, and a few
// AI-written patterns (cached, and only regenerated when enough new entries
// have matched). With { counts: true } it instead returns the match count for
// every pursuit, for the cards on Reflect.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

// Cosine similarity floor for an entry to count as related. gte-small scores
// run high even for loosely related text, so this sits well above the noise.
const MIN_SIMILARITY = Number(Deno.env.get('PURSUIT_MIN_SIMILARITY') ?? '0.82');
const MIN_ENTRIES_FOR_PATTERNS = 3;
const ENTRIES_FOR_PATTERNS = 14;
const REGENERATE_AFTER_NEW_MATCHES = 3;
const REGENERATE_AFTER_DAYS = 7;
const WEEKS_IN_TREND = 8;
const RELATED_ENTRIES_SHOWN = 6;
const SNIPPET_CHARS = 260;
const MAX_SETUPS_PER_CALL = 3;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

type Pursuit = { id: string; name: string; focus: string | null; motivation: string | null };
type Match = { id: string; content: string; created_at: string; similarity: number; tagged: boolean };

async function embed(text: string): Promise<number[]> {
  const model = new Supabase.ai.Session('gte-small');
  const out = await model.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as number[]);
}

// First time a pursuit is looked at: have the AI write a few sentences in the
// voice of a private journal, then embed them with the question itself, so
// matching works on meaning and not on the pursuit's exact words.
async function ensureQueries(userId: string, pursuit: Pursuit): Promise<void> {
  const { count } = await supabase
    .from('pursuit_queries')
    .select('id', { count: 'exact', head: true })
    .eq('pursuit_id', pursuit.id);
  if ((count ?? 0) > 0) return;

  const context = [
    pursuit.focus ? `What they want to explore: ${pursuit.focus}` : '',
    pursuit.motivation ? `Why it matters to them: ${pursuit.motivation}` : '',
  ].filter(Boolean).join('\n');

  let phrases: string[] = [];
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Someone is working out this question about themselves: "${pursuit.name}".\n${context}\n\nWrite 6 short first-person sentences (under 20 words each) that this person might plausibly write in a private journal when this question is on their mind. Vary the situations and use natural, everyday language. Do not quote the question itself. Return only a JSON array of 6 strings.`,
      }],
    });
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const parsed = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    if (Array.isArray(parsed)) phrases = parsed.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 8);
  } catch {
    // Fall back to the question and its description alone.
  }

  const texts = [pursuit.name, pursuit.focus, pursuit.motivation, ...phrases]
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map(t => t.trim().slice(0, 600));

  const rows = [];
  for (const text of texts) {
    rows.push({ pursuit_id: pursuit.id, user_id: userId, text, embedding: JSON.stringify(await embed(text)) });
  }
  if (rows.length > 0) {
    const { error } = await supabase.from('pursuit_queries').insert(rows);
    if (error) throw error;
  }
}

async function matchesFor(userId: string, pursuitId: string): Promise<Match[]> {
  const { data, error } = await supabase.rpc('match_pursuit_entries', {
    p_pursuit_id: pursuitId,
    p_user_id: userId,
    p_min_similarity: MIN_SIMILARITY,
    p_limit: 500,
  });
  if (error) throw error;
  return (data ?? []) as Match[];
}

function weekStart(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7)); // Monday
  return copy.toISOString().slice(0, 10);
}

function weeklyTrend(matches: Match[]) {
  const now = new Date();
  const thisWeek = new Date(weekStart(now) + 'T00:00:00Z');
  const buckets: { week_start: string; count: number }[] = [];
  for (let i = WEEKS_IN_TREND - 1; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.push({ week_start: d.toISOString().slice(0, 10), count: 0 });
  }
  for (const m of matches) {
    const bucket = buckets.find(b => b.week_start === weekStart(new Date(m.created_at)));
    if (bucket) bucket.count++;
  }
  return buckets;
}

type StoredPattern = { title: string; entry_ids: string[] };

async function writePatterns(pursuit: Pursuit, entries: Match[]): Promise<StoredPattern[]> {
  const ordered = [...entries].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const entriesText = ordered.map((e, i) => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Entry ${i + 1} (${date}):\n${e.content.slice(0, 1200)}`;
  }).join('\n\n---\n\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `Someone is trying to answer this question about themselves: "${pursuit.name}".\n${pursuit.focus ? `What they want to explore: ${pursuit.focus}\n` : ''}${pursuit.motivation ? `Why it matters to them: ${pursuit.motivation}\n` : ''}\nBelow are journal entries from across their whole journal that relate to it. Find 2 to 4 things that keep showing up in them. Each must be grounded strictly in these entries and supported by at least two of them. Write each as one plain sentence in the second person ("You..."), under 14 words, without diagnosing or advising.\n\nReturn only JSON: {"patterns":[{"title":"...","entries":[1,4]}]} where "entries" are the entry numbers that support it.\n\n${entriesText}`,
    }],
  });
  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const out: StoredPattern[] = [];
  for (const p of parsed?.patterns ?? []) {
    const ids = (Array.isArray(p?.entries) ? p.entries : [])
      .map((n: number) => ordered[n - 1]?.id)
      .filter((id: string | undefined): id is string => !!id);
    if (typeof p?.title === 'string' && ids.length >= 2) out.push({ title: p.title.trim(), entry_ids: ids });
  }
  return out.slice(0, 4);
}

async function patternsFor(userId: string, pursuit: Pursuit, matches: Match[]) {
  if (matches.length < MIN_ENTRIES_FOR_PATTERNS) return { stored: [] as StoredPattern[], updatedAt: null as string | null };

  const { data: cached } = await supabase
    .from('theme_insights')
    .select('content, created_at')
    .eq('theme_id', pursuit.id)
    .eq('insight_type', 'overview')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let stored: StoredPattern[] = [];
  let updatedAt: string | null = null;
  let fresh = false;
  if (cached) {
    try {
      stored = JSON.parse(cached.content).patterns ?? [];
      updatedAt = cached.created_at;
      const newSince = matches.filter(m => new Date(m.created_at) > new Date(cached.created_at)).length;
      const ageDays = (Date.now() - new Date(cached.created_at).getTime()) / 86400000;
      fresh = newSince < REGENERATE_AFTER_NEW_MATCHES && !(ageDays > REGENERATE_AFTER_DAYS && newSince >= 1);
    } catch {
      fresh = false;
    }
  }
  if (fresh) return { stored, updatedAt };

  const top = [...matches].sort((a, b) => b.similarity - a.similarity).slice(0, ENTRIES_FOR_PATTERNS);
  try {
    stored = await writePatterns(pursuit, top);
  } catch (err) {
    console.error('pattern write failed:', err);
    return { stored, updatedAt }; // keep showing the last good version
  }
  const { data: saved } = await supabase
    .from('theme_insights')
    .insert({ user_id: userId, theme_id: pursuit.id, content: JSON.stringify({ patterns: stored }), insight_type: 'overview' })
    .select('created_at')
    .single();
  return { stored, updatedAt: saved?.created_at ?? new Date().toISOString() };
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

    if (body?.counts === true) {
      const { data: pursuits } = await supabase
        .from('prompt_themes')
        .select('id, name, focus, motivation')
        .eq('user_id', user.id);
      const counts: Record<string, number> = {};
      let setups = 0;
      for (const p of (pursuits ?? []) as Pursuit[]) {
        const { count } = await supabase
          .from('pursuit_queries')
          .select('id', { count: 'exact', head: true })
          .eq('pursuit_id', p.id);
        if ((count ?? 0) === 0) {
          if (setups >= MAX_SETUPS_PER_CALL) continue; // set up the rest on a later call
          setups++;
          await ensureQueries(user.id, p);
        }
        counts[p.id] = (await matchesFor(user.id, p.id)).length;
      }
      return json({ counts });
    }

    const pursuitId = body?.pursuit_id;
    if (!pursuitId) return json({ error: 'pursuit_id required' }, 400);

    const { data: pursuit, error: pursuitErr } = await supabase
      .from('prompt_themes')
      .select('id, name, focus, motivation')
      .eq('id', pursuitId)
      .eq('user_id', user.id)
      .single();
    if (pursuitErr || !pursuit) return json({ error: 'pursuit not found' }, 404);

    // The question changed: rebuild what it is matched against.
    if (body?.reset === true) {
      await supabase.from('pursuit_queries').delete().eq('pursuit_id', pursuit.id);
    }
    await ensureQueries(user.id, pursuit as Pursuit);

    const matches = await matchesFor(user.id, pursuit.id);
    const { stored, updatedAt } = await patternsFor(user.id, pursuit as Pursuit, matches);

    const byId = new Map(matches.map(m => [m.id, m]));
    const patterns = stored.map(p => {
      const dates = p.entry_ids
        .map(id => byId.get(id)?.created_at)
        .filter((d): d is string => !!d)
        .sort();
      return {
        title: p.title,
        entry_count: dates.length,
        first_date: dates[0] ?? null,
        last_date: dates[dates.length - 1] ?? null,
      };
    }).filter(p => p.entry_count >= 2);

    const related = [...matches]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, RELATED_ENTRIES_SHOWN)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(m => ({ id: m.id, created_at: m.created_at, snippet: m.content.slice(0, SNIPPET_CHARS) }));

    const response: Record<string, unknown> = {
      pursuit: { id: pursuit.id, name: pursuit.name, focus: pursuit.focus, motivation: pursuit.motivation },
      total: matches.length,
      weekly: weeklyTrend(matches),
      patterns,
      entries: related,
      updated_at: updatedAt,
    };
    if (body?.debug === true) {
      response.debug = { min_similarity: MIN_SIMILARITY, similarities: matches.map(m => Number(m.similarity.toFixed(3))) };
    }
    return json(response);
  } catch (err) {
    console.error('pursuit-overview failed:', err);
    return json({ error: err.message }, 500);
  }
});
