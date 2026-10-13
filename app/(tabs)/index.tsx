import { useState, useCallback, useEffect } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
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

const CHECK_IN_WORDS = ['Check in', 'Rant', 'Vent', 'Yap', 'Reflect'];

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
  const [wordIndex, setWordIndex] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    const id = setInterval(() => setWordIndex(i => (i + 1) % CHECK_IN_WORDS.length), 2600);
    return () => clearInterval(id);
  }, []);

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

  const blobSize = 260;
  const heroHeight = Math.round(windowHeight * 0.78);

  const hero = (
    <View style={{ minHeight: heroHeight, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 }}>
      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 18, color: '#57534e', marginBottom: 4 }}>
        Hey{firstName ? ` ${firstName}` : ' there'},
      </Text>
      <Text style={{
        fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 30, color: '#1c1917',
        textAlign: 'center', paddingHorizontal: 20,
      }}>
        How are you feeling {timeOfDay}?
      </Text>

      <Pressable
        onPress={() => router.push('/(tabs)/new-entry')}
        accessibilityRole="button"
        accessibilityLabel={`${CHECK_IN_WORDS[wordIndex]}. Start a new entry.`}
        style={{ width: blobSize, height: blobSize, alignItems: 'center', justifyContent: 'center', marginTop: 34 }}>
        <View style={{ position: 'absolute' }}>
          <SpinningRing size={blobSize} />
        </View>
        <View style={{
          width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.primary,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 5,
        }}>
          <Feather name="plus" size={38} color="#ffffff" />
        </View>
        <View style={{ height: 22, marginTop: 14, alignItems: 'center', justifyContent: 'center', width: blobSize }}>
          <Animated.Text
            key={CHECK_IN_WORDS[wordIndex]}
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(250)}
            style={{ position: 'absolute', fontFamily: 'Inter_600SemiBold', fontSize: 17, color: '#1c1917' }}>
            {CHECK_IN_WORDS[wordIndex]}
          </Animated.Text>
        </View>
      </Pressable>

      {hasEntries ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 28,
          borderWidth: 1, borderColor: streak > 0 ? 'rgba(232, 93, 44, 0.5)' : 'rgba(28, 25, 23, 0.18)',
          borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8,
        }}>
          <Ionicons name="flame-outline" size={16} color={streak > 0 ? COLORS.primary : '#a8a29e'} />
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13.5, color: streak > 0 ? '#57534e' : '#a8a29e' }}>
            {streak} day streak
          </Text>
        </View>
      ) : (
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', marginTop: 28, textAlign: 'center' }}>
          Whatever's on your mind — get it out.
        </Text>
      )}
    </View>
  );

  return (
    <WarmBackground>
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
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 40, paddingBottom: 180 }}
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
