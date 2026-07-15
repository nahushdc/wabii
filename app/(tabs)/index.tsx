import { useState, useCallback, useEffect } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

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

function getGreetingEmoji() {
  const hour = new Date().getHours();
  if (hour < 12) return '☀️';
  if (hour < 17) return '🌤️';
  if (hour < 21) return '🌇';
  return '🌙';
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

function getFirstName(nameOrEmail: string) {
  if (nameOrEmail.includes('@')) return '';
  return nameOrEmail.split(/\s+/)[0];
}

// Previous "vivid jewel-tone" palette — kept here so we can revert by
// swapping which array CARD_COLORS points to below.
const CARD_COLORS_VIVID = [
  '#F6C453',
  '#C3DE6B',
  '#4FC1AE',
  '#5B9BD9',
  '#A47FDE',
  '#F0A93A',
  '#35A891',
  '#E0982F',
];

// Same hues as CARD_COLORS_VIVID, blended ~45% toward white for a softer,
// lighter feel while keeping each card's paired text color unchanged.
const CARD_COLORS_LIGHT = [
  '#FADFA0',
  '#DEEDAE',
  '#9EDDD2',
  '#A5C8EA',
  '#CDB9ED',
  '#F7D093',
  '#90CFC3',
  '#EEC68D',
];

const CARD_COLORS = CARD_COLORS_LIGHT;

// A darker shade of each card color above, same order, for the entry text —
// keeps each card tonally consistent instead of using flat black/gray text.
const CARD_TEXT_COLORS = [
  '#6B4400',
  '#3F4D12',
  '#0B3D35',
  '#1B3A5C',
  '#3D2463',
  '#6B3D06',
  '#0E3D33',
  '#5C3A08',
];

export default function HomeScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [hasEntries, setHasEntries] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latestDigest, setLatestDigest] = useState<Digest | null>(null);
  const [chatEntryIds, setChatEntryIds] = useState<Set<string>>(new Set());
  const [firstName, setFirstName] = useState('');
  const greetingEmoji = getGreetingEmoji();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
      if (name) setFirstName(getFirstName(name));
    });
  }, []);

  async function fetchEntries(digest: Digest | null) {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, content, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setSections(groupByDate(data, digest));
  }

  async function fetchAll() {
    const [{ data: entryData }, { data: digestData }, { data: conversationData }] = await Promise.all([
      supabase.from('journal_entries').select('id, content, created_at').order('created_at', { ascending: false }),
      supabase.from('weekly_digests').select('id, content, week_start').order('week_start', { ascending: false }).limit(1).single(),
      supabase.from('chat_conversations').select('entry_id'),
    ]);
    const entries = entryData ?? [];
    // A digest is only meaningful once there's at least one real entry —
    // ignore stray digest rows for accounts with none.
    const digest = entries.length > 0 ? (digestData ?? null) : null;
    setLatestDigest(digest);
    setHasEntries(entries.length > 0);
    setSections(groupByDate(entries, digest));
    setChatEntryIds(new Set((conversationData ?? []).map(c => c.entry_id)));
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAll().finally(() => setLoading(false));
    }, [])
  );

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color: '#44403c', lineHeight: 30 }}>
          {greetingEmoji}  Hey{firstName ? ` ${firstName}` : ' there'}
        </Text>
      </View>

      {!hasEntries ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>✍️</Text>
          <Text style={{ fontSize: 22, fontFamily: 'Inter_600SemiBold', color: '#1c1917', marginBottom: 8, textAlign: 'center' }}>
            Nothing here yet
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', textAlign: 'center', lineHeight: 24, marginBottom: 24 }}>
            Your journal is waiting. Write down whatever's on your mind.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/new-entry')}
            style={{
              backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24,
              flexDirection: 'row', alignItems: 'center', gap: 8,
            }}>
            <Feather name="edit-3" size={16} color="#ffffff" />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#ffffff' }}>Add your first journal entry</Text>
          </Pressable>
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
              tintColor="#E85D2C"
            />
          }
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 180 }}
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
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    marginBottom: 10,
                    paddingHorizontal: 18,
                    paddingTop: 14,
                    paddingBottom: 16,
                    shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
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

            const colorIndex = item.id.charCodeAt(0) % CARD_COLORS.length;
            const bg = CARD_COLORS[colorIndex];
            const textColor = CARD_TEXT_COLORS[colorIndex];
            const time = new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const hasChat = chatEntryIds.has(item.id);
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
                  fontSize: 16,
                  fontFamily: 'Inter_400Regular',
                  color: textColor,
                  lineHeight: 25,
                  marginBottom: 10,
                }}>
                  {preview(item.content)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: textColor, opacity: 0.7 }}>
                    {time}
                  </Text>
                  {hasChat && (
                    <Pressable
                      onPress={() => router.push(`/chat/${item.id}`)}
                      hitSlop={8}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: 'rgba(232, 93, 44, 0.1)',
                        borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
                      }}>
                      <Feather name="message-circle" size={11} color="#E85D2C" />
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: '#E85D2C' }}>
                        Continue chat
                      </Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </WarmBackground>
  );
}
