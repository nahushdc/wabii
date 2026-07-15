import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type Digest = {
  id: string;
  content: string;
  week_start: string;
  created_at: string;
};

function formatWeek(dateStr: string) {
  const date = new Date(dateStr);
  const end = new Date(date);
  end.setDate(date.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(date)} – ${fmt(end)}`;
}

export default function SummariesScreen() {
  const [digests, setDigests] = useState<Digest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function fetchDigests() {
    const { data, error } = await supabase
      .from('weekly_digests')
      .select('*')
      .order('week_start', { ascending: false });
    if (!error && data) setDigests(data);
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchDigests().finally(() => setLoading(false));
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
      <View className="flex-row items-center px-6 pt-16 pb-4">
        <Pressable onPress={() => router.back()} className="p-1 mr-4">
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text className="text-2xl font-bold" style={{ color: '#1c1917' }}>Summaries</Text>
      </View>

      {digests.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-4">✨</Text>
          <Text className="text-xl font-semibold mb-2" style={{ color: '#1c1917' }}>No summaries yet</Text>
          <Text className="text-center" style={{ color: '#a8a29e' }}>
            Your first weekly digest will appear here after you've journaled for a week.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchDigests(); setRefreshing(false); }} tintColor="#E85D2C" />
          }>
          {digests.map(digest => {
            const isOpen = expanded === digest.id;
            return (
              <Pressable
                key={digest.id}
                onPress={() => setExpanded(isOpen ? null : digest.id)}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  padding: 20,
                  marginBottom: 12,
                  shadowColor: '#1c1917',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                }}>
                <View className="flex-row items-center justify-between mb-2">
                  <View>
                    <Text className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#a8a29e' }}>Weekly digest</Text>
                    <Text className="text-base font-semibold" style={{ color: '#1c1917' }}>{formatWeek(digest.week_start)}</Text>
                  </View>
                  <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#a8a29e" />
                </View>
                {isOpen ? (
                  <Text className="mt-3 text-base leading-relaxed" style={{ color: '#44403c' }}>{digest.content}</Text>
                ) : (
                  <Text className="mt-1 text-sm" style={{ color: '#a8a29e' }} numberOfLines={2}>{digest.content}</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </WarmBackground>
  );
}
