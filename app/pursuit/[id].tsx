import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { fetchPursuitOverview, PursuitOverview } from '@/lib/pursuits';

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function updatedLabel(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return 'updated today';
  return `updated ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

const SECTION_LABEL = {
  fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#a8a29e',
  marginTop: 22, marginBottom: 10,
} as const;

export default function PursuitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [overview, setOverview] = useState<PursuitOverview | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    fetchPursuitOverview(id)
      .then(setOverview)
      .catch(() => setFailed(true));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 8 }}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4 }}>
        <Feather name="arrow-left" size={22} color="#374151" />
      </Pressable>
      <Pressable onPress={() => router.push(`/prompt-theme/${id}`)} hitSlop={10} style={{ padding: 4 }} accessibilityLabel="Edit pursuit">
        <Feather name="edit-2" size={19} color="#78716c" />
      </Pressable>
    </View>
  );

  if (failed) {
    return (
      <WarmBackground>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#1c1917', marginBottom: 6, textAlign: 'center' }}>
            Couldn't load this pursuit
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, color: '#78716c', textAlign: 'center', marginBottom: 18 }}>
            Check your connection and try again.
          </Text>
          <Pressable onPress={() => { setOverview(null); load(); }} style={{ backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 11 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#ffffff' }}>Try again</Text>
          </Pressable>
        </View>
      </WarmBackground>
    );
  }

  if (!overview) {
    return (
      <WarmBackground>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, color: '#a8a29e', marginTop: 14 }}>
            Looking across your journal…
          </Text>
        </View>
      </WarmBackground>
    );
  }

  const { pursuit, total, weekly, patterns, entries, updated_at } = overview;
  const maxWeek = Math.max(1, ...weekly.map(w => w.count));
  const updated = updatedLabel(updated_at);

  return (
    <WarmBackground>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#a8a29e', marginTop: 8, marginBottom: 6 }}>
          Pursuit
        </Text>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 30, color: '#1c1917' }}>{pursuit.name}</Text>
        {pursuit.motivation ? (
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 20, color: '#78716c', marginTop: 8 }}>
            Your why: {pursuit.motivation}
          </Text>
        ) : null}
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a8a29e', marginTop: 8 }}>
          Found in {total} {total === 1 ? 'entry' : 'entries'}{updated ? ` · ${updated}` : ''}
        </Text>

        {patterns.length > 0 ? (
          <>
            <Text style={SECTION_LABEL}>What keeps showing up</Text>
            {patterns.map(p => (
              <View key={p.title} style={{ backgroundColor: '#ffffff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14.5, lineHeight: 20, color: '#1c1917' }}>{p.title}</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#78716c', marginTop: 3 }}>
                  {p.entry_count} entries{p.first_date && p.last_date ? ` · ${shortDate(p.first_date)} to ${shortDate(p.last_date)}` : ''}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <View style={{ backgroundColor: '#ffffff', borderRadius: 18, padding: 18, marginTop: 20 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: '#1c1917', marginBottom: 4 }}>
              {total === 0 ? "Nothing in your journal touches on this yet" : `Only ${total} ${total === 1 ? 'entry touches' : 'entries touch'} on this so far`}
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 20, color: '#78716c' }}>
              Patterns need a few more. Keep writing as you normally do, and anything related shows up here on its own.
            </Text>
          </View>
        )}

        {total > 0 && (
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 }}>
              {weekly.map(w => (
                <View
                  key={w.week_start}
                  style={{
                    flex: 1, borderRadius: 3,
                    height: w.count === 0 ? 3 : Math.max(8, (w.count / maxWeek) * 56),
                    backgroundColor: w.count === 0 ? '#ede8e0' : '#E85D2C',
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#a8a29e' }}>{weekly.length} weeks ago</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#a8a29e' }}>This week</Text>
            </View>
          </View>
        )}

        {entries.length > 0 && (
          <>
            <Text style={SECTION_LABEL}>Related entries</Text>
            {entries.map(e => (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/entry/${e.id}`)}
                style={{ backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: '#b07d4a', marginBottom: 3 }}>{shortDate(e.created_at)}</Text>
                <Text numberOfLines={3} style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 19, color: '#292524' }}>{e.snippet}</Text>
              </Pressable>
            ))}
          </>
        )}

        <Pressable
          onPress={() => router.push(`/(tabs)/new-entry?themeId=${pursuit.id}`)}
          style={{ backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 18 }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#ffffff' }}>Write about this</Text>
        </Pressable>
      </ScrollView>
    </WarmBackground>
  );
}
