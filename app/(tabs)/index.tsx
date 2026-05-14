import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Entry = {
  id: string;
  content: string;
  created_at: string;
};

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function preview(content: string) {
  return content.length > 120 ? content.slice(0, 120).trimEnd() + '…' : content;
}

export default function HomeScreen() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchEntries() {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, content, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setEntries(data);
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
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#4f46e5" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-16 pb-4 border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-900">Journal</Text>
      </View>

      {entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-4">✍️</Text>
          <Text className="text-lg font-semibold text-gray-700 mb-2">Nothing here yet</Text>
          <Text className="text-gray-400 text-center">Tap New Entry to write your first journal entry.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4f46e5" />}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Pressable
              className="px-6 py-4 border-b border-gray-50 active:bg-gray-50"
              onPress={() => router.push(`/entry/${item.id}`)}>
              <Text className="text-xs text-indigo-400 font-medium mb-1">{formatDate(item.created_at)}</Text>
              <Text className="text-gray-800 text-base leading-relaxed">{preview(item.content)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
