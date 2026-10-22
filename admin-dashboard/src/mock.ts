// Sample data for ?mock mode (local dev only). Lets the screens be built and
// checked without deployed functions or a signed-in admin.
import type { NotificationMessage, PromptRow, PromptVersion, Zone } from './api';

const prompts: PromptRow[] = [
  {
    key: 'weekly_digest',
    label: 'Weekly digest',
    description: 'Writes the weekly reflection from the week\'s entries.',
    placeholders: [{ name: 'entries', description: 'The journal entries, formatted "Entry N (date): text"' }],
    default_template: 'Write a warm weekly reflection based on these entries.\n\n{{entries}}',
    template: 'Write a warm, specific weekly reflection. Quote one line they wrote.\n\n{{entries}}',
    is_customised: true,
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    note: 'Ask it to quote the user',
  },
  {
    key: 'search_summary',
    label: 'Search summary',
    description: 'Summarises the entries matched by a journal search. The app expects the SHORT:/DETAILED: format.',
    placeholders: [
      { name: 'query', description: 'What the user searched for' },
      { name: 'entries', description: 'The matched entries' },
    ],
    default_template: 'Someone searched their own journal for: "{{query}}"\n\nSHORT: ...\nDETAILED: ...\n\n{{entries}}',
    template: 'Someone searched their own journal for: "{{query}}"\n\nSHORT: ...\nDETAILED: ...\n\n{{entries}}',
    is_customised: false,
    updated_at: null,
    note: null,
  },
  {
    key: 'chat_system',
    label: 'Entry chat — system prompt',
    description: 'The companion that talks with someone about an entry they already wrote.',
    placeholders: [],
    default_template: 'You are a warm, curious reflective companion inside Wabii.',
    template: 'You are a warm, curious reflective companion inside Wabii.',
    is_customised: false,
    updated_at: null,
    note: null,
  },
];

const history: Record<string, PromptVersion[]> = {
  weekly_digest: [
    { id: 2, template: prompts[0].template, note: 'Ask it to quote the user', created_at: prompts[0].updated_at! },
    { id: 1, template: 'Write a short weekly reflection.\n\n{{entries}}', note: null, created_at: new Date(Date.now() - 9 * 86400000).toISOString() },
  ],
};

const ORIGINAL_ZONES: Zone[] = [
  { key: 'morning', label: 'Morning', start_hour: 5, title: "Good Morning! 🌅", bodies: [
    "Time for your morning journaling session. How are you feeling today?",
    "A fresh page is waiting. What do you want to carry into today?",
    "Before the day gets loud, take a quiet minute for your thoughts.",
    "How are you waking up today? Let it out on the page.",
    "Set your intention, or just ramble. Either way, start here.",
  ] },
  { key: 'afternoon', label: 'Afternoon', start_hour: 12, title: "Afternoon Check-in 🌤️", bodies: [
    "How's your day going? Take a moment to reflect and journal.",
    "Pause for a breath. What has today been like so far?",
    "Halfway through the day. A few words can reset the rest of it.",
    "Something on your mind? Give it a home here.",
    "Take two minutes for yourself before the day carries on.",
  ] },
  { key: 'evening', label: 'Evening', start_hour: 17, title: "Evening Reflection 🌙", bodies: [
    "End your day with gratitude and reflection. What are you thankful for?",
    "How did today actually feel? Let it settle onto the page.",
    "Wind down by looking back. What is worth remembering?",
    "Put the day down gently. What do you want to let go of?",
    "One good thing, one hard thing. Write them both before bed.",
  ] },
];

const messages: NotificationMessage[] = [
  { key: 'weekly_digest_ready', label: 'Weekly reflection is ready', description: 'Sent when someone\'s weekly reflection has been written.', title: 'Your weekly reflection is ready 🌿', body: 'A look back at your week, and the pursuits you explored.', default_title: 'Your weekly reflection is ready 🌿', default_body: 'A look back at your week, and the pursuits you explored.', is_default: true, updated_at: null },
  { key: 'monthly_digest_ready', label: 'Monthly reflection is ready', description: 'Sent when someone\'s monthly reflection has been written.', title: 'Your monthly reflection is ready 🌙', body: 'A look back at your month, and the pursuits you explored.', default_title: 'Your monthly reflection is ready 🌙', default_body: 'A look back at your month, and the pursuits you explored.', is_default: true, updated_at: null },
];

// Starts as the text every account gets today.
let zones: Zone[] = ORIGINAL_ZONES.map((z) => ({ ...z, bodies: [...z.bodies] }));
let daysAhead = 14;

