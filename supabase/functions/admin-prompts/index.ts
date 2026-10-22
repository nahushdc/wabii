import "@supabase/functions-js/edge-runtime.d.ts"
import { adminHandler, clampInt, HttpError } from '../_shared/admin.ts';
import { PROMPT_DEFAULTS } from '../_shared/prompt-defaults.ts';

Deno.serve(adminHandler(async ({ userId, db, body }) => {
  switch (body.action) {
    case 'list': {
      const { data, error } = await db.from('ai_prompts').select('key, template, updated_at, note');
      if (error) throw new Error(error.message);
      const overrides = new Map((data ?? []).map((r) => [r.key, r]));
      return Object.entries(PROMPT_DEFAULTS).map(([key, def]) => {
        const row = overrides.get(key);
        return {
          key,
          label: def.label,
          description: def.description,
          placeholders: def.placeholders,
          default_template: def.template,
          template: row?.template ?? def.template,
          is_customised: !!row,
          updated_at: row?.updated_at ?? null,
          note: row?.note ?? null,
        };
      });
    }

    case 'save': {
      const key = String(body.key ?? '');
      const template = typeof body.template === 'string' ? body.template : '';
      if (!PROMPT_DEFAULTS[key]) throw new HttpError(400, 'Unknown prompt key');
      if (!template.trim()) throw new HttpError(400, 'Prompt cannot be empty');

      // Block saving a prompt that drops a placeholder the code relies on.
      const missing = PROMPT_DEFAULTS[key].placeholders
        .map((p) => p.name)
        .filter((name) => !template.includes(`{{${name}}}`));
      if (missing.length && body.force !== true) {
        throw new HttpError(409, `Missing placeholders: ${missing.map((m) => `{{${m}}}`).join(', ')}`);
      }

      const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
      const { error } = await db.from('ai_prompts').upsert(
        { key, template, note, updated_by: userId },
        { onConflict: 'key' },
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // Deleting the row makes the edge functions fall back to the shipped default.
    case 'reset': {
      const key = String(body.key ?? '');
      if (!PROMPT_DEFAULTS[key]) throw new HttpError(400, 'Unknown prompt key');
      await db.from('ai_prompts').update({ updated_by: userId }).eq('key', key);
      const { error } = await db.from('ai_prompts').delete().eq('key', key);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case 'history': {
      const key = String(body.key ?? '');
      if (!PROMPT_DEFAULTS[key]) throw new HttpError(400, 'Unknown prompt key');
      const { data, error } = await db
        .from('ai_prompt_versions')
        .select('id, template, note, created_at, created_by')
        .eq('key', key)
        .order('created_at', { ascending: false })
        .limit(clampInt(body.limit, 1, 100, 30));
      if (error) throw new Error(error.message);
      return data;
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
}));
