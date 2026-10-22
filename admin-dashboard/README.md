# Wabii control panel

A small web app for editing AI prompts and reminder notification text, and for checking Deepgram credit and voice usage. It talks only to the `admin-*` Supabase edge functions, and only accounts listed in `admin_users` can use it.

## Run locally

```bash
npm install
npm run dev
```

It reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the repo-root `.env.local`.
Open http://localhost:5173/?mock to click through the screens with sample data (local only).

## One-time setup in Supabase

1. In the SQL editor, run these in order: `admin_foundation.sql`, `voice_sessions.sql`, `admin_stats.sql`, `ai_prompts_versioning.sql`, `notification_templates.sql` (all in `supabase/sql/`).
2. Deploy the functions: `supabase functions deploy admin-prompts admin-notifications admin-deepgram admin-stats`.
   Also redeploy the functions that now read prompts and notification text from the database.
3. For the Deepgram credit panel, set a key that can read billing: `supabase secrets set DEEPGRAM_BILLING_KEY=...`
4. For Google sign-in, add the panel's address (e.g. `http://localhost:5173` and the hosted URL) under Authentication → URL Configuration → Redirect URLs.

## Hosting

Deploy this folder to Vercel (root directory `admin-dashboard`). Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as environment variables there.
