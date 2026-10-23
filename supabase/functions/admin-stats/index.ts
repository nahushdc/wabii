import "@supabase/functions-js/edge-runtime.d.ts"
import { adminHandler, clampInt, HttpError, safeTimezone } from '../_shared/admin.ts';

// Deepgram Nova-3 streaming list prices (USD per audio minute). Override with
// secrets if the plan's rate differs.
const RATE_EN = Number(Deno.env.get('DEEPGRAM_RATE_EN_PER_MIN') ?? '0.0077');
const RATE_MULTI = Number(Deno.env.get('DEEPGRAM_RATE_MULTI_PER_MIN') ?? '0.0092');
// Plan concurrency limit — the dashboard warns as live sessions approach it.
const CONCURRENCY_LIMIT = Number(Deno.env.get('DEEPGRAM_CONCURRENCY_LIMIT') ?? '50');

Deno.serve(adminHandler(async ({ db, body }) => {
  const days = clampInt(body.days, 1, 365, 30);
  const tz = safeTimezone(body.tz);

  switch (body.action) {
    case 'users': {
      const { data, error } = await db.rpc('admin_user_stats', { p_days: days, p_tz: tz });
      if (error) throw new Error(error.message);
      return data;
    }
    case 'voice_usage': {
      const { data, error } = await db.rpc('admin_voice_usage', {
        p_days: days, p_tz: tz, p_rate_en: RATE_EN, p_rate_multi: RATE_MULTI,
      });
      if (error) throw new Error(error.message);
      return { ...data, rates: { en: RATE_EN, multi: RATE_MULTI } };
    }
    case 'concurrency': {
      const hours = clampInt(body.hours, 1, 24 * 14, 72);
      const { data, error } = await db.rpc('admin_voice_concurrency', { p_hours: hours });
      if (error) throw new Error(error.message);
      return { ...data, limit: CONCURRENCY_LIMIT };
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
}));
