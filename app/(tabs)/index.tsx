import { useState, useCallback } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

type Digest = {
  id: string;
  content: string;
  week_start: string;
};

type Entry = {
  id: string;
  content: string;
  created_at: string;
};

type EntryItem = Entry & { _type: 'entry' };
type DigestItem = Digest & { _type: 'digest' };
type SectionItem = EntryItem | DigestItem;

type Section = {
  title: string;
  data: SectionItem[];
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  if (hour < 21) return { text: 'Good evening', emoji: '🌇' };
  return { text: 'Good night', emoji: '🌙' };
}

function getDayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatWeek(dateStr: string) {
  const date = new Date(dateStr);
  const end = new Date(date);
  end.setDate(date.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(date)} – ${fmt(end)}`;
}

function groupByDate(entries: Entry[], digest: Digest | null): Section[] {
  const groups: Record<string, EntryItem[]> = {};
  for (const entry of entries) {
    const label = getDayLabel(entry.created_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push({ ...entry, _type: 'entry' });
  }

  const sections: Section[] = Object.entries(groups).map(([title, data]) => ({ title, data }));

  if (digest) {
    sections.push({
      title: formatWeek(digest.week_start),
      data: [{ ...digest, _type: 'digest' }],
    });
  }

  return sections;
}

function preview(content: string) {
  return content.length > 180 ? content.slice(0, 180).trimEnd() + '…' : content;
}

const CARD_COLORS = [
  '#fdf0e8',
  '#e8f4f0',
  '#eee8f8',
  '#f8f4e8',
  '#e8f0f8',
  '#f8e8ee',
];

export default function HomeScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latestDigest, setLatestDigest] = useState<Digest | null>(null);
  const greeting = getGreeting();

  async function fetchEntries(digest: Digest | null) {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, content, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setSections(groupByDate(data, digest));
  }

  async function fetchAll() {
    const [{ data: entryData }, { data: digestData }] = await Promise.all([
      supabase.from('journal_entries').select('id, content, created_at').order('created_at', { ascending: false }),
      supabase.from('weekly_digests').select('id, content, week_start').order('week_start', { ascending: false }).limit(1).single(),
    ]);
    const digest = digestData ?? null;
    setLatestDigest(digest);
    if (entryData) setSections(groupByDate(entryData, digest));
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAll().finally(() => setLoading(false));
    }, [])
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf9f7' }}>
        <ActivityIndicator color="#4f46e5" />
      </View>
    );
  }

  const hasContent = sections.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#faf9f7' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#a8a29e', marginBottom: 4 }}>
              {greeting.emoji}  {greeting.text}
            </Text>
            <Text style={{ fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold', color: '#1c1917', lineHeight: 40 }}>
              Journal
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: '#f0ede8',
              alignItems: 'center', justifyContent: 'center',
              marginTop: 8,
            }}>
            <Feather name="user" size={18} color="#78716c" />
          </Pressable>
        </View>
      </View>

      {!hasContent ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>✍️</Text>
          <Text style={{ fontSize: 22, fontFamily: 'PlayfairDisplay_600SemiBold', color: '#1c1917', marginBottom: 8, textAlign: 'center' }}>
            Nothing here yet
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', textAlign: 'center', lineHeight: 24 }}>
            Tap New Entry to write your first journal entry.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await fetchAll();
                setRefreshing(false);
              }}
              tintColor="#4f46e5"
            />
          }
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingTop: 20, paddingBottom: 6, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0' }}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => {
            if (item._type === 'digest') {
              return (
                <Pressable
                  onPress={() => router.push(`/digest/${item.id}`)}
                  style={{
                    backgroundColor: '#fdf3e3',
                    borderRadius: 16,
                    marginBottom: 10,
                    paddingHorizontal: 18,
                    paddingTop: 14,
                    paddingBottom: 16,
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Text style={{ fontSize: 13 }}>🌿</Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', color: '#b07d4a' }}>
                      Weekly Reflection
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_400Regular', color: '#292524', lineHeight: 24, marginBottom: 10 }} numberOfLines={3}>
                    {item.content}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: '#b07d4a' }}>Read full reflection</Text>
                    <Feather name="arrow-right" size={11} color="#b07d4a" />
                  </View>
                </Pressable>
              );
            }

            const bg = CARD_COLORS[item.id.charCodeAt(0) % CARD_COLORS.length];
            const time = new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            return (
              <Pressable
                onPress={() => router.push(`/entry/${item.id}`)}
                style={{
                  backgroundColor: bg,
                  borderRadius: 16,
                  marginBottom: 10,
                  paddingHorizontal: 18,
                  paddingTop: 14,
                  paddingBottom: 16,
                }}>
                <Text style={{
                  fontSize: 15,
                  fontFamily: 'Inter_400Regular',
                  color: '#292524',
                  lineHeight: 24,
                  marginBottom: 10,
                }}>
                  {preview(item.content)}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#a8a29e' }}>
                  {time}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
