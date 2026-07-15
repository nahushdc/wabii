import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type PromptRow = { key: string; text: string };

let rowKeyCounter = 0;
function newRow(text = ''): PromptRow {
  return { key: `row-${Date.now()}-${rowKeyCounter++}`, text };
}

export default function PromptThemeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [prompts, setPrompts] = useState<PromptRow[]>([newRow()]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    async function fetchTheme() {
      const [{ data: theme }, { data: promptRows }] = await Promise.all([
        supabase.from('prompt_themes').select('name').eq('id', id).single(),
        supabase.from('theme_prompts').select('prompt_text').eq('theme_id', id).order('sort_order', { ascending: true }),
      ]);
      if (theme) setName(theme.name);
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

  async function handleSave() {
    if (!name.trim()) { setError('Give your theme a name.'); return; }
    const validPrompts = prompts.map(p => p.text.trim()).filter(Boolean);
    if (validPrompts.length === 0) { setError('Add at least one prompt.'); return; }
    setError('');
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    let themeId = id;

    if (isNew) {
      const { data: created, error: createErr } = await supabase
        .from('prompt_themes')
        .insert({ user_id: user!.id, name: name.trim() })
        .select('id')
        .single();
      if (createErr || !created) { setError(createErr?.message ?? 'Failed to save.'); setSaving(false); return; }
      themeId = created.id;
    } else {
      await supabase.from('prompt_themes').update({ name: name.trim() }).eq('id', id);
      await supabase.from('theme_prompts').delete().eq('theme_id', id);
    }

    await supabase.from('theme_prompts').insert(
      validPrompts.map((text, i) => ({ theme_id: themeId, prompt_text: text, sort_order: i }))
    );

    setSaving(false);
    router.back();
  }

  function handleDelete() {
    Alert.alert('Delete theme', "This can't be undone. Any reminder using it will fall back to normal journaling.", [
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
            <Feather name="arrow-left" size={22} color="#374151" />
          </Pressable>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>
            {isNew ? 'New theme' : 'Edit theme'}
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
          Theme name
        </Text>
        <TextInput
          style={{
            backgroundColor: '#ffffff', borderRadius: 14,
            paddingHorizontal: 16, paddingVertical: 14,
            fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917',
            marginBottom: 24,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}
          placeholder="e.g. Night Journal"
          placeholderTextColor="#c4b9b0"
          value={name}
          onChangeText={setName}
        />

        {/* Prompts */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Prompts
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
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Save theme</Text>}
        </Pressable>
      </View>
    </ScrollView>
    </WarmBackground>
  );
}
