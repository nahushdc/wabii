import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type Result = {
  id: string;
  content: string;
  created_at: string;
  similarity: number;
};

type ThemeOption = { id: string; name: string };

type FeedItem =
  | { type: 'search'; id: string; created_at: string; query: string }
  | { type: 'chat'; id: string; created_at: string; entryId: string; preview: string }
  | { type: 'insight'; id: string; created_at: string; themeName: string }
  | { type: 'digest'; id: string; created_at: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function preview(content: string) {
  return content.length > 140 ? content.slice(0, 140).trimEnd() + '…' : content;
}

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const [themes, setThemes] = useState<ThemeOption[]>([]);
  const [insightLoadingId, setInsightLoadingId] = useState<string | null>(null);

  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    supabase.from('prompt_themes').select('id, name').order('created_at', { ascending: false }).then(({ data }) => {
      setThemes(data ?? []);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (searched) return;

      Promise.all([
        supabase
          .from('search_history')
          .select('id, query, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('chat_conversations')
          .select('id, updated_at, entry_id, journal_entries(content)')
          .order('updated_at', { ascending: false })
          .limit(30),
        supabase
          .from('theme_insights')
          .select('id, created_at, prompt_themes(name)')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('weekly_digests')
          .select('id, week_start')
          .order('week_start', { ascending: false })
          .limit(30),
      ]).then(([searchRes, chatRes, insightRes, digestRes]) => {
        const searches: FeedItem[] = (searchRes.data ?? []).map(s => ({
          type: 'search', id: s.id, created_at: s.created_at, query: s.query,
        }));
        const chats: FeedItem[] = (chatRes.data ?? []).map((c: any) => ({
          type: 'chat', id: c.id, created_at: c.updated_at, entryId: c.entry_id,
          preview: c.journal_entries?.content ?? '',
        }));
        const insights: FeedItem[] = (insightRes.data ?? []).map((i: any) => ({
          type: 'insight', id: i.id, created_at: i.created_at,
          themeName: i.prompt_themes?.name ?? 'Theme',
        }));
        const digests: FeedItem[] = (digestRes.data ?? []).map(d => ({
          type: 'digest', id: d.id, created_at: d.week_start,
        }));

        setFeed(
          [...searches, ...chats, ...insights, ...digests].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        );
      });
    }, [searched])
  );

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setError('');
    setLoading(true);
    setSearched(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: err } = await supabase.functions.invoke('search-entries', {
      body: { query: q.trim(), user_id: user!.id, match_count: 10 },
    });

    setLoading(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Search failed.'); return; }
    setResults(data.results ?? []);

    supabase.from('search_history').insert({ user_id: user!.id, query: q.trim() });
  }

  function handleSearch() {
    runSearch(query);
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setSearched(false);
  }

  function rerunFromHistory(q: string) {
    setQuery(q);
    runSearch(q);
  }

  async function handleSeeInsights(theme: ThemeOption) {
    setInsightLoadingId(theme.id);
    const { data, error: err } = await supabase.functions.invoke('theme-insights', {
      body: { theme_id: theme.id },
    });
    setInsightLoadingId(null);
    if (err || data?.error) return;

    if (data?.insufficient) {
      router.push(
        `/theme-insight/pending?themeId=${theme.id}&themeName=${encodeURIComponent(data.theme_name)}&count=${data.count}&needed=${data.needed}`
      );
      return;
    }
    if (data?.id) router.push(`/theme-insight/${data.id}`);
  }

  return (
    <WarmBackground>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 12 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 28, color: '#1c1917', marginBottom: 8 }}>
          Search by feeling
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', lineHeight: 21, marginBottom: 20 }}>
          Try "feeling overwhelmed at work" or "a moment I felt proud of myself".
        </Text>

        <View style={{
          backgroundColor: '#ffffff', borderRadius: 16,
          paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Feather name="search" size={18} color="#c4b9b0" style={{ marginTop: 3 }} />
            <TextInput
              style={{
                flex: 1, minHeight: 64, fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917',
                textAlignVertical: 'top',
              }}
              placeholder="Search your memories…"
              placeholderTextColor="#c4b9b0"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              multiline
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 8 }}>
            {query.length > 0 && (
              <Pressable onPress={clearSearch}>
                <Feather name="x" size={16} color="#c4b9b0" />
              </Pressable>
            )}
            <Pressable
              onPress={handleSearch}
              disabled={loading}
              style={{
                backgroundColor: query.trim() ? '#E85D2C' : '#e7e5e4',
                borderRadius: 10, padding: 8,
              }}>
              {loading
                ? <ActivityIndicator color="white" size="small" />
                : <Feather name="arrow-right" size={16} color="white" />}
            </Pressable>
          </View>
        </View>

        {themes.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {themes.map(theme => (
              <Pressable
                key={theme.id}
                onPress={() => handleSeeInsights(theme)}
                disabled={insightLoadingId === theme.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: '#FDE6DB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                }}>
                {insightLoadingId === theme.id
                  ? <ActivityIndicator size="small" color="#E85D2C" />
                  : <Feather name="bar-chart-2" size={12} color="#E85D2C" />}
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#E85D2C' }}>
                  See {theme.name}'s insights
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Divider — everything below is the searches section */}
      <View style={{ height: 1, backgroundColor: '#ede8e0', marginHorizontal: 24, marginBottom: 16 }} />

      {error ? (
        <View style={{ marginHorizontal: 24, marginBottom: 12, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
        </View>
      ) : null}

      {/* Lower section: activity feed by default, results once a search runs */}
      {!searched ? (
        feed.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>🕓</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', textAlign: 'center' }}>
              Your searches, chats, and insights will show up here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={{
              fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
              color: '#c4b9b0', paddingHorizontal: 24, marginBottom: 8,
            }}>
              Recent activity
            </Text>
            <FlatList
              data={feed}
              keyExtractor={item => `${item.type}-${item.id}`}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
              renderItem={({ item }) => {
                const { icon, label } =
                  item.type === 'search'
                    ? { icon: 'clock' as const, label: item.query }
                    : item.type === 'chat'
                    ? { icon: 'message-circle' as const, label: preview(item.preview) || 'Chat about an entry' }
                    : item.type === 'insight'
                    ? { icon: 'bar-chart-2' as const, label: `${item.themeName} insights` }
                    : { icon: 'feather' as const, label: 'Weekly reflection' };

                function handlePress() {
                  if (item.type === 'search') rerunFromHistory(item.query);
                  else if (item.type === 'chat') router.push(`/chat/${item.entryId}`);
                  else if (item.type === 'insight') router.push(`/theme-insight/${item.id}`);
                  else router.push(`/digest/${item.id}`);
                }

                return (
                  <Pressable
                    onPress={handlePress}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      backgroundColor: pressed ? '#f5f0eb' : '#ffffff',
                      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
                      shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                    })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Feather name={icon} size={14} color="#c4b9b0" />
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#292524', flex: 1 }} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#c4b9b0' }}>
                      {formatRelative(item.created_at)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </>
        )
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
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/entry/${item.id}`)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#f5f0eb' : '#ffffff',
                borderRadius: 18, padding: 18, marginBottom: 10,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#b07d4a' }}>
                  {formatDate(item.created_at)}
                </Text>
                <View style={{ backgroundColor: '#FDE6DB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#E85D2C' }}>
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
    </WarmBackground>
  );
}
