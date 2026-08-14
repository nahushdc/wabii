import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Keyboard } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type Result = {
  id: string;
  content: string;
  created_at: string;
  similarity: number;
};

type HistoryItem = {
  id: string;
  query: string;
  created_at: string;
};

const SUGGESTIONS: { id: string; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { id: 'overwhelmed', icon: 'wind', label: 'How do I usually react when I feel overwhelmed?' },
  { id: 'guilt', icon: 'heart', label: 'Do I feel guilty often?' },
  { id: 'self', icon: 'user', label: 'What kind of person am I?' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function preview(content: string) {
  return content.length > 140 ? content.slice(0, 140).trimEnd() + '…' : content;
}

export default function SearchOverlayScreen() {
  const { query: initialQuery } = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [summaryShort, setSummaryShort] = useState('');
  const [summaryPoints, setSummaryPoints] = useState<string[]>([]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<TextInput>(null);
  const initialSearchRan = useRef(false);
  const lastLoggedRef = useRef<{ query: string; at: number } | null>(null);

  // Feedback on the current summary
  const [feedbackRowId, setFeedbackRowId] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<'up' | 'down' | null>(null);
  const [showDownComment, setShowDownComment] = useState(false);
  const [downComment, setDownComment] = useState('');
  const [downCommentSent, setDownCommentSent] = useState(false);

  useEffect(() => {
    fetchHistory();
    if (initialQuery && !initialSearchRan.current) {
      initialSearchRan.current = true;
      runSearch(initialQuery);
    }
  }, []);

  async function fetchHistory() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('search_history')
      .select('id, query, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8);
    setHistory(data ?? []);
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setError('');
    setLoading(true);
    setSearched(true);
    setSubmittedQuery(trimmed);
    setSummaryShort('');
    setSummaryPoints([]);
    setSummaryExpanded(false);
    resetFeedback();

    const { data: { user } } = await supabase.auth.getUser();

    // Guards against logging the same query twice in quick succession — e.g.
    // a double-fired effect or an accidental double-tap on a history row.
    const now = Date.now();
    const isDuplicate = lastLoggedRef.current?.query === trimmed && now - lastLoggedRef.current.at < 5000;
    if (!isDuplicate) lastLoggedRef.current = { query: trimmed, at: now };

    // Fired alongside the search call (not blocking on it), but awaited below
    // so a failure — or the app backgrounding right after a search — doesn't
    // silently drop it the way a fire-and-forget insert would.
    const historyInsert = isDuplicate
      ? Promise.resolve({ error: null })
      : supabase.from('search_history').insert({ user_id: user!.id, query: trimmed });

    const { data, error: err } = await supabase.functions.invoke('search-entries', {
      body: { query: trimmed, user_id: user!.id, match_count: 10 },
    });

    setLoading(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Search failed.'); return; }
    setResults(data.results ?? []);
    setSummaryShort(data.summary_short ?? '');
    setSummaryPoints(data.summary_points ?? []);

    const { error: historyErr } = await historyInsert;
    if (historyErr) {
      console.warn('Could not save search to history:', historyErr.message);
      return;
    }
    // Reflect the new search immediately in "Suggested" without waiting on a refetch.
    setHistory(prev => [
      { id: `local-${Date.now()}`, query: trimmed, created_at: new Date().toISOString() },
      ...prev.filter(h => h.query !== trimmed),
    ].slice(0, 8));
  }

  function resetFeedback() {
    setFeedbackRowId(null);
    setFeedbackRating(null);
    setShowDownComment(false);
    setDownComment('');
    setDownCommentSent(false);
  }

  async function handleThumbsUp() {
    if (feedbackRating) return;
    setFeedbackRating('up');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('ai_summary_feedback').insert({
      user_id: user.id, query: submittedQuery, summary: summaryShort, rating: 'up',
    });
  }

  async function handleThumbsDown() {
    if (feedbackRating) return;
    setFeedbackRating('down');
    setShowDownComment(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('ai_summary_feedback')
      .insert({ user_id: user.id, query: submittedQuery, summary: summaryShort, rating: 'down' })
      .select('id')
      .single();
    if (data) setFeedbackRowId(data.id);
  }

  async function handleSendComment() {
    if (!feedbackRowId || !downComment.trim()) { setShowDownComment(false); return; }
    await supabase.from('ai_summary_feedback').update({ comment: downComment.trim() }).eq('id', feedbackRowId);
    setDownCommentSent(true);
    setShowDownComment(false);
  }

  function handleSuggestionPress(suggestion: typeof SUGGESTIONS[number]) {
    setQuery(suggestion.label);
    runSearch(suggestion.label);
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  }

  return (
    <WarmBackground>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 64, paddingBottom: 12, gap: 12 }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
        }}>
          <Feather name="search" size={17} color="#c4b9b0" />
          <TextInput
            ref={inputRef}
            autoFocus
            style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917' }}
            placeholder="Search your memories…"
            placeholderTextColor="#c4b9b0"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch(query)}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <Feather name="x-circle" size={16} color="#c4b9b0" />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{
            width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
          <Feather name="x" size={18} color="#1c1917" />
        </Pressable>
      </View>

      {error ? (
        <View style={{ marginHorizontal: 24, marginBottom: 12, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
        </View>
      ) : null}

      {!searched ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Text style={{
            fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
            color: '#c4b9b0', paddingHorizontal: 4, marginBottom: 10,
          }}>
            Suggested
          </Text>
          {SUGGESTIONS.map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => handleSuggestionPress(s)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                paddingVertical: 14, paddingHorizontal: 4,
                borderBottomWidth: i < SUGGESTIONS.length - 1 ? 1 : 0,
                borderBottomColor: '#ede8e0',
              }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: '#FDE6DB',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Feather name={s.icon} size={16} color="#E85D2C" />
              </View>
              <Text style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, color: '#1c1917', lineHeight: 21 }}>
                {s.label}
              </Text>
              <Feather name="chevron-right" size={16} color="#d4cdc8" />
            </Pressable>
          ))}

          {history.length > 0 && (
            <>
              <Text style={{
                fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
                color: '#c4b9b0', paddingHorizontal: 4, marginBottom: 10, marginTop: 24,
              }}>
                Recent searches
              </Text>
              {history.map((h, i) => (
                <Pressable
                  key={h.id}
                  onPress={() => runSearch(h.query)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    paddingVertical: 14, paddingHorizontal: 4,
                    borderBottomWidth: i < history.length - 1 ? 1 : 0,
                    borderBottomColor: '#ede8e0',
                  }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0EBE3',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Feather name="clock" size={16} color="#8a7a6f" />
                  </View>
                  <Text style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, color: '#1c1917', lineHeight: 21 }} numberOfLines={1}>
                    {h.query}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E85D2C" />
        </View>
      ) : results.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🌾</Text>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 17, color: '#1c1917', marginBottom: 8, textAlign: 'center' }}>
            No entries about this yet
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', textAlign: 'center', lineHeight: 21, marginBottom: 20 }}>
            Want to start journaling about it?
          </Text>
          <Pressable
            onPress={() => router.push(`/(tabs)/new-entry?seed=${encodeURIComponent(submittedQuery)}`)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: '#E85D2C', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 22,
            }}>
            <Feather name="edit-3" size={16} color="#ffffff" />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#ffffff' }}>Start a journal entry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 8 }}>
              {summaryShort ? (
                <Animated.View entering={FadeInDown.duration(550).springify()} style={{ borderRadius: 24, overflow: 'hidden' }}>
                  <LinearGradient
                    colors={['#F0763D', '#E85D2C', '#B8390F']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 }}>
                    {/* Decorative flourish — pure ambiance */}
                    <Feather
                      name="zap"
                      size={110}
                      color="rgba(255,255,255,0.08)"
                      style={{ position: 'absolute', top: -18, right: -14, transform: [{ rotate: '15deg' }] }}
                    />

                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                      backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                      marginBottom: 14,
                    }}>
                      <Feather name="zap" size={11} color="#ffffff" />
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, textTransform: 'uppercase', color: '#ffffff' }}>
                        AI summary
                      </Text>
                    </View>

                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#ffffff', lineHeight: 30, marginBottom: 14 }}>
                      {summaryShort}
                    </Text>

                    {summaryPoints.length > 0 && (
                      <Pressable
                        onPress={() => setSummaryExpanded(v => !v)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
                          backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                          marginBottom: summaryExpanded ? 14 : 4,
                        }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12.5, color: '#ffffff' }}>
                          {summaryExpanded ? 'Show less' : 'Read more'}
                        </Text>
                        <Feather name={summaryExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#ffffff" />
                      </Pressable>
                    )}

                    {summaryExpanded && (
                      <Animated.View entering={FadeIn.duration(300)} style={{ gap: 10, marginBottom: 16 }}>
                        {summaryPoints.map((point, i) => (
                          <View
                            key={i}
                            style={{
                              flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)',
                              borderRadius: 14, padding: 12,
                            }}>
                            <Feather name="star" size={14} color="rgba(255,255,255,0.85)" style={{ marginTop: 2 }} />
                            <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14.5, color: '#ffffff', lineHeight: 21 }}>
                              {point}
                            </Text>
                          </View>
                        ))}
                      </Animated.View>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', marginBottom: 14 }}>
                      <Feather name="info" size={12} color="rgba(255,255,255,0.75)" style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 17 }}>
                        A mirror, not a verdict — you're still the one who knows the fuller story.
                      </Text>
                    </View>

                    {/* Feedback */}
                    {!feedbackRating ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12.5, color: 'rgba(255,255,255,0.85)', flex: 1 }}>
                          Was this helpful?
                        </Text>
                        <Pressable
                          onPress={handleThumbsUp} hitSlop={8}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="thumbs-up" size={15} color="#ffffff" />
                        </Pressable>
                        <Pressable
                          onPress={handleThumbsDown} hitSlop={8}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="thumbs-down" size={15} color="#ffffff" />
                        </Pressable>
                      </View>
                    ) : feedbackRating === 'up' ? (
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: '#ffffff' }}>
                        Thanks for the feedback!
                      </Text>
                    ) : showDownComment ? (
                      <View>
                        <TextInput
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
                            fontFamily: 'Inter_400Regular', fontSize: 13, color: '#1c1917', minHeight: 44, textAlignVertical: 'top',
                            marginBottom: 8,
                          }}
                          placeholder="What didn't land? (optional)"
                          placeholderTextColor="#a8a29e"
                          value={downComment}
                          onChangeText={setDownComment}
                          multiline
                        />
                        <Pressable
                          onPress={handleSendComment}
                          style={{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 10 }}>
                          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#B8390F' }}>Send</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: '#ffffff' }}>
                        {downCommentSent ? "Thanks — noted." : "Got it, thanks."}
                      </Text>
                    )}
                  </LinearGradient>
                </Animated.View>
              ) : null}

              <Text style={{
                fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
                color: '#c4b9b0', paddingHorizontal: 4, marginTop: 24,
              }}>
                Entries that match this
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/entry/${item.id}`)}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 18, padding: 18, marginBottom: 10,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
              }}>
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
