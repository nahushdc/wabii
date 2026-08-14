import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type ThemeOption = { id: string; name: string };

type MonthlyDigest = { id: string; content: string; month_start: string; seen_at: string | null };
type WeeklyDigestSummary = { id: string; week_start: string; seen_at: string | null };

type FeedItem =
  | { type: 'search'; id: string; created_at: string; query: string }
  | { type: 'chat'; id: string; created_at: string; entryId: string; preview: string }
  | { type: 'insight'; id: string; created_at: string; themeName: string };

const FEED_STYLES = {
  search: { icon: 'clock' as const, chipBg: '#F0EBE3', color: '#8a7a6f', tag: 'Search' },
  chat: { icon: 'message-circle' as const, chipBg: '#FDE6DB', color: '#E85D2C', tag: 'Chat' },
  insight: { icon: 'bar-chart-2' as const, chipBg: '#EFE6FB', color: '#6D4CAD', tag: 'Insight' },
};

type FeedFilter = 'all' | FeedItem['type'];

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'search', label: 'Search' },
  { key: 'chat', label: 'Chat' },
  { key: 'insight', label: 'Insight' },
];

// Alternating pastel + slight rotation for each mini weekly card, so the row
// reads like a little scattered stack of notes rather than a rigid list.
const WEEKLY_CARD_STYLES = [
  { bg: '#E6F3E0', accent: '#3F7A3F', rotate: '-3deg' },
  { bg: '#FDE6DB', accent: '#C2410C', rotate: '2deg' },
  { bg: '#EFE6FB', accent: '#6D4CAD', rotate: '-2deg' },
  { bg: '#FCEFCF', accent: '#A87B1B', rotate: '3deg' },
];

function preview(content: string) {
  return content.length > 140 ? content.slice(0, 140).trimEnd() + '…' : content;
}

