import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type Insight = {
  id: string;
  content: string;
  theme_id: string;
  created_at: string;
};

export default function ThemeInsightScreen() {
  const { id, themeId, themeName: pendingThemeName, count, needed } = useLocalSearchParams<{
    id: string; themeId?: string; themeName?: string; count?: string; needed?: string;
  }>();
  const isPending = id === 'pending';
  const [insight, setInsight] = useState<Insight | null>(null);
  const [themeName, setThemeName] = useState('');
  const [loading, setLoading] = useState(!isPending);

  useEffect(() => {
    if (isPending) return;
    async function fetchInsight() {
      const { data, error } = await supabase
        .from('theme_insights')
        .select('*')
        .eq('id', id)
        .single();
      if (error) console.log('Insight fetch error:', error.message);
      if (data) {
        setInsight(data);
        const { data: theme } = await supabase.from('prompt_themes').select('name').eq('id', data.theme_id).single();
        if (theme) setThemeName(theme.name);
      }
      setLoading(false);
    }
    fetchInsight();
  }, [id]);

  if (isPending) {
    const have = parseInt(count ?? '0', 10);
    const need = parseInt(needed ?? '3', 10);
    const remaining = Math.max(0, need - have);

    return (
      <WarmBackground>
        <View style={{ paddingHorizontal: 24, paddingTop: 64 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, alignSelf: 'flex-start' }}>
            <Feather name="arrow-left" size={22} color="#374151" />
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{
            width: 88, height: 88, borderRadius: 44, backgroundColor: '#FDE6DB',
            alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <Text style={{ fontSize: 40 }}>🌱</Text>
          </View>

          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917', marginBottom: 10, textAlign: 'center' }}>
            Still taking root
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#78716c', textAlign: 'center', lineHeight: 23, marginBottom: 28 }}>
            {remaining > 0
              ? `Write ${remaining} more ${remaining === 1 ? 'entry' : 'entries'} under "${pendingThemeName}" and I'll start noticing the patterns for you.`
              : `Almost there — a little more writing under "${pendingThemeName}" and your insights will be ready.`}
          </Text>

          {/* Progress dots */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {Array.from({ length: need }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 10, height: 10, borderRadius: 5,
                    backgroundColor: i < have ? '#E85D2C' : '#e7e5e4',
                  }}
                />
              ))}
            </View>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#a8a29e' }}>
              {have} of {need} entries
            </Text>
          </View>

          {themeId && (
            <Pressable
              onPress={() => router.push(`/(tabs)/new-entry?themeId=${themeId}`)}
              style={{
                backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
              <Feather name="edit-3" size={15} color="#ffffff" />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#ffffff' }}>Write an entry</Text>
            </Pressable>
          )}
        </View>
      </WarmBackground>
    );
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  if (!insight) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a8a29e' }}>Insight not found.</Text>
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginBottom: 24, alignSelf: 'flex-start' }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Feather name="bar-chart-2" size={16} color="#b07d4a" />
          <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', color: '#b07d4a' }}>
            Theme Insights
          </Text>
        </View>
        <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color: '#1c1917', marginTop: 4 }}>
          {themeName}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>
        <Text style={{ fontSize: 18, lineHeight: 32, color: '#292524', letterSpacing: 0.1 }}>
          {insight.content}
        </Text>
      </ScrollView>
    </WarmBackground>
  );
}
