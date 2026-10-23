import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';

// Permanently deletes the calling user's account. Every user-owned table
// (journal entries, tags, reflections, reminders, chats, ...) references
// auth.users with ON DELETE CASCADE, so removing the auth user removes all of
// their data in one step. Only ever acts on the user identified by the
// caller's own JWT — there is no way to name another user.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in' }, 401);

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Not signed in' }, 401);

    // Guard against an accidental call: the client must explicitly confirm.
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== true) return json({ error: 'Deletion not confirmed' }, 400);

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteErr) throw deleteErr;

    return json({ success: true });
  } catch (err) {
    console.error('delete-account failed:', err);
    return json({ error: 'Could not delete the account. Please try again.' }, 500);
  }
});
