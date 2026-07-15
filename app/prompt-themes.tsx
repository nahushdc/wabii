import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type Theme = {
  id: string;
  name: string;
  prompt_count: number;
};

export default function PromptThemesScreen() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchThemes() {
    const { data: themeRows } = await supabase
      .from('prompt_themes')
      .select('id, name')
      .order('created_at', { ascending: false });

    if (!themeRows || themeRows.length === 0) {
      setThemes([]);
      return;
    }

    const { data: promptRows } = await supabase
      .from('theme_prompts')
      .select('theme_id')
      .in('theme_id', themeRows.map(t => t.id));

    const counts: Record<string, number> = {};
    for (const p of promptRows ?? []) {
      counts[p.theme_id] = (counts[p.theme_id] ?? 0) + 1;
    }

    setThemes(themeRows.map(t => ({ ...t, prompt_count: counts[t.id] ?? 0 })));
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchThemes().finally(() => setLoading(false));
    }, [])
  );

  function handleDelete(theme: Theme) {
    Alert.alert('Delete theme', "This can't be undone. Any reminder using it will fall back to normal journaling.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('prompt_themes').delete().eq('id', theme.id);
          setThemes(prev => prev.filter(t => t.id !== theme.id));
        },
      },
    ]);
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917', flex: 1 }}>Prompt Themes</Text>
        <Pressable onPress={() => router.push('/prompt-theme/new')} style={{ padding: 4 }}>
          <Feather name="plus" size={22} color="#E85D2C" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {themes.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>✍️</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#1c1917', marginBottom: 6, textAlign: 'center' }}>
              No themes yet
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', textAlign: 'center', lineHeight: 20 }}>
              Create a set of custom prompts to inspire your entries.
            </Text>
          </View>
        ) : (
          themes.map(theme => (
            <Pressable
              key={theme.id}
              onPress={() => router.push(`/prompt-theme/${theme.id}`)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 12,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
              }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
                  {theme.name}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e' }}>
                  {theme.prompt_count} {theme.prompt_count === 1 ? 'prompt' : 'prompts'}
                </Text>
              </View>
              <Pressable onPress={() => handleDelete(theme)} hitSlop={8} style={{ padding: 2 }}>
                <Feather name="trash-2" size={18} color="#ef4444" />
              </Pressable>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
    </WarmBackground>
  );
}
