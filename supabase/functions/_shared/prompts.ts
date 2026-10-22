import { PROMPT_DEFAULTS } from './prompt-defaults.ts';

// Replaces {{name}} tokens. Uses a replacer function so `$&`-style sequences in
// user-written content are never interpreted.
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (name in vars ? vars[name] : match));
}

// Loads the prompt for `key` — the admin-edited row in `ai_prompts` if there
// is one, otherwise the default shipped with the functions — and fills in vars.
// `supabase` must be a service-role client (ai_prompts is admin-only under RLS).
// deno-lint-ignore no-explicit-any
export async function getPrompt(supabase: any, key: string, vars: Record<string, string> = {}): Promise<string> {
  let template = PROMPT_DEFAULTS[key]?.template ?? '';
  try {
    const { data } = await supabase.from('ai_prompts').select('template').eq('key', key).maybeSingle();
    if (data?.template) template = data.template;
  } catch {
    // fall back to the shipped default
  }
  return fillTemplate(template, vars);
}
