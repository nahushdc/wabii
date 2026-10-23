import "@supabase/functions-js/edge-runtime.d.ts"
import { adminHandler, clampInt, HttpError } from '../_shared/admin.ts';

// Reads credit balance, usage and cost straight from Deepgram, so the numbers
// cover every recording (the app streams to Deepgram directly) and match the
// bill. Needs a key with billing read access, stored as the
// DEEPGRAM_BILLING_KEY secret (separate from the transcription key).
// DEEPGRAM_PROJECT_ID is optional; without it the first project the key can
// see is used.

const API = 'https://api.deepgram.com/v1';

function billingKey(): string {
  const key = Deno.env.get('DEEPGRAM_BILLING_KEY');
  if (!key) throw new HttpError(501, 'DEEPGRAM_BILLING_KEY is not set. Run: supabase secrets set DEEPGRAM_BILLING_KEY=…');
  return key;
}

async function dg<T>(path: string, what: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Token ${billingKey()}` } });
  if (res.status === 401 || res.status === 403) throw new HttpError(502, `Deepgram rejected the key for ${what}. It needs billing read access (Admin or Owner role).`);
  if (!res.ok) throw new HttpError(502, `Deepgram ${what} lookup failed (${res.status})`);
  return await res.json() as T;
}

async function project(): Promise<{ id: string; name: string | null }> {
  const id = Deno.env.get('DEEPGRAM_PROJECT_ID');
  if (id) return { id, name: null };
  const { projects } = await dg<{ projects?: { project_id: string; name?: string }[] }>('/projects', 'projects');
  if (!projects?.length) throw new HttpError(502, 'No Deepgram projects visible to this key');
  return { id: projects[0].project_id, name: projects[0].name ?? null };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

type UsageRow = { hours?: number; requests?: number; grouping?: { start?: string; end?: string } };
type BillingRow = { dollars?: number; grouping?: { start?: string; end?: string } };

Deno.serve(adminHandler(async ({ body }) => {
  const { id: projectId, name: projectName } = await project();

  if (body.action === 'usage') {
    // Deepgram reports in UTC days. `end` is sent as tomorrow so today counts
    // whether Deepgram treats it as inclusive or exclusive.
    const days = clampInt(body.days, 1, 365, 30);
    const today = new Date();
    const start = new Date(today.getTime() - (days - 1) * 86_400_000);
    const end = new Date(today.getTime() + 86_400_000);
    const range = `start=${isoDay(start)}&end=${isoDay(end)}`;

    const [usage, billing] = await Promise.allSettled([
      dg<{ results?: UsageRow[] }>(`/projects/${projectId}/usage/breakdown?${range}&endpoint=listen`, 'usage'),
      dg<{ results?: BillingRow[] }>(`/projects/${projectId}/billing/breakdown?${range}`, 'billing'),
    ]);
    if (usage.status === 'rejected') throw usage.reason;

    // One row per day in the window, zero-filled.
    const perDay = new Map<string, { day: string; minutes: number; requests: number; cost: number }>();
    for (let i = 0; i < days; i++) {
      const day = isoDay(new Date(start.getTime() + i * 86_400_000));
      perDay.set(day, { day, minutes: 0, requests: 0, cost: 0 });
    }

    // Results come back per day. Anything without a single-day bucket still
    // counts toward the totals, it just can't be charted.
    const totals = { minutes: 0, requests: 0, cost: 0 };
    let daily = true;
    for (const r of usage.value.results ?? []) {
      const minutes = (r.hours ?? 0) * 60;
      totals.minutes += minutes;
      totals.requests += r.requests ?? 0;
      const g = r.grouping;
      const row = g?.start && g.start === g.end ? perDay.get(g.start) : undefined;
      if (row) { row.minutes += minutes; row.requests += r.requests ?? 0; }
      else if (minutes > 0) daily = false;
    }

    let costError: string | null = null;
    if (billing.status === 'fulfilled') {
      for (const r of billing.value.results ?? []) {
        totals.cost += r.dollars ?? 0;
        const g = r.grouping;
        const row = g?.start && g.start === g.end ? perDay.get(g.start) : undefined;
        if (row) row.cost += r.dollars ?? 0;
      }
    } else {
      costError = (billing.reason as Error).message;
    }

    return {
      project_name: projectName,
      per_day: daily ? [...perDay.values()] : null,
      totals,
      cost_error: costError,
    };
  }

  // Default: credit balance. One project can hold several balances
  // (e.g. promo + purchased).
  const { balances } = await dg<{ balances?: Record<string, unknown>[] }>(`/projects/${projectId}/balances`, 'balance');
  const list = (balances ?? []).map((b) => ({ id: b.balance_id, amount: Number(b.amount), units: b.units }));
  const total = list.filter((b) => b.units === 'usd').reduce((s, b) => s + b.amount, 0);
  return { project_id: projectId, project_name: projectName, balances: list, total_usd: total };
}));
