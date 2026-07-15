import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js';
import Anthropic from 'npm:@anthropic-ai/sdk';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
});

// Lightweight guardrail, not a clinical safety system — catches explicit
// self-harm/suicide language and routes to a fixed, resource-bearing reply
// instead of the model.
const CRISIS_PATTERNS = [
  /\bkill(ing)? myself\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend(ing)? my life\b/i,
  /\bwant(ed)? to die\b/i,
  /\bdon'?t want to (be alive|live|exist)\b/i,
  /\bhurt(ing)? myself\b/i,
  /\bself[- ]harm(ing)?\b/i,
  /\bno reason to live\b/i,
  /\bbetter off (dead|without me)\b/i,
];

const CRISIS_RESPONSE = `I'm really glad you told me this, and I want to take it seriously. I'm an AI companion, not a crisis counselor, and what you're describing deserves support from someone who can really be there for you right now.

If you're in the US, you can call or text 988 (Suicide & Crisis Lifeline) anytime — it's free and confidential. If you're outside the US, please look up your local crisis line, or reach out to a trusted person or emergency services if you're in immediate danger.

I'm here if you want to keep writing or talking, but please don't carry this alone.`;

function containsCrisisLanguage(text: string): boolean {
  return CRISIS_PATTERNS.some((p) => p.test(text));
}

const SYSTEM_PROMPT = `You are a warm, curious reflective companion inside Wabii, a personal journaling app. Someone is reflecting on a journal entry they wrote, and you're talking with them about it.

How you show up:
- Ask questions more than you give answers. Help them think, don't think for them.
- Validate feelings without being saccharine or generic ("that sounds hard" is fine once, not every message).
- Be genuinely curious about specifics — what happened, what they noticed, what they're avoiding.
- Gently draw connections to their past entries when relevant, but don't force it.
- Keep responses short — 2-4 sentences, conversational, not a lecture.
- You are not a licensed therapist. Don't diagnose. If something sounds like it needs professional support, say so plainly and kindly, without being alarmist about normal difficult feelings.`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const entryId = body?.entry_id;
    const message: string | undefined = body?.message?.trim() || undefined;
    if (!entryId) return json({ error: 'entry_id required' }, 400);

    const { data: entry, error: entryErr } = await supabase
      .from('journal_entries')
      .select('content, created_at')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single();
    if (entryErr || !entry) return json({ error: 'entry not found' }, 404);

    let { data: conversation } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('user_id', user.id)
      .eq('entry_id', entryId)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error: convErr } = await supabase
        .from('chat_conversations')
        .insert({ user_id: user.id, entry_id: entryId })
        .select('id')
        .single();
      if (convErr) throw convErr;
      conversation = newConv;
    }

    if (message && containsCrisisLanguage(message)) {
      await supabase.from('chat_messages').insert({ conversation_id: conversation.id, role: 'user', content: message });
      await supabase.from('chat_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: CRISIS_RESPONSE });
      await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
      return json({ conversation_id: conversation.id, reply: CRISIS_RESPONSE });
    }

    if (message) {
      await supabase.from('chat_messages').insert({ conversation_id: conversation.id, role: 'user', content: message });
    }

    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(20);

    // Grounding: pull a few related past entries via the existing embedding search.
    // Best-effort — if it fails, the conversation continues without extra context.
    let relatedContext = '';
    try {
      const model = new Supabase.ai.Session('gte-small');
      const embedding = await model.run(message || entry.content, { mean_pool: true, normalize: true });
      const { data: matches } = await supabase.rpc('match_journal_entries', {
        query_embedding: JSON.stringify(Array.from(embedding as number[])),
        match_user_id: user.id,
        match_count: 3,
      });
      const related = (matches ?? []).filter((m: any) => m.id !== entryId);
      if (related.length > 0) {
        relatedContext = `\n\nSome related past entries from their journal, for context (don't quote them verbatim, just let them inform your understanding):\n` +
          related.map((e: any) => `[${new Date(e.created_at).toLocaleDateString()}] ${e.content}`).join('\n\n');
      }
    } catch {
      // ignore — grounding is a nice-to-have, not required
    }

    const systemPrompt = `${SYSTEM_PROMPT}\n\nThe entry they're reflecting on right now (written ${new Date(entry.created_at).toLocaleDateString()}):\n${entry.content}${relatedContext}`;

    const isOpeningTurn = !message;
    const messages = isOpeningTurn
      ? [{ role: 'user' as const, content: 'Start the conversation. Reflect on the entry above and open with a short, warm, curious question or observation — no more than 2-3 sentences.' }]
      : (history ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      system: systemPrompt,
      messages,
    });

    const reply = completion.content[0].type === 'text' ? completion.content[0].text : '';

    await supabase.from('chat_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: reply });
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);

    return json({ conversation_id: conversation.id, reply });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
