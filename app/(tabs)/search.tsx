import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';

type ThemeOption = { id: string; name: string };

type PatternEntry = { pattern: string; count: number };
type DigestInsights = {
  moods: string[];
  new_patterns: string[];
  repeating_patterns: PatternEntry[];
  attention_patterns: PatternEntry[];
};

type MonthlyDigest = { id: string; content: string; month_start: string; seen_at: string | null; insights: DigestInsights | null };
type WeeklyDigestSummary = { id: string; week_start: string; seen_at: string | null };

// Alternating pastel + slight rotation for each mini weekly card, so the row
// reads like a little scattered stack of notes rather than a rigid list.
const WEEKLY_CARD_STYLES = [
  { bg: '#CFEAC1', accent: '#2D5F2D', rotate: '-3deg' },
  { bg: '#FBC9A8', accent: '#9A3412', rotate: '2deg' },
  { bg: '#DDC6F5', accent: '#5B3E85', rotate: '-2deg' },
  { bg: '#F6DD97', accent: '#8A5A0F', rotate: '3deg' },
];

type FeedItem =
  | { type: 'search'; id: string; created_at: string; query: string }
  | { type: 'chat'; id: string; created_at: string; entryId: string; preview: string }
  | { type: 'insight'; id: string; created_at: string; themeName: string }
  | { type: 'reflection'; id: string; created_at: string; period: 'weekly' | 'monthly'; content: string; insights: DigestInsights | null };

const FEED_STYLES = {
  search: { icon: 'clock' as const, bg: '#F5F2EC', chipBg: '#E8E1D6', color: '#8a7a6f', tag: 'Search' },
  chat: { icon: 'message-circle' as const, bg: '#FDF3EE', chipBg: '#FBDCCB', color: '#C2410C', tag: 'Chat' },
  insight: { icon: 'bar-chart-2' as const, bg: '#F6F1FB', chipBg: '#E5D8F5', color: '#6D4CAD', tag: 'Insight' },
  reflection: { icon: 'feather' as const, bg: '#EFF6EC', chipBg: '#DCEDD5', color: '#3F7A3F', tag: 'Reflection' },
};

type FeedType = FeedItem['type'];

const FILTER_OPTIONS: { key: FeedType; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'chat', label: 'Chat' },
  { key: 'insight', label: 'Insight' },
  { key: 'reflection', label: 'Reflection' },
];

const ALL_FEED_TYPES: FeedType[] = FILTER_OPTIONS.map(f => f.key);

