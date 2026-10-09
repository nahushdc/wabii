import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

export type PatternEntry = { pattern: string; count: number };
export type DigestInsights = {
  moods: string[];
  new_patterns: string[];
  repeating_patterns: PatternEntry[];
  attention_patterns: PatternEntry[];
};

function PatternList({ title, icon, color, items, showCount }: {
  title: string; icon: keyof typeof Feather.glyphMap; color: string; items: PatternEntry[]; showCount?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Feather name={icon} size={13} color={color} />
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color }}>
          {title}
        </Text>
      </View>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, paddingRight: 8 }}>
          <Text style={{ color, fontSize: 14, lineHeight: 20 }}>•</Text>
          <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: '#44403c' }}>{item.pattern}</Text>
          {showCount && item.count > 1 && (
            <View style={{ backgroundColor: color + '1A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color }}>×{item.count}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// The pattern worth surfacing as a "deep dive" CTA: prefer the most
// persistent attention pattern, falling back to the most persistent
// repeating pattern. Null if there's nothing recurring enough to flag.
function topPattern(insights: DigestInsights): PatternEntry | null {
  const candidates = [...insights.attention_patterns, ...insights.repeating_patterns].sort((a, b) => b.count - a.count);
  return candidates[0] ?? null;
}

export function DigestInsightsPanel({ insights }: { insights: DigestInsights | null | undefined }) {
  if (!insights) return null;
  const newPatternEntries: PatternEntry[] = insights.new_patterns.map(pattern => ({ pattern, count: 1 }));
  const hasAnything = insights.moods.length || newPatternEntries.length || insights.repeating_patterns.length || insights.attention_patterns.length;
  if (!hasAnything) return null;

  const cta = topPattern(insights);

  return (
    <View style={{
      backgroundColor: '#ffffff', borderRadius: 20, padding: 18, marginBottom: 24,
      shadowColor: '#1c1917', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    }}>
      {insights.moods.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: newPatternEntries.length || insights.repeating_patterns.length || insights.attention_patterns.length ? 18 : 0 }}>
          {insights.moods.map((mood, i) => (
            <View key={i} style={{ backgroundColor: '#F6F1FB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6D4CAD' }}>{mood}</Text>
            </View>
          ))}
        </View>
      )}

      <PatternList title="New this period" icon="sunrise" color="#3F7A3F" items={newPatternEntries} />
      <PatternList title="Still showing up" icon="repeat" color="#8a7a6f" items={insights.repeating_patterns} showCount />
      <PatternList title="Worth noticing" icon="alert-circle" color="#C2410C" items={insights.attention_patterns} showCount />

      {cta && (
        // Visuals sit in a plain View via the children function — Pressable's
        // `style` function is dropped on device by NativeWind's interop.
        <Pressable
          onPress={() => router.push(`/(tabs)/new-entry?seed=${encodeURIComponent(`I want to sit with this a bit more: ${cta.pattern.toLowerCase()}. `)}`)}>
          {({ pressed }) => (
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? '#f5f0eb' : '#f7f4ef', borderRadius: 14, paddingVertical: 13, marginTop: 4,
            }}>
              <Feather name="compass" size={14} color="#78716c" style={{ marginRight: 8 }} />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#44403c' }}>
                Deep dive into "{cta.pattern}"
              </Text>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}
