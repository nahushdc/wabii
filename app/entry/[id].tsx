import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ACTIVE_COLOR, INACTIVE_COLOR } from '@/lib/preset-tags';

type Entry = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type Tag = {
  id: string;
  name: string;
  category: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchEntry() {
      const [{ data: entryData }, { data: tagData }] = await Promise.all([
        supabase.from('journal_entries').select('*').eq('id', id).single(),
        supabase.from('entry_tags').select('tags(id, name, category)').eq('entry_id', id),
      ]);
      if (entryData) { setEntry(entryData); setContent(entryData.content); }
      if (tagData) setTags(tagData.map((r: any) => r.tags).filter(Boolean));
      setLoading(false);
    }
    fetchEntry();
  }, [id]);

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    const { error: err } = await supabase
      .from('journal_entries')
      .update({ content: content.trim() })
      .eq('id', id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setEntry(prev => prev ? { ...prev, content: content.trim() } : prev);
    setEditing(false);
  }

  function handleDelete() {
    Alert.alert('Delete entry', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('journal_entries').delete().eq('id', id);
          router.replace('/(tabs)');
        },
      },
    ]);
  }

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator color="#4f46e5" /></View>;
  }

  if (!entry) {
    return <View className="flex-1 items-center justify-center bg-white px-8"><Text className="text-gray-500">Entry not found.</Text></View>;
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-16 pb-4 border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <View className="flex-row gap-4">
          {editing ? (
            <>
              <Pressable onPress={() => { setEditing(false); setContent(entry.content); }} className="p-1">
                <Feather name="x" size={22} color="#9ca3af" />
              </Pressable>
              <Pressable onPress={handleSave} className="p-1" disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#4f46e5" /> : <Feather name="check" size={22} color="#4f46e5" />}
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => setEditing(true)} className="p-1">
                <Feather name="edit-2" size={20} color="#374151" />
              </Pressable>
              <Pressable onPress={handleDelete} className="p-1">
                <Feather name="trash-2" size={20} color="#ef4444" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="px-6 pt-5 pb-2">
          <Text className="text-xs font-medium" style={{ color: '#4f46e5' }}>{formatDate(entry.created_at)}</Text>
        </View>

        {error ? (
          <View className="mx-6 mb-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        {editing ? (
          <TextInput
            className="flex-1 px-6 py-4 text-base text-gray-900 leading-relaxed"
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus
            textAlignVertical="top"
            style={{ minHeight: 400 }}
          />
        ) : (
          <Text className="px-6 py-4 text-base text-gray-800 leading-relaxed">{entry.content}</Text>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <View className="px-6 pt-2 pb-6 flex-row flex-wrap gap-2">
            {tags.map(tag => (
              <View
                key={tag.id}
                className="px-3 py-1 rounded-full"
                style={{ backgroundColor: INACTIVE_COLOR.bg }}>
                <Text className="text-xs font-medium" style={{ color: INACTIVE_COLOR.text }}>{tag.name}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
