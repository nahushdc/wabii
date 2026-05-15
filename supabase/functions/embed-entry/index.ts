import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  try {
    const { entry_id, content } = await req.json();
    if (!entry_id || !content) {
      return new Response(JSON.stringify({ error: 'entry_id and content required' }), { status: 400 });
    }

    // Generate embedding using Supabase's built-in AI (gte-small, 384 dims, free)
    const model = new Supabase.ai.Session('gte-small');
    const embedding = await model.run(content, { mean_pool: true, normalize: true });

    // Store in Supabase
    const { error } = await supabase
      .from('embeddings')
      .upsert({ entry_id, embedding: JSON.stringify(Array.from(embedding as number[])) });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
