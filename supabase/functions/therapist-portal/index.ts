import { createClient } from 'npm:@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // ── POST with Bearer: create a therapist link (called from app) ──────────
  if (req.method === 'POST' && req.headers.get('Authorization')) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const therapistEmail = body?.therapist_email?.trim();
    const password = body?.password?.trim();
    if (!therapistEmail) return json({ error: 'therapist_email required' }, 400);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const passwordHash = password ? await hashPassword(password) : null;

    const { data: link, error: insertError } = await supabase
      .from('therapist_links')
      .insert({ user_id: user.id, therapist_email: therapistEmail, token, expires_at: expiresAt, password_hash: passwordHash })
      .select().single();

    if (insertError) return json({ error: insertError.message }, 500);

    // Portal URL points to the Vercel-hosted page
    const portalBase = Deno.env.get('THERAPIST_PORTAL_URL') ?? 'https://wabii-portal.vercel.app';
    const portalUrl = `${portalBase}?token=${token}`;
    return json({ id: link.id, url: portalUrl, expires_at: expiresAt });
  }

  // ── POST with form body: validate password ───────────────────────────────
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { token, password } = body;
    if (!token) return json({ error: 'token required' }, 400);

    const { data: link } = await supabase.from('therapist_links').select('*').eq('token', token).single();
    if (!link || link.revoked || new Date(link.expires_at) < new Date()) return json({ error: 'invalid_token' }, 403);
    if (!link.password_hash) return json({ authenticated: true });

    const hash = await hashPassword(password ?? '');
    if (hash !== link.password_hash) return json({ error: 'wrong_password' }, 401);
    return json({ authenticated: true });
  }

  // ── GET: return portal data as JSON ─────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return json({ error: 'token required' }, 400);

    const { data: link } = await supabase.from('therapist_links').select('*').eq('token', token).single();
    if (!link) return json({ error: 'not_found' }, 404);
    if (link.revoked) return json({ error: 'revoked' }, 403);
    if (new Date(link.expires_at) < new Date()) return json({ error: 'expired' }, 403);

    // If password protected, require authentication first
    if (link.password_hash) return json({ requires_password: true, expires_at: link.expires_at });

    return json(await fetchPortalData(link));
  }

  return json({ error: 'Method not allowed' }, 405);
});

async function fetchPortalData(link: any) {
  const { data: { user } } = await supabase.auth.admin.getUserById(link.user_id);
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Your patient';

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: entries } = await supabase
    .from('journal_entries').select('content, created_at')
    .eq('user_id', link.user_id).gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false });

  const { data: summaries } = await supabase
    .from('weekly_digests').select('content, week_start')
    .eq('user_id', link.user_id).order('week_start', { ascending: false });

  return {
    user_name: userName,
    expires_at: link.expires_at,
    entries: entries ?? [],
    summaries: summaries ?? [],
  };
}
