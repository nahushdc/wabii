import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

const STEPS: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
  { icon: 'compass', title: 'Name what you’re wondering about', body: 'Something you keep circling back to — like self-sabotage, or why hard conversations feel so hard.' },
  { icon: 'edit-3', title: 'Journal it as it comes up', body: 'No extra work — just write whenever something related crosses your mind.' },
  { icon: 'aperture', title: 'See the Theme', body: 'What it seems to be about — can surface from even one rich entry.' },
  { icon: 'bar-chart-2', title: 'Spot the Pattern', body: 'When and how it recurs — builds as you log more over time.' },
];

export default function PursuitsOnboardingScreen() {
  async function handleContinue() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // email is required if this upsert ever has to INSERT (no row yet for
      // this id) — a bare {id, pursuits_onboarding_seen} payload can't satisfy that.
      await supabase.from('users').upsert({ id: user.id, email: user.email, pursuits_onboarding_seen: true });
    }
    router.replace('/prompt-themes');
  }

  return (
    <WarmBackground>
      <LinearGradient
        colors={['rgba(232,93,44,0.2)', 'rgba(232,93,44,0)']}
        style={{ position: 'absolute', top: -70, right: -90, width: 240, height: 240, borderRadius: 120 }}
      />
      <LinearGradient
        colors={['rgba(109,76,173,0.16)', 'rgba(109,76,173,0)']}
        style={{ position: 'absolute', bottom: 40, left: -80, width: 220, height: 220, borderRadius: 110 }}
      />

      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 64 }}>
        <Pressable onPress={() => router.replace('/prompt-themes')} hitSlop={10} style={{ marginBottom: 24 }}>
          <Feather name="x" size={22} color="#1c1917" />
        </Pressable>

        <Animated.View entering={ZoomIn.duration(500).springify()} style={{ marginBottom: 20 }}>
          <LinearGradient
            colors={[COLORS.primaryLight, COLORS.primary]}
            style={{
              width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
              shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
            }}>
            <Feather name="compass" size={24} color="#ffffff" />
          </LinearGradient>
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(120).duration(500).springify()}
          style={{ fontFamily: 'Inter_700Bold', fontSize: 30, color: '#1c1917', marginBottom: 8, lineHeight: 36 }}>
          Understand yourself, one pursuit at a time.
        </Animated.Text>
        <Animated.Text
          entering={FadeInDown.delay(220).duration(500).springify()}
          style={{ fontFamily: 'Inter_400Regular', fontSize: 14.5, color: '#a8a29e', lineHeight: 21, marginBottom: 32 }}>
          A pursuit is a standing question about yourself worth exploring — and Wabii quietly builds insight into it as you write.
        </Animated.Text>

        {STEPS.map((step, i) => (
          <Animated.View
            key={step.title}
            entering={FadeInDown.delay(320 + i * 110).duration(450).springify()}
            style={{ flexDirection: 'row', gap: 14, marginBottom: i < STEPS.length - 1 ? 20 : 0 }}>
            <View style={{
              width: 34, height: 34, borderRadius: 17, backgroundColor: i >= 2 ? '#EFE6FB' : '#FDE6DB',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Feather name={step.icon} size={15} color={i >= 2 ? '#6D4CAD' : COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
                {step.title}
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#78716c', lineHeight: 18 }}>
                {step.body}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInUp.delay(850).duration(500).springify()} style={{ paddingHorizontal: 28, paddingBottom: 40 }}>
        <Pressable
          onPress={handleContinue}
          style={{
            backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 8,
            shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
          }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Start a pursuit</Text>
          <Feather name="arrow-right" size={16} color="#ffffff" />
        </Pressable>
      </Animated.View>
    </WarmBackground>
  );
}
