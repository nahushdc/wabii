import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Requires a DEEPGRAM_API_KEY secret (supabase secrets set DEEPGRAM_API_KEY=...).
Deno.serve(async (req) => {
  try {
    const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!deepgramKey) return json({ error: 'Voice transcription is not configured yet.' }, 501);

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

    const audioBytes = await audio.arrayBuffer();

    const res = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': audio.type || 'audio/mp4',
        },
        body: audioBytes,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return json({ error: `Transcription failed: ${errText}` }, 502);
    }

    const result = await res.json();
    const text = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    return json({ text });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
