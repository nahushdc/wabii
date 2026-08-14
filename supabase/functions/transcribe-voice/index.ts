import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Requires an OPENAI_API_KEY secret (supabase secrets set OPENAI_API_KEY=...) —
// this project only has ANTHROPIC_API_KEY configured today, and Claude doesn't
// do audio transcription, so voice entries won't transcribe until that's added.
Deno.serve(async (req) => {
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) return json({ error: 'Voice transcription is not configured yet.' }, 501);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const incomingForm = await req.formData();
    const audio = incomingForm.get('audio');
    if (!audio || !(audio instanceof File)) return json({ error: 'audio file required' }, 400);

    const openaiForm = new FormData();
    openaiForm.append('file', audio, 'recording.m4a');
    openaiForm.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: openaiForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ error: `Transcription failed: ${errText}` }, 502);
    }

    const result = await res.json();
    return json({ text: result.text ?? '' });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
