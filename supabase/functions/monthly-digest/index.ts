import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';
import AnthropicClient from 'npm:@anthropic-ai/sdk';
import { Anthropic } from 'npm:@posthog/ai/anthropic';
import { PostHog } from 'npm:posthog-node';
import { getPrompt } from '../_shared/prompts.ts';
import { getNotificationMessage } from '../_shared/notification-messages.ts';

const posthogProjectToken = Deno.env.get('POSTHOG_PROJECT_TOKEN');
const posthogHost = Deno.env.get('POSTHOG_HOST');
const posthog = posthogProjectToken && posthogHost
  ? new PostHog(posthogProjectToken, {
      host: posthogHost,
      privacyMode: true,
      flushAt: 1,
      flushInterval: 0,
      enableExceptionAutocapture: true,
    })
  : undefined;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const anthropic = posthog
  ? new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')!, posthog })
  : new AnthropicClient({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const NOTIFICATIONS_ENABLED = true;

type PatternEntry = { pattern: string; count: number };
type DigestInsights = {
  moods: string[];
  new_patterns: string[];
  repeating_patterns: PatternEntry[];
  attention_patterns: PatternEntry[];
};

function sanitizePatternEntries(value: unknown): PatternEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is { pattern: unknown; count: unknown } => p && typeof p === 'object')
    .map(p => ({
      pattern: String((p as any).pattern ?? '').trim(),
      count: Math.max(2, Math.round(Number((p as any).count) || 2)),
    }))
    .filter(p => p.pattern.length > 0)
    .slice(0, 8);
}

function parseInsightsJson(raw: string): DigestInsights | null {
  const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      moods: Array.isArray(parsed.moods) ? parsed.moods.slice(0, 8) : [],
      new_patterns: Array.isArray(parsed.new_patterns) ? parsed.new_patterns.slice(0, 8) : [],
      repeating_patterns: sanitizePatternEntries(parsed.repeating_patterns),
      attention_patterns: sanitizePatternEntries(parsed.attention_patterns),
    };
  } catch {
    return null;
  }
}

async function generateInsights(
  entriesText: string,
  previousInsights: DigestInsights | null,
  periodLabel: string,
  userId: string,
  traceId: string,
): Promise<DigestInsights | null> {
  const knownPatterns: PatternEntry[] = previousInsights
    ? [
        ...previousInsights.new_patterns.map(pattern => ({ pattern, count: 1 })),
        ...previousInsights.repeating_patterns,
        ...previousInsights.attention_patterns.filter(a => !previousInsights.repeating_patterns.some(r => r.pattern === a.pattern)),
      ]
    : [];

  const previousPatternsSection = knownPatterns.length
    ? `\n\nPatterns identified in PREVIOUS periods, with how many consecutive periods (including that one) each has been observed so far — use this to decide "new" vs "repeating" below, and to set each repeating/attention pattern's count to (its previous count + 1) if it genuinely still shows up this period:\n${knownPatterns.map(p => `- "${p.pattern}" (seen ${p.count}x so far)`).join('\n')}`
    : '\n\nThere is no previous period to compare against — treat every genuine pattern you find as new, with no counts to carry forward.';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 900,
    messages: [
      {
        role: 'user',
        content: await getPrompt(supabase, 'digest_insights', { period_label: periodLabel, previous_patterns_section: previousPatternsSection, entries: entriesText }),
      },
    ],
    ...(posthog ? {
      posthogDistinctId: userId,
      posthogTraceId: traceId,
      posthogProperties: { $ai_session_id: `monthly-digest-${userId}` },
    } : {}),
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  return parseInsightsJson(raw);
}

