import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';
import WS from 'npm:ws@8';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
);

// Service-role client, used only to write usage rows into `voice_sessions`
// for the admin dashboard. Logging is best-effort: a failed write must never
// affect a user's transcription.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const HEARTBEAT_MS = 30_000;

// Relays raw PCM audio from the app straight through to Deepgram's live
// streaming endpoint and relays transcript results straight back — the
// Deepgram API key never reaches the client. WebSocket clients can't send
// custom headers, so auth comes in via a query param (this function must be
// deployed with --no-verify-jwt so Supabase's own gateway doesn't reject the
// upgrade request before we get to check it ourselves).
Deno.serve(async (req) => {
  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response(JSON.stringify({ error: "request isn't trying to upgrade to WebSocket." }), { status: 400 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const language = url.searchParams.get('language') === 'multi' ? 'multi' : 'en';
  if (!token) {
    return new Response(JSON.stringify({ error: 'Auth token not provided' }), { status: 403 });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: 'Invalid token provided' }), { status: 403 });
  }

  const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!deepgramKey) {
    return new Response(JSON.stringify({ error: 'Voice transcription is not configured yet.' }), { status: 501 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  // --- usage logging -------------------------------------------------------
  const startedAt = Date.now();
  let audioBytes = 0;
  let finished = false;
  let sessionId: string | null = null;
  const sessionReady = admin
    .from('voice_sessions')
    .insert({ user_id: data.user.id, language, status: 'active' })
    .select('id')
    .single()
    .then(({ data: row }) => { sessionId = row?.id ?? null; }, () => {});

  const heartbeat = setInterval(async () => {
    await sessionReady;
    if (sessionId) {
      admin.from('voice_sessions')
        .update({ last_seen_at: new Date().toISOString(), audio_bytes: audioBytes })
        .eq('id', sessionId)
        .then(() => {}, () => {});
    }
  }, HEARTBEAT_MS);

  // Runs once per session, however it ends. A session that never got going
  // because Deepgram refused it (e.g. 429 = concurrency limit hit) is recorded
  // as 'rejected' so the dashboard can show when the limit is being hit.
  async function finish(status: 'completed' | 'error' | 'rejected', rejectReason?: string) {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    await sessionReady;
    if (!sessionId) return;
    const now = new Date();
    await admin.from('voice_sessions').update({
      status,
      reject_reason: rejectReason ?? null,
      ended_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      duration_seconds: (now.getTime() - startedAt) / 1000,
      audio_bytes: audioBytes,
    }).eq('id', sessionId).then(() => {}, () => {});
  }

  // Nova-3 multilingual (code-switching between English + a handful of
  // other languages including Hindi) for India, Nova-3 monolingual English
  // everywhere else. endpointing=100 is Deepgram's recommendation for
  // multilingual code-switching; harmless for monolingual too.
  const deepgramUrl =
    `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}` +
    `&encoding=linear16&sample_rate=16000&channels=1` +
    `&punctuate=true&smart_format=true&interim_results=true&endpointing=100`;

  const deepgramSocket = new WS(deepgramUrl, { headers: { Authorization: `Token ${deepgramKey}` } });

  // Audio chunks can arrive from the client before Deepgram's socket has
  // finished connecting — queue them rather than dropping them.
  const pendingAudio: ArrayBuffer[] = [];
  let deepgramOpen = false;

  deepgramSocket.on('open', () => {
    deepgramOpen = true;
    for (const chunk of pendingAudio.splice(0)) deepgramSocket.send(chunk);
  });

  deepgramSocket.on('message', (data: Buffer) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data.toString());
  });

  // Deepgram answers the upgrade with a plain HTTP error (429 when the
  // account's concurrent-connection limit is reached) instead of opening.
  deepgramSocket.on('unexpected-response', (_req: unknown, res: { statusCode?: number; resume: () => void }) => {
    res.resume();
    console.warn('Deepgram refused connection:', res.statusCode);
    finish('rejected', `deepgram_${res.statusCode ?? 'unknown'}`);
    deepgramSocket.terminate();
  });

  deepgramSocket.on('error', (err: Error) => {
    console.warn('Deepgram socket error:', err.message);
    finish(deepgramOpen ? 'error' : 'rejected', deepgramOpen ? `deepgram_error: ${err.message}` : `connect_failed: ${err.message}`);
  });

  deepgramSocket.on('close', (code: number) => {
    // 1000 = normal; anything else after we connected means Deepgram dropped us.
    finish(!deepgramOpen ? 'rejected' : code === 1000 || code === 1005 ? 'completed' : 'error',
      !deepgramOpen ? 'closed_before_open' : code === 1000 || code === 1005 ? undefined : `deepgram_close_${code}`);
    if (socket.readyState === WebSocket.OPEN) socket.close();
  });

  socket.onmessage = (e) => {
    if (typeof e.data === 'string') {
      // Client sends a small JSON control message to flush + close cleanly.
      if (deepgramOpen) deepgramSocket.send(e.data);
      return;
    }
    const chunk = e.data as ArrayBuffer;
    audioBytes += chunk.byteLength;
    if (deepgramOpen) deepgramSocket.send(chunk);
    else pendingAudio.push(chunk);
  };

  socket.onerror = (e) => console.warn('Client socket error:', (e as ErrorEvent).message);

  EdgeRuntime.waitUntil(
    new Promise<void>((resolve) => {
      socket.onclose = async () => {
        if (deepgramSocket.readyState === WS.OPEN) deepgramSocket.close();
        else if (deepgramSocket.readyState === WS.CONNECTING) deepgramSocket.terminate();
        await finish('completed');
        resolve();
      };
    })
  );

  return response;
});
