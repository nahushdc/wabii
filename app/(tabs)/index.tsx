import { useState, useCallback, useEffect } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { SpinningRing } from '@/components/spinning-ring';
import { COLORS } from '@/constants/colors';
import { calculateStreak } from '@/lib/streak';

type Entry = {
  id: string;
  content: string;
  created_at: string;
};

type Section = {
  title: string;
  data: Entry[];
};

function getTimeOfDayPhrase() {
  const hour = new Date().getHours();
  if (hour < 12) return 'this morning';
  if (hour < 17) return 'this afternoon';
  if (hour < 21) return 'this evening';
  return 'tonight';
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

function groupByDate(entries: Entry[]): Section[] {
  const groups: Record<string, Entry[]> = {};
  for (const entry of entries) {
    const label = getDayLabel(entry.created_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(entry);
  }

  return Object.entries(groups).map(([title, data]) => ({ title, data }));
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
  const [chatEntryIds, setChatEntryIds] = useState<Set<string>>(new Set());
  const [firstName, setFirstName] = useState('');
  const [streak, setStreak] = useState(0);
  const timeOfDay = getTimeOfDayPhrase();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
      if (name) setFirstName(getFirstName(name));
    });
  }, []);

  async function fetchAll() {
    const [{ data: entryData }, { data: conversationData }] = await Promise.all([
      supabase.from('journal_entries').select('id, content, created_at').order('created_at', { ascending: false }),
      supabase.from('chat_conversations').select('entry_id'),
    ]);
    const entries = entryData ?? [];
    setHasEntries(entries.length > 0);
    setSections(groupByDate(entries));
    setStreak(calculateStreak(entries.map(e => e.created_at)));
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

  // The intro shows only the first time; after that search opens directly.
  async function handleSearchPress() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = user
      ? await supabase.from('users').select('search_onboarding_seen').eq('id', user.id).maybeSingle()
      : { data: null };
    router.push(data?.search_onboarding_seen ? '/search-overlay' : '/search-onboarding');
  }

  const ringSize = 230;

  const hero = (
    <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 8 }}>
      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 16, color: '#78716c', marginBottom: 6 }}>
        Hey{firstName ? ` ${firstName}` : ' there'},
      </Text>
      <Text style={{
        fontFamily: 'Inter_700Bold', fontSize: 31, lineHeight: 38, color: '#1c1917',
        textAlign: 'center', paddingHorizontal: 20,
      }}>
        How are you feeling {timeOfDay}?
      </Text>

      <Pressable
        onPress={() => router.push('/(tabs)/new-entry')}
        accessibilityRole="button"
        accessibilityLabel="Let it out. Start a new entry."
        style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center', marginTop: 32 }}>
        <View style={{ position: 'absolute' }}>
          <SpinningRing size={ringSize} />
        </View>
        <Feather name="plus" size={34} color={COLORS.primary} />
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: COLORS.primary, marginTop: 6 }}>
          Let it out
        </Text>
      </Pressable>

      {streak > 0 ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24,
          backgroundColor: '#F5CBB6', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11,
        }}>
          <Ionicons name="flame-outline" size={18} color={COLORS.primary} />
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: '#1c1917' }}>
            {streak} day{streak === 1 ? '' : 's'} streak
          </Text>
        </View>
      ) : !hasEntries ? (
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', marginTop: 24, textAlign: 'center' }}>
          Whatever's on your mind — get it out.
        </Text>
      ) : null}

      <View style={{ height: 12 }} />
    </View>
  );

  return (
    <WarmBackground>
      {/* Search sits top-right; the greeting and ring scroll with the entries. */}
      <Pressable
        onPress={handleSearchPress}
        hitSlop={10}
        style={{
          position: 'absolute', top: 60, right: 24, zIndex: 2,
          width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
        }}>
        <Feather name="search" size={18} color="#78716c" />
      </Pressable>

        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          ListHeaderComponent={hero}
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
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 76, paddingBottom: 180 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingTop: 20, paddingBottom: 6, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0' }}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => {
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
                        backgroundColor: 'rgba(255, 255, 255, 0.55)',
                        borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
                      }}>
                      <Feather name="message-circle" size={11} color={textColor} />
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: textColor }}>
                        Continue chat
                      </Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
    </WarmBackground>
  );
}
