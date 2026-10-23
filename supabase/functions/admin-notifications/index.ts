import "@supabase/functions-js/edge-runtime.d.ts"
import { adminHandler, HttpError } from '../_shared/admin.ts';
import { NOTIFICATION_MESSAGE_DEFAULTS, REMINDER_ZONE_DEFAULTS } from '../_shared/notification-messages.ts';

const SETTING_RULES: Record<string, { min: number; max: number }> = {
  days_ahead: { min: 1, max: 30 },
};

Deno.serve(adminHandler(async ({ db, body }) => {
  switch (body.action) {
    case 'list': {
      const [zones, settings, messages] = await Promise.all([
        db.from('notification_zones').select('*').order('start_hour'),
        db.from('notification_settings').select('*'),
        db.from('notification_messages').select('*'),
      ]);
      if (zones.error) throw new Error(zones.error.message);
      if (settings.error) throw new Error(settings.error.message);
      if (messages.error) throw new Error(messages.error.message);

      const rows = new Map((messages.data ?? []).map((m) => [m.key, m]));
      const defaultsByKey = new Map(REMINDER_ZONE_DEFAULTS.map((z) => [z.key, z]));
      const zonesAreDefault = (zones.data ?? []).length === REMINDER_ZONE_DEFAULTS.length &&
        (zones.data ?? []).every((z) => {
          const d = defaultsByKey.get(z.key);
          return d && d.label === z.label && d.start_hour === z.start_hour && d.title === z.title &&
            JSON.stringify(d.bodies) === JSON.stringify(z.bodies);
        });

      return {
        zones: zones.data,
        zones_are_default: zonesAreDefault,
        settings: Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value])),
        messages: Object.entries(NOTIFICATION_MESSAGE_DEFAULTS).map(([key, def]) => {
          const row = rows.get(key);
          const title = row?.title ?? def.title;
          const body = row?.body ?? def.body;
          return {
            key, label: def.label, description: def.description, title, body,
            default_title: def.title, default_body: def.body,
            is_default: title === def.title && body === def.body,
            updated_at: row?.updated_at ?? null,
          };
        }),
      };
    }

    case 'save_zone': {
      const key = String(body.key ?? '').trim();
      const label = String(body.label ?? '').trim();
      const title = String(body.title ?? '').trim();
      const start_hour = Number(body.start_hour);
      const bodies = Array.isArray(body.bodies)
        ? body.bodies.map((b) => String(b).trim()).filter(Boolean)
        : [];

      if (!/^[a-z0-9_-]{1,32}$/.test(key)) throw new HttpError(400, 'Key must be lowercase letters, numbers, - or _');
      if (!label || !title) throw new HttpError(400, 'Label and title are required');
      if (!Number.isInteger(start_hour) || start_hour < 0 || start_hour > 23) throw new HttpError(400, 'Start hour must be 0–23');
      if (bodies.length < 1) throw new HttpError(400, 'Add at least one message');

      const { error } = await db.from('notification_zones').upsert(
        { key, label, title, start_hour, bodies, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (error) {
        if (error.code === '23505') throw new HttpError(409, 'Another zone already starts at that hour');
        throw new Error(error.message);
      }
      return { ok: true };
    }

    case 'delete_zone': {
      const { count, error: countErr } = await db.from('notification_zones').select('key', { count: 'exact', head: true });
      if (countErr) throw new Error(countErr.message);
      if ((count ?? 0) <= 1) throw new HttpError(400, 'At least one zone must remain');
      const { error } = await db.from('notification_zones').delete().eq('key', String(body.key ?? ''));
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'save_setting': {
      const key = String(body.key ?? '');
      const rule = SETTING_RULES[key];
      if (!rule) throw new HttpError(400, 'Unknown setting');
      const value = Number(body.value);
      if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
        throw new HttpError(400, `${key} must be a whole number from ${rule.min} to ${rule.max}`);
      }
      const { error } = await db.from('notification_settings').upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'save_message': {
      const key = String(body.key ?? '');
      if (!NOTIFICATION_MESSAGE_DEFAULTS[key]) throw new HttpError(400, 'Unknown notification');
      const title = String(body.title ?? '').trim();
      const text = String(body.body ?? '').trim();
      if (!title || !text) throw new HttpError(400, 'Title and message are required');
      const { error } = await db.from('notification_messages').upsert(
        { key, title, body: text, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'reset_message': {
      const key = String(body.key ?? '');
      const def = NOTIFICATION_MESSAGE_DEFAULTS[key];
      if (!def) throw new HttpError(400, 'Unknown notification');
      const { error } = await db.from('notification_messages').upsert(
        { key, title: def.title, body: def.body, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // Puts the time-of-day reminders back to the text every account started with.
    case 'restore_reminder_defaults': {
      const { error: delErr } = await db.from('notification_zones').delete().neq('key', '');
      if (delErr) throw new Error(delErr.message);
      const now = new Date().toISOString();
      const { error } = await db.from('notification_zones').insert(
        REMINDER_ZONE_DEFAULTS.map((z) => ({ ...z, updated_at: now })),
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
}));
