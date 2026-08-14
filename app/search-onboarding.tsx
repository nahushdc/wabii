import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';

const TAGS: { icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { icon: 'help-circle', label: 'Ask a question.' },
  { icon: 'clock', label: "We'll find when it happened." },
  { icon: 'bar-chart-2', label: 'See the pattern.' },
];

export default function SearchOnboardingScreen() {
  function handleContinue() {
    router.replace('/search-overlay');
  }

  return (
    <WarmBackground>
      {/* Decorative gradient blobs — pure ambiance, no content */}
      <LinearGradient
        colors={['rgba(232,93,44,0.22)', 'rgba(232,93,44,0)']}
        style={{ position: 'absolute', top: -80, right: -100, width: 260, height: 260, borderRadius: 130 }}
      />
      <LinearGradient
        colors={['rgba(232,93,44,0.12)', 'rgba(232,93,44,0)']}
        style={{ position: 'absolute', bottom: 60, left: -90, width: 220, height: 220, borderRadius: 110 }}
      />

      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 72 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginBottom: 28 }}>
          <Feather name="x" size={22} color="#1c1917" />
        </Pressable>

        <Animated.View entering={ZoomIn.duration(500).springify()} style={{ marginBottom: 24 }}>
          <LinearGradient
            colors={[COLORS.primaryLight, COLORS.primary]}
            style={{
              width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
              shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
            }}>
            <Feather name="message-circle" size={26} color="#ffffff" />
          </LinearGradient>
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(150).duration(500).springify()}
          style={{ fontFamily: 'Inter_700Bold', fontSize: 32, color: '#1c1917', marginBottom: 10 }}>
          Just ask.
        </Animated.Text>
        <Animated.Text
          entering={FadeInDown.delay(250).duration(500).springify()}
          style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', lineHeight: 22, marginBottom: 44 }}>
          Type any question about yourself — we'll find exactly when it happened.
        </Animated.Text>

        {TAGS.map((tag, i) => (
          <Animated.View
            key={tag.label}
            entering={FadeInDown.delay(380 + i * 130).duration(500).springify()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: i < TAGS.length - 1 ? 32 : 0 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
            }}>
              <Feather name={tag.icon} size={16} color="#ffffff" />
            </View>
            <Text style={{ flex: 1, fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917', lineHeight: 28 }}>
              {tag.label}
            </Text>
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInUp.delay(750).duration(500).springify()} style={{ paddingHorizontal: 28, paddingBottom: 40 }}>
        <Pressable
          onPress={handleContinue}
          style={{
            backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 8,
            shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
          }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Ask something</Text>
          <Feather name="arrow-right" size={16} color="#ffffff" />
        </Pressable>
      </Animated.View>
    </WarmBackground>
  );
}
