import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';

// Hands a signed-in user a short-lived Deepgram key so the phone can stream
// audio straight to Deepgram. The long-lived Deepgram key never leaves the
// server, and no audio passes through our servers (so the 150-second limit on
// a relayed connection doesn't apply). The key only has to be valid while the
// connection is being opened.
const TOKEN_TTL_SECONDS = 60;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
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

    const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!deepgramKey) return json({ error: 'Voice transcription is not configured yet.' }, 501);

    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${deepgramKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    });
    if (!res.ok) {
      console.error('Deepgram grant failed:', res.status, await res.text().catch(() => ''));
      return json({ error: 'Could not start voice transcription.', status: res.status }, 502);
    }
    const body = await res.json();
    return json({ access_token: body.access_token, expires_in: body.expires_in ?? TOKEN_TTL_SECONDS });
  } catch (err) {
    console.error('deepgram-token failed:', err);
    return json({ error: 'Could not start voice transcription.' }, 500);
  }
});
