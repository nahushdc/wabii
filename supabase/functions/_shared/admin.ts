import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js';

// The dashboard is a browser app on another origin, so every admin-* function
// has to answer CORS preflights.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Verifies the caller is signed in AND passes is_admin(), then hands back a
// service-role client for the actual data work. The service-role key stays in
// the function environment — it never reaches the browser.
export async function requireAdmin(req: Request): Promise<{ userId: string; db: SupabaseClient }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new HttpError(401, 'Missing Authorization header');

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) throw new HttpError(401, 'Invalid session');

  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin');
  if (adminErr) throw new HttpError(500, adminErr.message);
  if (isAdmin !== true) throw new HttpError(403, 'Not an admin');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return { userId: userData.user.id, db };
}

// Wraps a handler with CORS, admin auth and uniform error responses.
export function adminHandler(
  handler: (ctx: { userId: string; db: SupabaseClient; body: Record<string, unknown> }) => Promise<unknown>,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      const ctx = await requireAdmin(req);
      const body = await req.json().catch(() => ({}));
      return json(await handler({ ...ctx, body }));
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      return json({ error: (err as Error).message ?? 'Unexpected error' }, 500);
    }
  };
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function safeTimezone(value: unknown): string {
  if (typeof value !== 'string') return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}
