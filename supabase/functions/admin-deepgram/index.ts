import "@supabase/functions-js/edge-runtime.d.ts"
import { adminHandler, HttpError } from '../_shared/admin.ts';

// Reads the Deepgram credit balance. Needs a key with billing read access,
// stored as the DEEPGRAM_BILLING_KEY secret (the transcription key is kept
// separate and never needs billing scope). DEEPGRAM_PROJECT_ID is optional —
// without it the first project the key can see is used.
Deno.serve(adminHandler(async () => {
  const key = Deno.env.get('DEEPGRAM_BILLING_KEY');
  if (!key) throw new HttpError(501, 'DEEPGRAM_BILLING_KEY is not set. Run: supabase secrets set DEEPGRAM_BILLING_KEY=…');

  const headers = { Authorization: `Token ${key}` };

  let projectId = Deno.env.get('DEEPGRAM_PROJECT_ID');
  let projectName: string | null = null;
  if (!projectId) {
    const res = await fetch('https://api.deepgram.com/v1/projects', { headers });
    if (!res.ok) throw new HttpError(502, `Deepgram projects lookup failed (${res.status})`);
    const { projects } = await res.json();
    if (!projects?.length) throw new HttpError(502, 'No Deepgram projects visible to this key');
    projectId = projects[0].project_id;
    projectName = projects[0].name ?? null;
  }

  const res = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/balances`, { headers });
  if (res.status === 403) throw new HttpError(502, 'Deepgram rejected the key — it needs billing read access');
  if (!res.ok) throw new HttpError(502, `Deepgram balance lookup failed (${res.status})`);
  const { balances } = await res.json();

  // One project can hold several credit balances (e.g. promo + purchased).
  const list = (balances ?? []).map((b: Record<string, unknown>) => ({
    id: b.balance_id,
    amount: Number(b.amount),
    units: b.units,
  }));
  const total = list.filter((b: { units: unknown }) => b.units === 'usd').reduce((s: number, b: { amount: number }) => s + b.amount, 0);

  return { project_id: projectId, project_name: projectName, balances: list, total_usd: total };
}));