function formatWeek(dateStr: string) {
  const date = new Date(dateStr);
  const end = new Date(date);
  end.setDate(date.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(date)} – ${fmt(end)}`;
}

function formatMonth(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
  const [themes, setThemes] = useState<ThemeOption[]>([]);
  const [insightLoadingId, setInsightLoadingId] = useState<string | null>(null);
  const [latestMonthly, setLatestMonthly] = useState<MonthlyDigest | null>(null);
  const [weeklyDigests, setWeeklyDigests] = useState<WeeklyDigestSummary[]>([]);

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [filter, setFilter] = useState<FeedFilter>('all');

  useEffect(() => {
    supabase.from('prompt_themes').select('id, name').eq('status', 'active').order('created_at', { ascending: false }).then(({ data }) => {
      setThemes(data ?? []);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('monthly_digests')
        .select('id, content, month_start, seen_at')
        .order('month_start', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setLatestMonthly(data ?? null));

      supabase
        .from('weekly_digests')
        .select('id, week_start, seen_at')
        .order('week_start', { ascending: false })
        .limit(10)
        .then(({ data }) => setWeeklyDigests(data ?? []));

      Promise.all([
        supabase
          .from('search_history')
          .select('id, query, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('chat_conversations')
          .select('id, updated_at, entry_id, journal_entries(content), chat_messages(id)')
          .not('entry_id', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(30),
        supabase
          .from('theme_insights')
          .select('id, created_at, prompt_themes(name)')
          .order('created_at', { ascending: false })
          .limit(30),
      ]).then(([searchRes, chatRes, insightRes]) => {
        const searches: FeedItem[] = (searchRes.data ?? []).map(s => ({
          type: 'search', id: s.id, created_at: s.created_at, query: s.query,
        }));
        const chats: FeedItem[] = (chatRes.data ?? [])
          .filter((c: any) => (c.chat_messages?.length ?? 0) >= 2)
          .map((c: any) => ({
            type: 'chat', id: c.id, created_at: c.updated_at, entryId: c.entry_id,
            preview: c.journal_entries?.content ?? '',
          }));
        const insights: FeedItem[] = (insightRes.data ?? []).map((i: any) => ({
          type: 'insight', id: i.id, created_at: i.created_at,
          themeName: i.prompt_themes?.name ?? 'Theme',
        }));

        setFeed(
          [...searches, ...chats, ...insights].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        );
      });
    }, [])
  );

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

  const filteredFeed = filter === 'all' ? feed : feed.filter(item => item.type === filter);

  return (
    <WarmBackground>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 12 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🪞</Text>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 28, color: '#1c1917', marginBottom: 8 }}>
          Reflect
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', lineHeight: 21, marginBottom: 20 }}>
          Revisit your searches, chats, and the patterns in how you journal.
        </Text>
      </View>

      {/* Monthly reflection — the headline card */}
      {latestMonthly && (() => {
        const isNew = !latestMonthly.seen_at;
        const accent = isNew ? '#6D4CAD' : '#b0a89c';
        return (
          <View style={{ paddingHorizontal: 24 }}>
            <Pressable
              onPress={() => router.push(`/monthly-digest/${latestMonthly.id}`)}
              style={{
                backgroundColor: isNew ? '#F3EDFC' : '#ffffff',
                borderRadius: 18,
                marginBottom: 20,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 18,
                borderWidth: isNew ? 1.5 : 0,
                borderColor: '#D6C6EE',
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isNew ? 0.1 : 0.05, shadowRadius: 8, elevation: 3,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>🌙</Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', color: accent }}>
                    Monthly Reflection · {formatMonth(latestMonthly.month_start)}
                  </Text>
                </View>
                {isNew && (
                  <View style={{ backgroundColor: '#6D4CAD', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: '#ffffff' }}>NEW</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 16, fontFamily: 'Inter_400Regular', color: isNew ? '#292524' : '#78716c', lineHeight: 25, marginBottom: 12 }} numberOfLines={4}>
                {latestMonthly.content}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: accent }}>Read full reflection</Text>
                <Feather name="arrow-right" size={11} color={accent} />
              </View>
            </Pressable>
          </View>
        );
      })()}

      {/* Weekly reflections — small scattered note cards */}
      {weeklyDigests.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{
            fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
            color: '#c4b9b0', paddingHorizontal: 24, marginBottom: 12,
          }}>
            Weekly reflections
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 6, gap: 14 }}
            style={{ flexGrow: 0 }}>
            {weeklyDigests.map((w, i) => {
              const cardStyle = WEEKLY_CARD_STYLES[i % WEEKLY_CARD_STYLES.length];
              const isNew = !w.seen_at;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => router.push(`/digest/${w.id}`)}
                  style={{
                    width: 118, minHeight: 96, backgroundColor: cardStyle.bg, borderRadius: 14,
                    padding: 12, transform: [{ rotate: cardStyle.rotate }],
                    shadowColor: '#1c1917', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
                  }}>
                  {isNew && (
                    <View style={{
                      position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4,
                      backgroundColor: cardStyle.accent,
                    }} />
                  )}
                  <Text style={{ fontSize: 16, marginBottom: 8 }}>🌿</Text>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: cardStyle.accent, lineHeight: 15 }}>
                    {formatWeek(w.week_start)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {themes.length > 0 && (
        <View style={{ paddingHorizontal: 24, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
        </View>
      )}

      {/* Divider — everything below is the activity feed */}
      <View style={{ height: 1, backgroundColor: '#ede8e0', marginHorizontal: 24, marginTop: 16, marginBottom: 16 }} />

      {feed.length === 0 ? (
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
            color: '#c4b9b0', paddingHorizontal: 24, marginBottom: 12,
          }}>
            Recent activity
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            style={{ marginBottom: 14, flexGrow: 0 }}>
            {FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={`${f.key}-${active}`}
                  onPress={() => setFilter(f.key)}
                  style={{
                    backgroundColor: active ? '#1c1917' : '#ffffff',
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
                    alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    borderWidth: 1, borderColor: active ? '#1c1917' : '#ede8e0',
                  }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: 'Inter_600SemiBold', fontSize: 12.5, lineHeight: 16,
                      includeFontPadding: false,
                      color: active ? '#ffffff' : '#78716c',
                    }}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {filteredFeed.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 40 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', textAlign: 'center' }}>
                Nothing here yet for this filter.
              </Text>
            </View>
          ) : (
          <FlatList
            data={filteredFeed}
            keyExtractor={item => `${item.type}-${item.id}`}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            renderItem={({ item }) => {
              const style = FEED_STYLES[item.type];
              const label =
                item.type === 'search' ? item.query
                  : item.type === 'chat' ? (preview(item.preview) || 'Chat about an entry')
                  : `${item.themeName} insights`;

              function handlePress() {
                if (item.type === 'search') router.push(`/search-overlay?query=${encodeURIComponent(item.query)}`);
                else if (item.type === 'chat') router.push(`/chat/${item.entryId}`);
                else router.push(`/theme-insight/${item.id}`);
              }

              return (
                <Pressable
                  onPress={handlePress}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: pressed ? '#f5f0eb' : '#ffffff',
                    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
                    shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                  })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 12, backgroundColor: style.chipBg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Feather name={style.icon} size={16} color={style.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
                        color: style.color, marginBottom: 3,
                      }}>
                        {style.tag}
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#292524' }} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontFamily: 'Inter_400Regular', fontSize: 11, color: '#c4b9b0', marginLeft: 8,
                      flexShrink: 0, minWidth: 52, textAlign: 'right',
                    }}
                    numberOfLines={1}>
                    {formatRelative(item.created_at)}
                  </Text>
                </Pressable>
              );
            }}
          />
          )}
        </>
      )}
    </WarmBackground>
  );
}
