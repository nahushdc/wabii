import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';

type PromptRow = { key: string; text: string };

const DURATION_OPTIONS: { label: string; days: number | null }[] = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '2 months', days: 60 },
  { label: 'Ongoing', days: null },
];

const PURSUIT_IDEAS = [
  'My relationship with rest',
  'How I handle conflict',
  'My relationship with money',
  'What triggers my anxiety',
  'How I show up for people I love',
  'My relationship with work',
  'How I talk to myself',
  'What I actually want next',
];

let rowKeyCounter = 0;
function newRow(text = ''): PromptRow {
  return { key: `row-${Date.now()}-${rowKeyCounter++}`, text };
}

type AiSuggestion = { name: string; focus: string; motivation: string };

export default function PromptThemeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [focus, setFocus] = useState('');
  const [motivation, setMotivation] = useState('');
  const [durationDays, setDurationDays] = useState<number | null>(14);
  const [prompts, setPrompts] = useState<PromptRow[]>([newRow()]);
  const [showIdeas, setShowIdeas] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFetched, setAiFetched] = useState(false);
  const [aiNeedMore, setAiNeedMore] = useState<{ count: number; needed: number } | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    async function fetchTheme() {
      const [{ data: theme }, { data: promptRows }] = await Promise.all([
        supabase.from('prompt_themes').select('name, focus, motivation, duration_days').eq('id', id).single(),
        supabase.from('theme_prompts').select('prompt_text').eq('theme_id', id).order('sort_order', { ascending: true }),
      ]);
      if (theme) {
        setName(theme.name);
        setFocus(theme.focus ?? '');
        setMotivation(theme.motivation ?? '');
        setDurationDays(theme.duration_days ?? null);
      }
      if (promptRows && promptRows.length > 0) {
        setPrompts(promptRows.map(p => newRow(p.prompt_text)));
      }
      setLoading(false);
    }
    fetchTheme();
  }, [id]);

  function updatePrompt(key: string, text: string) {
    setPrompts(prev => prev.map(p => (p.key === key ? { ...p, text } : p)));
  }

  function removePrompt(key: string) {
    setPrompts(prev => prev.filter(p => p.key !== key));
  }

  function addPrompt() {
    setPrompts(prev => [...prev, newRow()]);
  }

  async function toggleIdeas() {
    const opening = !showIdeas;
    setShowIdeas(opening);
    if (opening && !aiFetched) {
      setAiFetched(true);
      setAiLoading(true);
      const { data, error: err } = await supabase.functions.invoke('suggest-pursuits', { body: {} });
      setAiLoading(false);
      if (err || data?.error) return;
      if (data?.insufficient) {
        setAiNeedMore({ count: data.count, needed: data.needed });
      } else {
        setAiSuggestions(data?.suggestions ?? []);
      }
    }
  }

  function applySuggestion(s: AiSuggestion) {
    setName(s.name);
    if (s.focus) setFocus(s.focus);
    if (s.motivation) setMotivation(s.motivation);
    setShowIdeas(false);
  }

  async function handleSave() {
    if (!name.trim()) { setError('Give your theme a name.'); return; }
    const validPrompts = prompts.map(p => p.text.trim()).filter(Boolean);
    if (validPrompts.length === 0) { setError('Add at least one prompt.'); return; }
    setError('');
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    let themeId = id;

    const themeFields = {
      name: name.trim(),
      focus: focus.trim() || null,
      motivation: motivation.trim() || null,
      duration_days: durationDays,
    };

    if (isNew) {
      const { data: created, error: createErr } = await supabase
        .from('prompt_themes')
        .insert({ user_id: user!.id, ...themeFields })
        .select('id')
        .single();
      if (createErr || !created) { setError(createErr?.message ?? 'Failed to save.'); setSaving(false); return; }
      themeId = created.id;
    } else {
      await supabase.from('prompt_themes').update(themeFields).eq('id', id);
      await supabase.from('theme_prompts').delete().eq('theme_id', id);
    }

    await supabase.from('theme_prompts').insert(
      validPrompts.map((text, i) => ({ theme_id: themeId, prompt_text: text, sort_order: i }))
    );

    setSaving(false);
    router.back();
  }

  function handleDelete() {
    Alert.alert('Delete pursuit', "This can't be undone. Any reminder using it will fall back to normal journaling.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('prompt_themes').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
            <Feather name="arrow-left" size={22} color="#374151" />
          </Pressable>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>
            {isNew ? 'New pursuit' : 'Edit pursuit'}
          </Text>
        </View>
        {!isNew && (
          <Pressable onPress={handleDelete} style={{ padding: 4 }}>
            <Feather name="trash-2" size={20} color="#ef4444" />
          </Pressable>
        )}
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {error ? (
          <View style={{ marginBottom: 16, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
          </View>
        ) : null}

        {/* Name */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Pursuit name
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: showIdeas ? 10 : 24 }}>
          <TextInput
            style={{
              flex: 1, backgroundColor: '#ffffff', borderRadius: 14,
              paddingHorizontal: 16, paddingVertical: 14,
              fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917',
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
            }}
            placeholder="e.g. My relationship with rest"
            placeholderTextColor="#c4b9b0"
            value={name}
            onChangeText={setName}
          />
          <Pressable
            onPress={toggleIdeas}
            style={{
              width: 48, backgroundColor: showIdeas ? COLORS.primary : '#ffffff', borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
            }}>
            <Feather name="compass" size={18} color={showIdeas ? '#ffffff' : COLORS.primary} />
          </Pressable>
        </View>

        {showIdeas && (
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 14, marginBottom: 24, paddingVertical: 6,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
              <Feather name="zap" size={11} color="#E85D2C" />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#E85D2C' }}>Based on your journal</Text>
            </View>

            {aiLoading ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#E85D2C" />
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e' }}>Looking for recurring threads…</Text>
              </View>
            ) : aiNeedMore ? (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e', paddingHorizontal: 16, paddingVertical: 12, lineHeight: 19 }}>
                Write a few more entries ({aiNeedMore.count} of {aiNeedMore.needed}) and I can suggest pursuits based on what you've actually been working through.
              </Text>
            ) : aiSuggestions.length > 0 ? (
              aiSuggestions.map((s, i) => (
                <Pressable
                  key={s.name}
                  onPress={() => applySuggestion(s)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f5f0eb',
                  }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1c1917', marginBottom: s.focus ? 2 : 0 }}>
                    {s.name}
                  </Text>
                  {s.focus ? (
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#a8a29e', lineHeight: 18 }}>
                      {s.focus}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            ) : (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e', paddingHorizontal: 16, paddingVertical: 12 }}>
                Nothing surfaced this time — try one of the ideas below instead.
              </Text>
            )}

            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a8a29e', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#f5f0eb' }}>
              Or try one of these:
            </Text>
            {PURSUIT_IDEAS.map((idea, i) => (
              <Pressable
                key={idea}
                onPress={() => { setName(idea); setShowIdeas(false); }}
                style={{
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f5f0eb',
                }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#1c1917' }}>{idea}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Focus */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          What are you curious about?
        </Text>
        <TextInput
          style={{
            backgroundColor: '#ffffff', borderRadius: 14,
            paddingHorizontal: 16, paddingVertical: 14,
            fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917',
            marginBottom: 24, minHeight: 56, textAlignVertical: 'top',
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}
          placeholder="What do you want to understand better about yourself here?"
          placeholderTextColor="#c4b9b0"
          value={focus}
          onChangeText={setFocus}
          multiline
        />

        {/* Why */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Why explore this?
        </Text>
        <TextInput
          style={{
            backgroundColor: '#ffffff', borderRadius: 14,
            paddingHorizontal: 16, paddingVertical: 14,
            fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917',
            marginBottom: 24, minHeight: 56, textAlignVertical: 'top',
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}
          placeholder="Why does this feel worth paying attention to right now?"
          placeholderTextColor="#c4b9b0"
          value={motivation}
          onChangeText={setMotivation}
          multiline
        />

        {/* Duration */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Nudge me for
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {DURATION_OPTIONS.map(opt => {
            const active = durationDays === opt.days;
            return (
              <Pressable
                key={opt.label}
                onPress={() => setDurationDays(opt.days)}
                style={{
                  backgroundColor: active ? COLORS.primary : '#ffffff',
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
                  shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: active ? '#ffffff' : '#78716c' }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Prompts */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Prompts (2–3 work best)
        </Text>
        {prompts.map((p, i) => (
          <View key={p.key} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: '#ffffff', borderRadius: 14, marginBottom: 10,
            paddingHorizontal: 16, paddingVertical: 4,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            <TextInput
              style={{ flex: 1, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#1c1917' }}
              placeholder={`Prompt ${i + 1}`}
              placeholderTextColor="#c4b9b0"
              value={p.text}
              onChangeText={text => updatePrompt(p.key, text)}
              multiline
            />
            <Pressable onPress={() => removePrompt(p.key)} hitSlop={8} style={{ padding: 4 }}>
              <Feather name="x" size={16} color="#a8a29e" />
            </Pressable>
          </View>
        ))}

        <Pressable
          onPress={addPrompt}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginBottom: 28 }}>
          <Feather name="plus" size={16} color="#E85D2C" />
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#E85D2C' }}>Add prompt</Text>
        </Pressable>

        {/* Save button */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 18,
            alignItems: 'center', justifyContent: 'center',
          }}>
          {saving
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>
                {isNew ? 'Add New Pursuit' : 'Save changes'}
              </Text>}
        </Pressable>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