function days(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - (n - 1 - i) * 86400000);
    const minutes = Math.round((8 + 6 * Math.sin(i / 3) + i * 0.4) * 100) / 100;
    return { day: d.toISOString().slice(0, 10), sessions: Math.round(minutes / 1.6), minutes, cost: Math.round(minutes * 0.0077 * 10000) / 10000 };
  });
}

const wait = () => new Promise((r) => setTimeout(r, 250));

export async function mockCall(fn: string, body: Record<string, unknown>): Promise<unknown> {
  await wait();
  const key = String(body.key ?? '');
  switch (`${fn}:${body.action ?? ''}`) {
    case 'admin-prompts:list':
      return prompts;
    case 'admin-prompts:history':
      return history[key] ?? [];
    case 'admin-prompts:save': {
      const p = prompts.find((x) => x.key === key)!;
      const t = String(body.template);
      const missing = p.placeholders.filter((ph) => !t.includes(`{{${ph.name}}}`));
      if (missing.length && body.force !== true) {
        const { ApiError } = await import('./api');
        throw new ApiError(409, `Missing placeholders: ${missing.map((m) => `{{${m.name}}}`).join(', ')}`);
      }
      Object.assign(p, { template: t, is_customised: true, updated_at: new Date().toISOString(), note: body.note || null });
      (history[key] ??= []).unshift({ id: Date.now(), template: t, note: (body.note as string) || null, created_at: p.updated_at! });
      return { ok: true };
    }
    case 'admin-prompts:reset': {
      const p = prompts.find((x) => x.key === key)!;
      Object.assign(p, { template: p.default_template, is_customised: false, updated_at: null, note: null });
      (history[key] ??= []).unshift({ id: Date.now(), template: null, note: 'Reset to default', created_at: new Date().toISOString() });
      return { ok: true };
    }
    case 'admin-notifications:list':
      return {
        zones: [...zones].sort((a, b) => a.start_hour - b.start_hour),
        zones_are_default: JSON.stringify([...zones].sort((a, b) => a.start_hour - b.start_hour)) === JSON.stringify(ORIGINAL_ZONES),
        settings: { days_ahead: daysAhead },
        messages: messages.map((m) => ({ ...m, is_default: m.title === m.default_title && m.body === m.default_body })),
      };
    case 'admin-notifications:save_message': {
      const m = messages.find((x) => x.key === key)!;
      Object.assign(m, { title: String(body.title), body: String(body.body), updated_at: new Date().toISOString() });
      return { ok: true };
    }
    case 'admin-notifications:reset_message': {
      const m = messages.find((x) => x.key === key)!;
      Object.assign(m, { title: m.default_title, body: m.default_body, updated_at: new Date().toISOString() });
      return { ok: true };
    }
    case 'admin-notifications:restore_reminder_defaults':
      zones = ORIGINAL_ZONES.map((z) => ({ ...z, bodies: [...z.bodies] }));
      return { ok: true };
    case 'admin-notifications:save_zone': {
      const z = { key, label: String(body.label), start_hour: Number(body.start_hour), title: String(body.title), bodies: body.bodies as string[] };
      zones = [...zones.filter((x) => x.key !== key), z];
      return { ok: true };
    }
    case 'admin-notifications:delete_zone':
      zones = zones.filter((x) => x.key !== key);
      return { ok: true };
    case 'admin-notifications:save_setting':
      daysAhead = Number(body.value);
      return { ok: true };
    case 'admin-deepgram:':
      return { project_id: 'demo', project_name: 'Wabii', balances: [{ id: 'b1', amount: 182.4, units: 'usd' }], total_usd: 182.4 };
    case 'admin-stats:voice_usage': {
      const per_day = days(Number(body.days ?? 30));
      const totals = per_day.reduce((t, d) => ({ sessions: t.sessions + d.sessions, minutes: t.minutes + d.minutes, cost: t.cost + d.cost }), { sessions: 0, minutes: 0, cost: 0 });
      return { per_day, totals, unique_users: 23, rates: { en: 0.0077, multi: 0.0092 } };
    }
    case 'admin-stats:concurrency':
      return { active_now: 2, peak_overall: 7, rejected_total: 1, recent_rejections: [{ at: new Date(Date.now() - 5 * 3600000).toISOString(), reason: 'Deepgram 429: too many requests', user_id: null }], limit: 50 };
    default:
      throw new Error(`No sample data for ${fn} ${String(body.action ?? '')}`);
  }
}
