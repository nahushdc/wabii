import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type Theme = {
  id: string;
  name: string;
  focus: string | null;
  duration_days: number | null;
  started_at: string;
  prompt_count: number;
  status: 'active' | 'inactive';
};

type InsightType = 'theme' | 'pattern';

function formatStatus(theme: Theme): string {
  const promptLabel = `${theme.prompt_count} ${theme.prompt_count === 1 ? 'prompt' : 'prompts'}`;
  if (theme.duration_days == null) return `${promptLabel} · Ongoing`;

  const endsAt = new Date(theme.started_at).getTime() + theme.duration_days * 86400000;
  const daysLeft = Math.ceil((endsAt - Date.now()) / 86400000);
  if (daysLeft <= 0) return `${promptLabel} · Ended`;
  return `${promptLabel} · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
}

const HOW_IT_WORKS: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
  { icon: 'flag', title: 'Set a pursuit', body: 'Pick something about yourself you want to explore this month.' },
  { icon: 'edit-3', title: 'Dump your thoughts as they come', body: "Whenever something related crosses your mind — journal it, no need to wait." },
  { icon: 'bar-chart-2', title: 'Get insights about yourself', body: 'At the end, see an AI summary — and every entry behind it.' },
];

export default function PromptThemesScreen() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoExpanded, setInfoExpanded] = useState(true);
  const [insightLoading, setInsightLoading] = useState<string | null>(null);

  async function fetchThemes() {
    const { data: themeRows } = await supabase
      .from('prompt_themes')
      .select('id, name, focus, duration_days, started_at, status')
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

  async function handleToggleStatus(theme: Theme) {
    const newStatus = theme.status === 'active' ? 'inactive' : 'active';
    setThemes(prev => prev.map(t => (t.id === theme.id ? { ...t, status: newStatus } : t)));
    const { error } = await supabase.from('prompt_themes').update({ status: newStatus }).eq('id', theme.id);
    if (error) {
      console.warn('Failed to update pursuit status:', error.message);
      setThemes(prev => prev.map(t => (t.id === theme.id ? { ...t, status: theme.status } : t)));
    }
  }

  function handleDelete(theme: Theme) {
    Alert.alert('Delete pursuit', "This can't be undone. Any reminder using it will fall back to normal journaling.", [
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

  async function handleSeeInsight(theme: Theme, insightType: InsightType) {
    const loadingKey = `${theme.id}-${insightType}`;
    setInsightLoading(loadingKey);
    const { data, error: err } = await supabase.functions.invoke('theme-insights', {
      body: { theme_id: theme.id, insight_type: insightType },
    });
    setInsightLoading(null);
    if (err || data?.error) return;

    if (data?.insufficient) {
      router.push(
        `/theme-insight/pending?themeId=${theme.id}&themeName=${encodeURIComponent(theme.name)}&kind=${data.kind}&count=${data.count ?? ''}&needed=${data.needed ?? ''}`
      );
      return;
    }
    if (data?.id) router.push(`/theme-insight/${data.id}`);
  }

  const activeThemes = themes.filter(t => t.status !== 'inactive');
  const inactiveThemes = themes.filter(t => t.status === 'inactive');

  function renderThemeCard(theme: Theme) {
    const isActive = theme.status !== 'inactive';
    return (
      <View
        key={theme.id}
        style={{
          backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 12,
          opacity: isActive ? 1 : 0.7,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
        }}>
        <Pressable
          onPress={() => router.push(`/prompt-theme/${theme.id}`)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
              {theme.name}
            </Text>
            {theme.focus ? (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#78716c', marginBottom: 3 }} numberOfLines={1}>
                {theme.focus}
              </Text>
            ) : null}
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a8a29e' }}>
              {formatStatus(theme)}
            </Text>
          </View>
          <Pressable onPress={() => handleDelete(theme)} hitSlop={8} style={{ padding: 2 }}>
            <Feather name="trash-2" size={18} color="#ef4444" />
          </Pressable>
        </Pressable>

        <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
          <Pressable
            onPress={() => handleToggleStatus(theme)}
            style={{
              alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: isActive ? '#E6F3E0' : '#f0ebe3', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
            }}>
            <View style={{
              width: 6, height: 6, borderRadius: 3,
              backgroundColor: isActive ? '#3F7A3F' : '#a8a29e',
            }} />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: isActive ? '#3F7A3F' : '#78716c' }}>
              {isActive ? 'Active — tap to pause' : 'Paused — tap to resume'}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 16 }}>
          <Pressable
            onPress={() => handleSeeInsight(theme, 'theme')}
            disabled={insightLoading === `${theme.id}-theme`}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: '#FDE6DB', borderRadius: 12, paddingVertical: 9,
            }}>
            {insightLoading === `${theme.id}-theme`
              ? <ActivityIndicator size="small" color="#E85D2C" />
              : <Feather name="aperture" size={13} color="#E85D2C" />}
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: '#E85D2C' }}>Theme</Text>
          </Pressable>
          <Pressable
            onPress={() => handleSeeInsight(theme, 'pattern')}
            disabled={insightLoading === `${theme.id}-pattern`}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: '#EFE6FB', borderRadius: 12, paddingVertical: 9,
            }}>
            {insightLoading === `${theme.id}-pattern`
              ? <ActivityIndicator size="small" color="#6D4CAD" />
              : <Feather name="bar-chart-2" size={13} color="#6D4CAD" />}
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: '#6D4CAD' }}>Pattern</Text>
          </Pressable>
        </View>
      </View>
    );
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
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>Pursuits</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a8a29e', marginTop: 1 }}>
            Formerly Self-Awareness Themes
          </Text>
        </View>
        <Pressable onPress={() => router.push('/prompt-theme/new')} style={{ padding: 4 }}>
          <Feather name="plus" size={22} color="#E85D2C" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 18, padding: 18, marginBottom: 20,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
        }}>
          <Pressable
            onPress={() => setInfoExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: infoExpanded ? 14 : 0 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1c1917' }}>How this works</Text>
            <Feather name={infoExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#c4b9b0" />
          </Pressable>

          {infoExpanded && (
            <>
              {HOW_IT_WORKS.map((step, i) => (
                <View key={step.title} style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: '#E85D2C',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Feather name={step.icon} size={14} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1c1917', marginBottom: 2 }}>
                      {step.title}
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#a8a29e', lineHeight: 18 }}>
                      {step.body}
                    </Text>
                  </View>
                </View>
              ))}
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a8a29e', lineHeight: 18, marginBottom: 16 }}>
                Two kinds of insight come out of it: a <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#1c1917' }}>Theme</Text> (what
                it's about — can show up after just one entry) and a <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#1c1917' }}>Pattern</Text> (when
                and how it recurs — needs a few logged over time).
              </Text>
              <Pressable
                onPress={() => setInfoExpanded(false)}
                style={{ backgroundColor: '#f7f4ef', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#78716c' }}>Got it</Text>
              </Pressable>
            </>
          )}
        </View>

        {themes.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>✍️</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#1c1917', marginBottom: 6, textAlign: 'center' }}>
              No pursuits yet
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              Pick a pursuit to explore, add a few prompts, and get nudged to write about it for a while.
            </Text>
            <Pressable
              onPress={() => router.push('/prompt-theme/new')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 26,
                shadowColor: '#E85D2C', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
              }}>
              <Feather name="plus" size={18} color="#ffffff" />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#ffffff' }}>Add your first pursuit</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {activeThemes.length > 0 && (
              <>
                {inactiveThemes.length > 0 && (
                  <Text style={{
                    fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
                    color: '#c4b9b0', marginBottom: 10,
                  }}>
                    Active
                  </Text>
                )}
                {activeThemes.map(theme => renderThemeCard(theme))}
              </>
            )}

            {inactiveThemes.length > 0 && (
              <>
                <Text style={{
                  fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase',
                  color: '#c4b9b0', marginBottom: 10, marginTop: activeThemes.length > 0 ? 8 : 0,
                }}>
                  Paused
                </Text>
                {inactiveThemes.map(theme => renderThemeCard(theme))}
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
    </WarmBackground>
  );
}
