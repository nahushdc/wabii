import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';

export type DigestInsights = {
  moods: string[];
  new_patterns: string[];
  repeating_patterns: string[];
  attention_patterns: string[];
};

function PatternList({ title, icon, color, items }: { title: string; icon: keyof typeof Feather.glyphMap; color: string; items: string[] }) {
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
        <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6, paddingRight: 8 }}>
          <Text style={{ color, fontSize: 14, lineHeight: 20 }}>•</Text>
          <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: '#44403c' }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function DigestInsightsPanel({ insights }: { insights: DigestInsights | null | undefined }) {
  if (!insights) return null;
  const hasAnything = insights.moods.length || insights.new_patterns.length || insights.repeating_patterns.length || insights.attention_patterns.length;
  if (!hasAnything) return null;

  return (
    <View style={{
      backgroundColor: '#ffffff', borderRadius: 20, padding: 18, marginBottom: 24,
      shadowColor: '#1c1917', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    }}>
      {insights.moods.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: insights.new_patterns.length || insights.repeating_patterns.length || insights.attention_patterns.length ? 18 : 0 }}>
          {insights.moods.map((mood, i) => (
            <View key={i} style={{ backgroundColor: '#F6F1FB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6D4CAD' }}>{mood}</Text>
            </View>
          ))}
        </View>
      )}

      <PatternList title="New this period" icon="sunrise" color="#3F7A3F" items={insights.new_patterns} />
      <PatternList title="Still showing up" icon="repeat" color="#8a7a6f" items={insights.repeating_patterns} />
      <PatternList title="Worth noticing" icon="alert-circle" color="#C2410C" items={insights.attention_patterns} />
    </View>
  );
}
