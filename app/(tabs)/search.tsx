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
  return content.length > 140 ? content.slice(0, 140).trimEnd() + '…' : content;
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
    <View style={{ flex: 1, backgroundColor: '#faf9f7' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Text style={{ fontFamily: 'PlayfairDisplay_700Bold', fontSize: 32, color: '#1c1917', marginBottom: 20 }}>
          Search
        </Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: '#ffffff', borderRadius: 16,
          paddingHorizontal: 16, paddingVertical: 4,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
          gap: 10,
        }}>
          <Feather name="search" size={18} color="#c4b9b0" />
          <TextInput
            style={{ flex: 1, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917' }}
            placeholder="Search your memories…"
            placeholderTextColor="#c4b9b0"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
              <Feather name="x" size={16} color="#c4b9b0" />
            </Pressable>
          )}
          <Pressable
            onPress={handleSearch}
            disabled={loading}
            style={{
              backgroundColor: query.trim() ? '#4f46e5' : '#e7e5e4',
              borderRadius: 10, padding: 8,
            }}>
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Feather name="arrow-right" size={16} color="white" />}
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={{ marginHorizontal: 24, marginBottom: 12, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
        </View>
      ) : null}

      {!searched ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
          <Text style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 20, color: '#1c1917', marginBottom: 8, textAlign: 'center' }}>
            Search by feeling
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', textAlign: 'center', lineHeight: 24 }}>
            Try "feeling overwhelmed at work" or "a moment I felt proud of myself".
          </Text>
        </View>
      ) : results.length === 0 && !loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🌾</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', textAlign: 'center' }}>
            Nothing found. Try searching with different words.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/entry/${item.id}`)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#f5f0eb' : '#ffffff',
                borderRadius: 18, padding: 18, marginBottom: 10,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#b07d4a' }}>
                  {formatDate(item.created_at)}
                </Text>
                <View style={{ backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#4f46e5' }}>
                    {Math.round(item.similarity * 100)}% match
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#292524', lineHeight: 24 }}>
                {preview(item.content)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