function FilterMenu({ selected, onChange }: { selected: Set<FeedType>; onChange: (s: Set<FeedType>) => void }) {
  const [open, setOpen] = useState(false);
  const isFiltered = selected.size < ALL_FEED_TYPES.length;

  function toggle(type: FeedType) {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(next);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        style={{
          width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
          backgroundColor: isFiltered ? COLORS.primary : '#ffffff',
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
        }}>
        <Feather name="sliders" size={14} color={isFiltered ? '#ffffff' : '#a8a29e'} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(28,25,23,0.35)' }} onPress={() => setOpen(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable
              style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingBottom: 40 }}
              onPress={e => e.stopPropagation()}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#1c1917' }}>Filter activity</Text>
                <Pressable onPress={() => onChange(new Set(ALL_FEED_TYPES))}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.primary }}>Select all</Text>
                </Pressable>
              </View>
              {FILTER_OPTIONS.map(opt => {
                const style = FEED_STYLES[opt.key];
                const checked = selected.has(opt.key);
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => toggle(opt.key)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingHorizontal: 24, paddingVertical: 12,
                    }}>
                    <View style={{
                      width: 34, height: 34, borderRadius: 12, backgroundColor: style.chipBg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Feather name={style.icon} size={15} color={style.color} />
                    </View>
                    <Text style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, color: '#1c1917' }}>
                      {opt.label}
                    </Text>
                    <View style={{
                      width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: checked ? COLORS.primary : '#f0ebe3',
                    }}>
                      {checked && <Feather name="check" size={14} color="#ffffff" />}
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setOpen(false)}
                style={{
                  marginTop: 12, marginHorizontal: 24, backgroundColor: '#f7f4ef', borderRadius: 14,
                  paddingVertical: 14, alignItems: 'center',
                }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#78716c' }}>Done</Text>
              </Pressable>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function preview(content: string) {
  return content.length > 140 ? content.slice(0, 140).trimEnd() + '…' : content;
}

// Strips a leading markdown "## Heading" line the AI sometimes adds, so the
// card preview reads as clean prose rather than raw markdown.
function stripLeadingHeading(content: string) {
  return content.replace(/^\s*#{1,3}\s*.+\n+/, '').trim();
}

function formatMonth(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatWeek(dateStr: string) {
  const date = new Date(dateStr);
  const end = new Date(date);
  end.setDate(date.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(date)} – ${fmt(end)}`;
}

function insightSummaryLine(insights: DigestInsights | null): string | null {
  if (!insights) return null;
  const parts: string[] = [];
  if (insights.moods.length) parts.push(`${insights.moods.length} mood${insights.moods.length === 1 ? '' : 's'}`);
  if (insights.new_patterns.length) parts.push(`${insights.new_patterns.length} new`);
  if (insights.repeating_patterns.length) parts.push(`${insights.repeating_patterns.length} repeating`);
  if (insights.attention_patterns.length) parts.push(`${insights.attention_patterns.length} need${insights.attention_patterns.length === 1 ? 's' : ''} attention`);
  return parts.length ? parts.join(' · ') : null;
}

function InsightStatRow({ insights, light }: { insights: DigestInsights; light?: boolean }) {
  const stats: { label: string; count: number; color: string }[] = [
    { label: insights.moods.length === 1 ? 'mood' : 'moods', count: insights.moods.length, color: light ? '#C9B8E8' : '#8B5FBF' },
    { label: 'new', count: insights.new_patterns.length, color: light ? '#A9D6A0' : '#3F7A3F' },
    { label: 'repeating', count: insights.repeating_patterns.length, color: light ? '#F3EEFA' : '#78716c' },
    { label: insights.attention_patterns.length === 1 ? 'needs attention' : 'need attention', count: insights.attention_patterns.length, color: light ? '#F5B8A8' : '#C2410C' },
  ].filter(s => s.count > 0);

  if (stats.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {stats.map(s => (
        <View
          key={s.label}
          style={{
            flexDirection: 'row', alignItems: 'baseline', gap: 4,
            backgroundColor: light ? 'rgba(255,255,255,0.12)' : '#f7f4ef',
            borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
          }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: s.color }}>{s.count}</Text>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: light ? 'rgba(255,255,255,0.75)' : '#78716c' }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
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
  const [selectedTypes, setSelectedTypes] = useState<Set<FeedType>>(new Set(ALL_FEED_TYPES));

  useEffect(() => {
    supabase.from('prompt_themes').select('id, name').eq('status', 'active').order('created_at', { ascending: false }).then(({ data }) => {
      setThemes(data ?? []);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('monthly_digests')
        .select('id, content, month_start, seen_at, insights')
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
        supabase
          .from('weekly_digests')
          .select('id, content, week_start, insights')
          .order('week_start', { ascending: false })
          .limit(30),
        supabase
          .from('monthly_digests')
          .select('id, content, month_start, insights')
          .order('month_start', { ascending: false })
          .limit(24),
      ]).then(([searchRes, chatRes, insightRes, weeklyRes, monthlyRes]) => {
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
        const weeklyReflections: FeedItem[] = (weeklyRes.data ?? []).map(w => ({
          type: 'reflection', id: w.id, created_at: w.week_start, period: 'weekly', content: w.content, insights: w.insights ?? null,
        }));
        const monthlyReflections: FeedItem[] = (monthlyRes.data ?? []).map(m => ({
          type: 'reflection', id: m.id, created_at: m.month_start, period: 'monthly', content: m.content, insights: m.insights ?? null,
        }));

        setFeed(
          [...searches, ...chats, ...insights, ...weeklyReflections, ...monthlyReflections].sort(
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

  const filteredFeed = selectedTypes.size === ALL_FEED_TYPES.length
    ? feed
    : feed.filter(item => selectedTypes.has(item.type));

  const listHeader = (
    <>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 22 }}>
        <LinearGradient
          colors={['#8B5FBF', '#5B3E85']}
          style={{
            width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#5B3E85', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
          }}>
          <MaterialCommunityIcons name="brain" size={22} color="#ffffff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1c1917' }}>
            Reflect
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e', lineHeight: 18, marginTop: 2 }}>
            Your searches, chats, and patterns — gathered.
          </Text>
        </View>
      </View>

      {/* Monthly reflection — the headline moment */}
      {latestMonthly && (() => {
        const isNew = !latestMonthly.seen_at;
        return (
          <View style={{ paddingHorizontal: 24, marginBottom: 26 }}>
            <Pressable onPress={() => router.push(`/monthly-digest/${latestMonthly.id}`)}>
              <LinearGradient
                colors={['#332946', '#1E1830']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 26, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 22, overflow: 'hidden',
                  shadowColor: '#1E1830', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 6,
                }}>
                {/* decorative sparkle field */}
                <Text style={{ position: 'absolute', top: 14, right: 26, fontSize: 12, opacity: 0.5 }}>✦</Text>
                <Text style={{ position: 'absolute', top: 54, right: 54, fontSize: 8, opacity: 0.4 }}>✦</Text>
                <Text style={{ position: 'absolute', bottom: 60, right: 16, fontSize: 10, opacity: 0.35 }}>✦</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 17 }}>🌙</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textTransform: 'uppercase', color: '#C9B8E8' }}>
                        Monthly Reflection
                      </Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>
                        {formatMonth(latestMonthly.month_start)}
                      </Text>
                    </View>
                  </View>
                  {isNew && (
                    <View style={{ backgroundColor: '#8B5FBF', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: '#ffffff' }}>NEW</Text>
                    </View>
                  )}
                </View>

                {latestMonthly.insights && insightSummaryLine(latestMonthly.insights) ? (
                  <View style={{ marginBottom: 18 }}>
                    <InsightStatRow insights={latestMonthly.insights} light />
                  </View>
                ) : (
                  <Text style={{ fontSize: 17, fontFamily: 'Inter_500Medium', color: '#F3EEFA', lineHeight: 26, marginBottom: 18 }} numberOfLines={4}>
                    {stripLeadingHeading(latestMonthly.content)}
                  </Text>
                )}

                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 12,
                }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#ffffff' }}>Open your month in review</Text>
                  <Feather name="arrow-right" size={14} color="#ffffff" />
                </View>
              </LinearGradient>
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
                    borderWidth: 1, borderColor: 'rgba(28,25,23,0.06)',
                    shadowColor: '#1c1917', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
                  }}>
                  {isNew && (
                    <View style={{
                      position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4,
                      backgroundColor: cardStyle.accent,
                    }} />
                  )}
                  <Text style={{ fontSize: 16, marginBottom: 8 }}>🌿</Text>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: cardStyle.accent, lineHeight: 16 }}>
                    {formatWeek(w.week_start)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {themes.length > 0 && (
        <View style={{ marginBottom: 22 }}>
          <Text style={{
            fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textTransform: 'uppercase',
            color: '#c4b9b0', paddingHorizontal: 24, marginBottom: 10,
          }}>
            Your pursuits
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
            style={{ flexGrow: 0 }}>
            {themes.map(theme => (
              <Pressable
                key={theme.id}
                onPress={() => handleSeeInsights(theme)}
                disabled={insightLoadingId === theme.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: '#ffffff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11,
                  shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13, backgroundColor: '#FDE6DB',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {insightLoadingId === theme.id
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Feather name="compass" size={12} color={COLORS.primary} />}
                </View>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: '#1c1917' }} numberOfLines={1}>
                  {theme.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Divider — everything below is the activity feed */}
      <View style={{ height: 1, backgroundColor: '#ede8e0', marginHorizontal: 24, marginBottom: 18 }} />

      {feed.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 12 }}>
          <Text style={{
            fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textTransform: 'uppercase',
            color: '#c4b9b0',
          }}>
            Recent activity
          </Text>
          <FilterMenu selected={selectedTypes} onChange={setSelectedTypes} />
        </View>
      )}
    </>
  );

  return (
    <WarmBackground>
      <FlatList
        style={{ flex: 1 }}
        data={filteredFeed}
        keyExtractor={item => `${item.type}-${item.id}`}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingBottom: 130 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: feed.length === 0 ? 20 : 40, paddingHorizontal: 24 }}>
            {feed.length === 0 && <Text style={{ fontSize: 32, marginBottom: 10 }}>🕓</Text>}
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', textAlign: 'center' }}>
              {feed.length === 0 ? 'Your searches, chats, insights, and reflections will show up here.' : 'Nothing here yet for this filter.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const style = FEED_STYLES[item.type];
          const label =
            item.type === 'search' ? item.query
              : item.type === 'chat' ? (preview(item.preview) || 'Chat about an entry')
              : item.type === 'insight' ? `${item.themeName} insights`
              : insightSummaryLine(item.insights) ?? preview(stripLeadingHeading(item.content));
          const tag = item.type === 'reflection'
            ? (item.period === 'monthly' ? 'Monthly Reflection' : 'Weekly Reflection')
            : style.tag;

          function handlePress() {
            if (item.type === 'search') router.push(`/search-overlay?query=${encodeURIComponent(item.query)}`);
            else if (item.type === 'chat') router.push(`/chat/${item.entryId}`);
            else if (item.type === 'insight') router.push(`/theme-insight/${item.id}`);
            else router.push(item.period === 'monthly' ? `/monthly-digest/${item.id}` : `/digest/${item.id}`);
          }

          return (
            <View style={{ paddingHorizontal: 24 }}>
            <Pressable
              onPress={handlePress}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: pressed ? '#f5f0eb' : '#ffffff',
                borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 13, backgroundColor: style.chipBg,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name={style.icon} size={16} color={style.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
                    color: style.color, marginBottom: 3,
                  }}>
                    {tag}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#292524' }} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 14, includeFontPadding: false,
                  color: '#b3a89c', marginLeft: 14,
                  flexShrink: 0, minWidth: 58, textAlign: 'right',
                }}
                numberOfLines={1}>
                {formatRelative(item.created_at)}
              </Text>
            </Pressable>
            </View>
          );
        }}
      />
    </WarmBackground>
  );
}
