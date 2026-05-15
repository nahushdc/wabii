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

type Section = {
  title: string;
  data: Entry[];
};

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
  return content.length > 160 ? content.slice(0, 160).trimEnd() + '…' : content;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatWeek(dateStr: string) {
  const date = new Date(dateStr);
  const end = new Date(date);
  end.setDate(date.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(date)} – ${fmt(end)}`;
}

function DigestCard({ digest }: { digest: Digest }) {
  return (
    <Pressable
      onPress={() => router.push(`/digest/${digest.id}`)}
      style={{
        backgroundColor: '#fdf6ee',
        borderRadius: 20,
        padding: 20,
        marginBottom: 8,
        marginTop: 4,
        borderWidth: 1,
        borderColor: '#f0e6d3',
        shadowColor: '#c4a882',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 3,
      }}>
      <View className="flex-row items-center gap-2 mb-3">
        <Text style={{ fontSize: 18 }}>🌿</Text>
        <Text className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#b07d4a' }}>Your Weekly Journey</Text>
      </View>
      <Text className="text-base font-semibold mb-2" style={{ color: '#1c1917' }}>{formatWeek(digest.week_start)}</Text>
      <Text className="text-sm leading-relaxed" style={{ color: '#78716c' }} numberOfLines={3}>{digest.content}</Text>
      <View className="flex-row items-center justify-end mt-3 gap-1">
        <Text className="text-xs" style={{ color: '#b07d4a' }}>Read reflection</Text>
        <Feather name="arrow-right" size={12} color="#b07d4a" />
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latestDigest, setLatestDigest] = useState<Digest | null>(null);

  async function fetchEntries() {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, content, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setSections(groupByDate(data));
  }

  async function fetchLatestDigest() {
    const { data } = await supabase
      .from('weekly_digests')
      .select('id, content, week_start')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();
    if (data) setLatestDigest(data);
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([fetchEntries(), fetchLatestDigest()]).finally(() => setLoading(false));
    }, [])
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#fafaf8' }}>
        <ActivityIndicator color="#4f46e5" />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#fafaf8' }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-16 pb-4">
        <Text className="text-3xl font-bold" style={{ color: '#1c1917' }}>Journal</Text>
        <Pressable
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: '#f0ede8' }}
          onPress={() => router.push('/profile')}>
          <Feather name="user" size={20} color="#78716c" />
        </Pressable>
      </View>

      {latestDigest && (
        <View className="px-4">
          <DigestCard digest={latestDigest} />
        </View>
      )}

      {sections.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-4">✍️</Text>
          <Text className="text-xl font-semibold mb-2" style={{ color: '#1c1917' }}>Nothing here yet</Text>
          <Text className="text-center" style={{ color: '#a8a29e' }}>Tap New Entry to write your first journal entry.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([fetchEntries(), fetchLatestDigest()]); setRefreshing(false); }} tintColor="#4f46e5" />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View className="pt-6 pb-2 px-2">
              <Text className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#a8a29e' }}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isLast = index === section.data.length - 1;
            return (
              <Pressable
                onPress={() => router.push(`/entry/${item.id}`)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#f5f0eb' : '#ffffff',
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: isLast ? 0 : 8,
                  shadowColor: '#1c1917',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                })}>
                <Text style={{ fontSize: 17, lineHeight: 26, color: '#292524' }}>
                  {preview(item.content)}
                </Text>
                <Text className="mt-2 text-xs" style={{ color: '#c4b9b0' }}>{formatTime(item.created_at)}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
