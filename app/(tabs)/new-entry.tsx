import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { TagPicker, SelectedTag } from '@/components/tag-picker';

function getTodayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function NewEntryScreen() {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<SelectedTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const wordCount = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;

  async function handleSave() {
    setError('');
    if (!content.trim()) { setError('Write something before saving.'); return; }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: entry, error: entryErr } = await supabase
      .from('journal_entries')
      .insert({ user_id: user!.id, content: content.trim() })
      .select('id')
      .single();

    if (entryErr || !entry) { setError(entryErr?.message ?? 'Failed to save.'); setLoading(false); return; }

    if (tags.length > 0) {
      for (const tag of tags) {
        const { data: tagRow, error: tagErr } = await supabase
          .from('tags')
          .upsert({ user_id: user!.id, name: tag.name, category: tag.category }, { onConflict: 'user_id,name' })
          .select('id')
          .single();
        if (tagErr || !tagRow) continue;
        await supabase.from('entry_tags').insert({ entry_id: entry.id, tag_id: tagRow.id });
      }
    }

    supabase.functions.invoke('embed-entry', {
      body: { entry_id: entry.id, content: content.trim() },
    });

    setLoading(false);
    setContent('');
    setTags([]);
    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#faf9f7' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 24, paddingTop: 64, paddingBottom: 16,
        }}>
          <Pressable onPress={() => router.replace('/(tabs)')} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={22} color="#78716c" />
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={loading}
            style={{
              backgroundColor: content.trim() ? '#4f46e5' : '#e7e5e4',
              borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8,
            }}>
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: content.trim() ? '#ffffff' : '#a8a29e' }}>Save</Text>}
          </Pressable>
        </View>

        {/* Date */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 4 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e' }}>
            {getTodayLabel()}
          </Text>
        </View>

        {error ? (
          <View style={{ marginHorizontal: 24, marginTop: 8, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
          </View>
        ) : null}

        {/* Writing area */}
        <TextInput
          style={{
            paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
            fontSize: 18, fontFamily: 'Inter_400Regular',
            color: '#1c1917', lineHeight: 30,
            minHeight: 340, textAlignVertical: 'top',
          }}
          placeholder="What's on your mind today?"
          placeholderTextColor="#c4b9b0"
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
        />

        {/* Tags */}
        <TagPicker selected={tags} onChange={setTags} />

        {/* Word count */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#c4b9b0' }}>
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
