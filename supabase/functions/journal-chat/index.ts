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

const SYSTEM_PROMPT = `You are a warm, curious journaling companion inside Wabii. Someone is composing today's journal entry by talking it through with you instead of writing it alone.

How you show up:
- Ask one thoughtful question at a time to help them unpack what's on their mind — don't interrogate.
- Validate feelings without being saccharine or generic.
- Be genuinely curious about specifics — what happened, what they noticed, what they're avoiding.
- Keep responses short — 2-3 sentences, conversational, not a lecture.
- You are not a licensed therapist. Don't diagnose. If something sounds like it needs professional support, say so plainly and kindly.
- This conversation IS the journal entry — you're helping them think out loud, not reflecting on something already written.`;

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
    const conversationId: string | undefined = body?.conversation_id;
    const message: string | undefined = body?.message?.trim() || undefined;
    const linkEntryId: string | undefined = body?.link_entry_id;

    // Linking mode: attach a finished conversation to the journal entry it produced.
    if (conversationId && linkEntryId) {
      const { error: linkErr } = await supabase
        .from('chat_conversations')
        .update({ entry_id: linkEntryId })
        .eq('id', conversationId)
        .eq('user_id', user.id);
      if (linkErr) throw linkErr;
      return json({ ok: true });
    }

    let conversation: { id: string } | null = null;
    if (conversationId) {
      const { data } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();
      conversation = data;
    }
    if (!conversation) {
      const { data: newConv, error: convErr } = await supabase
        .from('chat_conversations')
        .insert({ user_id: user.id, entry_id: null })
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

    const isOpeningTurn = !message;
    const turns = isOpeningTurn
      ? [{ role: 'user' as const, content: 'Open the conversation with a short, warm, curious question about how their day or headspace is right now — no more than 2 sentences.' }]
      : (history ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: turns,
    });

    const reply = completion.content[0].type === 'text' ? completion.content[0].text : '';

    await supabase.from('chat_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: reply });
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);

    return json({ conversation_id: conversation.id, reply });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
