import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const configError = !url || !anonKey
  ? 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.'
  : null;

export const supabase = createClient(url ?? 'http://missing.invalid', anonKey ?? 'missing');

// Sample-data mode for working on the screens before the admin functions are
// deployed. Local dev only: open http://localhost:5173/?mock
export const MOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Calls one of the admin-* edge functions. They check the caller is an admin
// and do the work with the service role, so the browser never holds that key.
export async function callAdmin<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (MOCK) return (await import('./mock')).mockCall(fn, body) as Promise<T>;

  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data as T;

  // FunctionsHttpError carries the response; our functions reply { error }.
  const res = (error as { context?: Response }).context;
  if (res instanceof Response) {
    const payload = await res.json().catch(() => null);
    if (res.status === 404) throw new ApiError(404, `The ${fn} function isn't deployed yet.`);
    throw new ApiError(res.status, payload?.error ?? `${fn} failed (${res.status})`);
  }
  throw new ApiError(0, error.message);
}

export type PromptRow = {
  key: string;
  label: string;
  description: string;
  placeholders: { name: string; description: string }[];
  default_template: string;
  template: string;
  is_customised: boolean;
  updated_at: string | null;
  note: string | null;
};

export type PromptVersion = {
  id: number;
  template: string | null;
  note: string | null;
  created_at: string;
};

export type Zone = {
  key: string;
  label: string;
  start_hour: number;
  title: string;
  bodies: string[];
  updated_at?: string;
};

export type NotificationMessage = {
  key: string;
  label: string;
  description: string;
  title: string;
  body: string;
  default_title: string;
  default_body: string;
  is_default: boolean;
  updated_at: string | null;
};

export type DeepgramBalance = {
  project_id: string;
  project_name: string | null;
  balances: { id: string; amount: number; units: string }[];
  total_usd: number;
};

export type DeepgramUsage = {
  project_name: string | null;
  per_day: { day: string; minutes: number; requests: number; cost: number }[] | null;
  totals: { minutes: number; requests: number; cost: number };
  cost_error: string | null;
};
