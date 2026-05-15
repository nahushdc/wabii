import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

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

    return new Response(JSON.stringify({ results: data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
