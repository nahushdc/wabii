import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Alert, Keyboard } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { TagPicker, SelectedTag } from '@/components/tag-picker';
import { WarmBackground } from '@/components/warm-background';

function KeyboardDismissButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!visible) return null;
  return (
    <View style={{ alignItems: 'flex-end', paddingHorizontal: 24, paddingBottom: 10 }}>
      <Pressable
        onPress={() => Keyboard.dismiss()}
        hitSlop={10}
        style={{
          width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
        }}>
        <Feather name="chevron-down" size={20} color="#78716c" />
      </Pressable>
    </View>
  );
}

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
  const [editTags, setEditTags] = useState<SelectedTag[]>([]);
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
      if (tagData) {
        const loaded = tagData.map((r: any) => r.tags).filter(Boolean);
        setTags(loaded);
        setEditTags(loaded.map((t: Tag) => ({ name: t.name, category: t.category })));
      }
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
    if (err) { setError(err.message); setSaving(false); return; }

    // Sync tags: delete all existing, re-insert selected
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('entry_tags').delete().eq('entry_id', id);
    for (const tag of editTags) {
      const { data: tagRow } = await supabase
        .from('tags')
        .upsert({ user_id: user!.id, name: tag.name, category: tag.category }, { onConflict: 'user_id,name' })
        .select('id')
        .single();
      if (tagRow) await supabase.from('entry_tags').insert({ entry_id: id, tag_id: tagRow.id });
    }

    setEntry(prev => prev ? { ...prev, content: content.trim() } : prev);
    setTags(editTags.map(t => ({ id: t.name, name: t.name, category: t.category })));
    setSaving(false);
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
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  if (!entry) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'Inter_400Regular', color: '#a8a29e' }}>Entry not found.</Text>
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingTop: 64, paddingBottom: 16,
      }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color="#78716c" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {editing ? (
            <>
              <Pressable onPress={() => { setEditing(false); setContent(entry.content); setEditTags(tags.map(t => ({ name: t.name, category: t.category }))); }} style={{ padding: 4 }}>
                <Feather name="x" size={22} color="#a8a29e" />
              </Pressable>
              <Pressable onPress={handleSave} style={{ padding: 4 }} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#E85D2C" />
                  : <Feather name="check" size={22} color="#E85D2C" />}
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => router.push(`/chat/${id}`)} style={{ padding: 4 }}>
                <Feather name="message-circle" size={20} color="#78716c" />
              </Pressable>
              <Pressable onPress={() => setEditing(true)} style={{ padding: 4 }}>
                <Feather name="edit-2" size={20} color="#78716c" />
              </Pressable>
              <Pressable onPress={handleDelete} style={{ padding: 4 }}>
                <Feather name="trash-2" size={20} color="#ef4444" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {editing ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#b07d4a' }}>
              {formatDate(entry.created_at)}
            </Text>
          </View>

          {error ? (
            <View style={{ marginHorizontal: 24, marginBottom: 12, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
            </View>
          ) : null}

          {/* A bounded, flex:1 multiline input handles its own internal
              scrolling natively — an unbounded auto-growing one inside a
              ScrollView can't be dragged to scroll once it fills the screen. */}
          <TextInput
            style={{
              flex: 1,
              paddingHorizontal: 24, paddingVertical: 8,
              fontSize: 18, fontFamily: 'Inter_400Regular',
              color: '#1c1917', lineHeight: 30,
              textAlignVertical: 'top',
            }}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus
          />
          <TagPicker selected={editTags} onChange={setEditTags} />
          <KeyboardDismissButton />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          {/* Date */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#b07d4a' }}>
              {formatDate(entry.created_at)}
            </Text>
          </View>

          {error ? (
            <View style={{ marginHorizontal: 24, marginBottom: 12, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
            </View>
          ) : null}

          <Text style={{
            paddingHorizontal: 24, paddingBottom: 24,
            fontSize: 18, fontFamily: 'Inter_400Regular',
            color: '#292524', lineHeight: 30,
          }}>
            {entry.content}
          </Text>

          {/* Tags */}
          {tags.length > 0 && (
            <View style={{ paddingHorizontal: 24, paddingBottom: 40, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {tags.map(tag => (
                <View
                  key={tag.id}
                  style={{ backgroundColor: '#f0ebe3', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#78716c' }}>{tag.name}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
