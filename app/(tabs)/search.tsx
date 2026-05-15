import { useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

type Result = {
  id: string;
  content: string;
  created_at: string;
  similarity: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function preview(content: string) {
  return content.length > 120 ? content.slice(0, 120).trimEnd() + '…' : content;
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    if (!query.trim()) return;
    setError('');
    setLoading(true);
    setSearched(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: err } = await supabase.functions.invoke('search-entries', {
      body: { query: query.trim(), user_id: user!.id, match_count: 10 },
    });

    setLoading(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Search failed.'); return; }
    setResults(data.results ?? []);
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-16 pb-4">
        <Text className="text-2xl font-bold text-gray-900 mb-4">Search</Text>
        <View className="flex-row items-center gap-3">
          <View className="flex-1 flex-row items-center border border-gray-200 rounded-xl px-4 gap-2">
            <Feather name="search" size={18} color="#9ca3af" />
            <TextInput
              className="flex-1 py-3 text-base text-gray-900"
              placeholder="What's on your mind?"
              placeholderTextColor="#9ca3af"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
                <Feather name="x" size={16} color="#9ca3af" />
              </Pressable>
            )}
          </View>
          <Pressable
            className="bg-indigo-600 rounded-xl px-4 py-3"
            onPress={handleSearch}
            disabled={loading}>
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Feather name="search" size={18} color="white" />}
          </Pressable>
        </View>
      </View>

      {error ? (
        <View className="mx-6 mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <Text className="text-red-600 text-sm">{error}</Text>
        </View>
      ) : null}

      {!searched ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-4">🔍</Text>
          <Text className="text-lg font-semibold text-gray-700 mb-2">Semantic search</Text>
          <Text className="text-gray-400 text-center">Search by meaning, not just words. Try "feeling overwhelmed at work" or "moments of joy".</Text>
        </View>
      ) : results.length === 0 && !loading ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-gray-400 text-center">No entries found. Try a different search.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Pressable
              className="px-6 py-4 border-b border-gray-50 active:bg-gray-50"
              onPress={() => router.push(`/entry/${item.id}`)}>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-medium" style={{ color: '#4f46e5' }}>{formatDate(item.created_at)}</Text>
                <Text className="text-xs text-gray-400">{Math.round(item.similarity * 100)}% match</Text>
              </View>
              <Text className="text-gray-800 text-base leading-relaxed">{preview(item.content)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