function isLastDayOfUtcMonth(now: Date): boolean {
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(now.getUTCDate() + 1);
  return tomorrow.getUTCDate() === 1;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.user_id ?? null;
    const force = body?.force === true; // lets us manually trigger a test run regardless of date
    const requestedMonthStart = typeof body?.month_start === 'string' ? body.month_start : null;

    const now = new Date();
    if (!force && !isLastDayOfUtcMonth(now)) {
      return new Response(JSON.stringify({ success: true, skipped: 'not the last day of the month' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsedRequestedMonth = requestedMonthStart ? new Date(`${requestedMonthStart}T00:00:00.000Z`) : null;
    if (requestedMonthStart && (!parsedRequestedMonth || Number.isNaN(parsedRequestedMonth.getTime()))) {
      throw new Error('month_start must be a valid YYYY-MM-DD date');
    }

    // A specific month is only accepted for an explicitly forced/manual run.
    // Scheduled runs always use the current month.
    const monthStart = force && parsedRequestedMonth
      ? new Date(Date.UTC(parsedRequestedMonth.getUTCFullYear(), parsedRequestedMonth.getUTCMonth(), 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const monthStartStr = monthStart.toISOString().split('T')[0];

    let usersQuery = supabase.from('users').select('id, email, monthly_reflections_enabled, push_token');
    if (targetUserId) usersQuery = usersQuery.eq('id', targetUserId);
    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    const results = [];
    // Editable from the control panel; falls back to the built-in text.
    const readyMessage = await getNotificationMessage(supabase, 'monthly_digest_ready');

    for (const user of users ?? []) {
      const aiTraceId = crypto.randomUUID();
      if (user.monthly_reflections_enabled === false) {
        results.push({ user_id: user.id, status: 'skipped — monthly reflections disabled' });
        continue;
      }

      const { data: existing } = await supabase
        .from('monthly_digests')
        .select('id')
        .eq('user_id', user.id)
        .eq('month_start', monthStartStr)
        .maybeSingle();
      if (existing) {
        results.push({ user_id: user.id, status: 'skipped — already generated this month' });
        continue;
      }

      const { data: monthEntries, error: monthError } = await supabase
        .from('journal_entries')
        .select('content, created_at')
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', nextMonthStart.toISOString())
        .order('created_at', { ascending: true });

      if (monthError || !monthEntries || monthEntries.length === 0) {
        results.push({ user_id: user.id, status: 'skipped — no entries' });
        continue;
      }

      const entriesText = monthEntries.map((e, i) => {
        const date = new Date(e.created_at).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        });
        return `Entry ${i + 1} (${date}):\n${e.content}`;
      }).join('\n\n---\n\n');

      const { data: pursuits } = await supabase
        .from('prompt_themes')
        .select('id, name, focus')
        .eq('user_id', user.id)
        .eq('status', 'active');

      let pursuitsPromptSection = '';
      if (pursuits && pursuits.length > 0) {
        const { data: monthEntriesWithTheme } = await supabase
          .from('journal_entries')
          .select('content, created_at, prompt_theme_id')
          .eq('user_id', user.id)
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', nextMonthStart.toISOString())
          .not('prompt_theme_id', 'is', null);

        const byTheme: Record<string, typeof monthEntriesWithTheme> = {};
        for (const e of monthEntriesWithTheme ?? []) {
          const key = e.prompt_theme_id as string;
          (byTheme[key] ??= []).push(e);
        }
        const pursuitBlocks = pursuits.map(p => {
          const entries = byTheme[p.id] ?? [];
          if (entries.length === 0) {
            return `Pursuit: "${p.name}"${p.focus ? ` (focus: ${p.focus})` : ''}\nNo entries logged against this pursuit this month.`;
          }
          const text = entries.map((e: any, i: number) =>
            `Entry ${i + 1} (${new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}):\n${e.content}`
          ).join('\n\n');
          return `Pursuit: "${p.name}"${p.focus ? ` (focus: ${p.focus})` : ''}\n${text}`;
        }).join('\n\n---\n\n');

        pursuitsPromptSection = `\n\nThe person is also tracking these ongoing "pursuits" — standing personal questions they're deliberately exploring. Below, for each pursuit, is what (if anything) they logged against it this month specifically. In the "Your pursuits this month" section, write one short line naming a genuine theme (what it seems to be about) or pattern (when/how it recurs) you can detect — grounded strictly in that pursuit's entries below, not the rest of the month. If a pursuit has no entries this month, or too little to say anything real, say so plainly (e.g. "Nothing logged this month — no pattern to report.") rather than inventing one.

${pursuitBlocks}`;
      }

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1600,
        messages: [
          {
            role: 'user',
            content: await getPrompt(supabase, 'monthly_digest', { pursuits_section: pursuitsPromptSection, entries: entriesText }),
          },
        ],
        ...(posthog ? {
          posthogDistinctId: user.id,
          posthogTraceId: aiTraceId,
          posthogProperties: { $ai_session_id: `monthly-digest-${user.id}` },
        } : {}),
      });

      const digestContent = message.content[0].type === 'text' ? message.content[0].text : '';

      const { data: previousDigest } = await supabase
        .from('monthly_digests')
        .select('insights')
        .eq('user_id', user.id)
        .lt('month_start', monthStartStr)
        .order('month_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      const insights = await generateInsights(entriesText, previousDigest?.insights ?? null, 'month', user.id, aiTraceId).catch(() => null);

      const { data: inserted, error: insertError } = await supabase
        .from('monthly_digests')
        .insert({
          user_id: user.id,
          content: digestContent,
          month_start: monthStartStr,
          insights,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      if (NOTIFICATIONS_ENABLED && user.push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{
            to: user.push_token,
            title: readyMessage.title,
            body: readyMessage.body,
            sound: 'default',
            data: { monthly_digest_id: inserted.id },
          }]),
        });
      }

      results.push({ user_id: user.id, status: 'monthly digest created', entries: monthEntries.length });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  } finally {
    await posthog?.flush();
  }
});
