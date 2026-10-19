import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { openSearch } from '@/lib/open-search';
import { fetchPursuitCounts, startPursuit } from '@/lib/pursuits';

type ThemeOption = { id: string; name: string };

type PatternEntry = { pattern: string; count: number };
type DigestInsights = {
  moods: string[];
  new_patterns: string[];
  repeating_patterns: PatternEntry[];
  attention_patterns: PatternEntry[];
};

type MonthlyDigest = { id: string; content: string; month_start: string; seen_at: string | null; insights: DigestInsights | null };
type WeeklyDigestSummary = { id: string; week_start: string; seen_at: string | null; insights: DigestInsights | null };

// Soft, flat tints for the weekly cards — lighter than the page's accent
// colours and clearly not white, so they don't melt into the white nav bar.
const WEEKLY_CARD_STYLES = [
  { bg: '#FADFD0', dot: '#E85D2C' },
  { bg: '#E6DDF5', dot: '#7C5CBF' },
  { bg: '#D9E8F7', dot: '#4A8AD4' },
  { bg: '#E3EFD3', dot: '#5E9A3A' },
];

// Solid poster colours for the pursuit cards, each with a darker text tone.
const PURSUIT_CARD_STYLES = [
  { bg: '#DEEDAE', ink: '#3F4D12' },
  { bg: '#A5C8EA', ink: '#1B3A5C' },
  { bg: '#FADFA0', ink: '#6B4400' },
  { bg: '#CDB9ED', ink: '#3D2463' },
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
  const [latestMonthly, setLatestMonthly] = useState<MonthlyDigest | null>(null);
  const [weeklyDigests, setWeeklyDigests] = useState<WeeklyDigestSummary[]>([]);
  const [pursuitCounts, setPursuitCounts] = useState<Record<string, number>>({});

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Set<FeedType>>(new Set(ALL_FEED_TYPES));

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('prompt_themes')
        .select('id, name')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .then(({ data }) => setThemes(data ?? []));

      supabase
        .from('monthly_digests')
        .select('id, content, month_start, seen_at, insights')
        .order('month_start', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setLatestMonthly(data ?? null));

      supabase
        .from('weekly_digests')
        .select('id, week_start, seen_at, insights')
        .order('week_start', { ascending: false })
        .limit(10)
        .then(({ data }) => setWeeklyDigests((data ?? []) as WeeklyDigestSummary[]));

      supabase
        .from('journal_entries')
        .select('prompt_theme_id')
        .not('prompt_theme_id', 'is', null)
        .then(({ data }) => {
          const counts: Record<string, number> = {};
          for (const row of data ?? []) {
            const id = row.prompt_theme_id as string;
            counts[id] = (counts[id] ?? 0) + 1;
          }
          setPursuitCounts(counts);
        });
      fetchPursuitCounts().then(counts => { if (counts) setPursuitCounts(prev => ({ ...prev, ...counts })); });

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

  const filteredFeed = selectedTypes.size === ALL_FEED_TYPES.length
    ? feed
    : feed.filter(item => selectedTypes.has(item.type));

  const listHeader = (
    <>
      {/* Header — a small title with search beside it */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 6 }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#1c1917' }}>
          Reflect
        </Text>
        <Pressable
          onPress={openSearch}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Search your journal"
          style={{
            width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
          }}>
          <Feather name="search" size={18} color="#78716c" />
        </Pressable>
      </View>

      {/* Monthly reflection — flat dark card, the headline moment */}
      {latestMonthly && (() => {
        const isNew = !latestMonthly.seen_at;
        const ins = latestMonthly.insights;
        const monthName = new Date(`${latestMonthly.month_start}T00:00:00`).toLocaleDateString('en-US', { month: 'long' });
        const chips = [
          ins && ins.moods.length > 0 ? `${ins.moods.length} mood${ins.moods.length === 1 ? '' : 's'}` : null,
          ins && ins.new_patterns.length > 0 ? `${ins.new_patterns.length} new` : null,
          ins && ins.repeating_patterns.length > 0 ? `${ins.repeating_patterns.length} repeating` : null,
          ins && ins.attention_patterns.length > 0 ? `${ins.attention_patterns.length} need attention` : null,
        ].filter(Boolean) as string[];
        return (
          <View style={{ paddingHorizontal: 20, marginTop: 14, marginBottom: 6 }}>
            <Pressable onPress={() => router.push(`/monthly-digest/${latestMonthly.id}`)}>
              <View style={{ backgroundColor: '#2A2040', borderRadius: 24, padding: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textTransform: 'uppercase', color: '#C9B8E8' }}>
                    Monthly reflection
                  </Text>
                  {isNew && (
                    <View style={{ backgroundColor: '#FF8A5C', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: '#2a1608' }}>NEW</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 32, fontFamily: 'Inter_700Bold', color: '#F3EEFA', marginTop: 4 }}>
                  {monthName}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#E6DCF7', lineHeight: 21, marginTop: 6 }} numberOfLines={3}>
                  {stripLeadingHeading(latestMonthly.content).replace(/\*\*/g, '')}
                </Text>
                {chips.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {chips.map(c => (
                      <View key={c} style={{ backgroundColor: '#3B2E5C', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ fontSize: 11.5, fontFamily: 'Inter_500Medium', color: '#E6DCF7' }}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 16,
                  backgroundColor: '#FF8A5C', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 10,
                }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#2a1608' }}>Read reflection</Text>
                  <Feather name="arrow-right" size={14} color="#2a1608" />
                </View>
              </View>
            </Pressable>
          </View>
        );
      })()}

      {/* Weekly reflections — flat, softly tinted cards */}
      {weeklyDigests.length > 0 && (
        <View style={{ marginTop: 20, marginBottom: 6 }}>
          <Text style={{
            fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
            color: '#a8a29e', paddingHorizontal: 24, marginBottom: 10,
          }}>
            Weekly
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
            style={{ flexGrow: 0 }}>
            {weeklyDigests.map((w, i) => {
              const card = WEEKLY_CARD_STYLES[i % WEEKLY_CARD_STYLES.length];
              const isNew = !w.seen_at;
              const mood = w.insights?.moods?.[0];
              return (
                <Pressable
                  key={w.id}
                  onPress={() => router.push(`/digest/${w.id}`)}
                  style={{ width: 116, backgroundColor: card.bg, borderRadius: 18, padding: 13 }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#1c1917', lineHeight: 18 }}>
                    {formatWeek(w.week_start)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: card.dot }} />
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#57534e' }} numberOfLines={1}>
                      {isNew ? 'New' : (mood ?? 'Read')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Pursuits — questions about yourself, answered from the whole journal */}
      <View style={{ marginTop: 20, marginBottom: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 10 }}>
          <Text style={{
            fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', color: '#a8a29e',
          }}>
            Pursuits
          </Text>
          {themes.length > 0 && (
            <Pressable onPress={startPursuit} hitSlop={10}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: COLORS.primary }}>Add</Text>
            </Pressable>
          )}
        </View>
        {themes.length === 0 ? (
          <Pressable
            onPress={startPursuit}
            accessibilityRole="button"
            style={{
              marginHorizontal: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#d6cdc3', borderRadius: 22,
              paddingHorizontal: 18, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 14,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE6DB', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="compass" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917' }}>Add your first pursuit</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 17, color: '#78716c', marginTop: 1 }}>
                A question you want to answer about yourself.
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color="#c4b9b0" />
          </Pressable>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
            style={{ flexGrow: 0 }}>
            {themes.map((theme, i) => {
              const card = PURSUIT_CARD_STYLES[i % PURSUIT_CARD_STYLES.length];
              const count = pursuitCounts[theme.id] ?? 0;
              return (
                <Pressable
                  key={theme.id}
                  onPress={() => router.push(`/pursuit/${theme.id}`)}
                  style={{
                    width: 124, height: 132, backgroundColor: card.bg, borderRadius: 22, padding: 14,
                    justifyContent: 'space-between',
                  }}>
                  <Feather name="compass" size={18} color={card.ink} />
                  <View>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 28, color: card.ink, lineHeight: 30 }}>{count}</Text>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12.5, color: card.ink, marginTop: 3 }} numberOfLines={2}>
                      {theme.name}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

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
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
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

          // Rows are flat (no card). Row visuals live in a plain View rendered through Pressable's
          // children function — NOT in Pressable's `style` function. That
          // style function is dropped on device by NativeWind's interop, which
          // is what left rows with no card, no padding, and no side insets.
          return (
            <View style={{ paddingHorizontal: 24 }}>
              <Pressable onPress={handlePress}>
                {({ pressed }) => (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 12, opacity: pressed ? 0.55 : 1,
                  }}>
                    <View style={{
                      width: 38, height: 38, borderRadius: 13, backgroundColor: style.chipBg,
                      alignItems: 'center', justifyContent: 'center', marginRight: 12,
                    }}>
                      <Feather name={style.icon} size={16} color={style.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
                          color: style.color, marginBottom: 3,
                        }}
                        numberOfLines={1}>
                        {tag}
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, letterSpacing: 0, textTransform: 'none', color: '#b3a89c' }}>
                          {'  ·  '}{formatRelative(item.created_at)}
                        </Text>
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#292524' }} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  </View>
                )}
              </Pressable>
            </View>
          );
        }}
      />
    </WarmBackground>
  );
}
