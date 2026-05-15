import { useState, useCallback } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Entry = {
  id: string;
  content: string;
  created_at: string;
};

type Section = {
  title: string;
  data: Entry[];
};

function getDayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function groupByDate(entries: Entry[]): Section[] {
  const groups: Record<string, Entry[]> = {};
  for (const entry of entries) {
    const label = getDayLabel(entry.created_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(entry);
  }
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

function preview(content: string) {
  return content.length > 120 ? content.slice(0, 120).trimEnd() + '…' : content;
}

export default function HomeScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchEntries() {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, content, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setSections(groupByDate(data));
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchEntries().finally(() => setLoading(false));
    }, [])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await fetchEntries();
    setRefreshing(false);
  }

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator color="#4f46e5" /></View>;
  }

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 pt-16 pb-4 border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-900">Journal</Text>
      </View>

      {sections.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-4">✍️</Text>
          <Text className="text-lg font-semibold text-gray-700 mb-2">Nothing here yet</Text>
          <Text className="text-gray-400 text-center">Tap New Entry to write your first journal entry.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4f46e5" />}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderSectionHeader={({ section }) => (
            <View className="px-6 py-2 bg-gray-50 border-b border-gray-100">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              className="px-6 py-4 border-b border-gray-50 active:bg-gray-50"
              onPress={() => router.push(`/entry/${item.id}`)}>
              <Text className="text-gray-800 text-base leading-relaxed">{preview(item.content)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
