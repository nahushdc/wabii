import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { PRIVACY_POLICY_URL, markPrivacyIntroSeen } from '@/lib/privacy-intro';

const PROMISES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'lock-closed-outline',
    title: 'Private to your account',
    body: 'Stored in your account, protected by your sign-in and an optional PIN lock.',
  },
  {
    icon: 'eye-off-outline',
    title: "AI doesn't know who you are",
    body: 'Your email and account details are never sent, only the words you write. The AI provider deletes them within 30 days and never uses them to train AI.',
  },
  {
    icon: 'hand-left-outline',
    title: 'Never sold',
    body: 'No ads, no data brokers. Nobody else sees your entries.',
  },
  {
    icon: 'trash-outline',
    title: "You're in control",
    body: 'Export everything or delete it all, any time.',
  },
];

// Shown once to new people before sign-up, and reachable any time from
// Profile (`?from=profile`), where it just goes back.
export default function PrivacyIntroScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromProfile = from === 'profile';

  async function done() {
    if (fromProfile) {
      router.back();
      return;
    }
    await markPrivacyIntroSeen();
    router.replace('/log-in');
  }

  return (
    <WarmBackground>
      {fromProfile && (
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ position: 'absolute', top: 64, left: 20, padding: 4, zIndex: 2 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
      )}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 96, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(450)} style={{ marginBottom: 18 }}>
          <View style={{
            width: 84, height: 84, borderRadius: 42, backgroundColor: '#ffffff',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
          }}>
            <Ionicons name="lock-closed" size={42} color={COLORS.primary} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(450).delay(80)}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 34, color: '#1c1917', marginBottom: 8 }}>
            Your journal is yours
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, color: '#78716c', marginBottom: 28 }}>
            Here's exactly what happens with what you write.
          </Text>
        </Animated.View>

        {PROMISES.map((p, i) => (
          <Animated.View
            key={p.title}
            entering={FadeInDown.duration(450).delay(180 + i * 90)}
            style={{ flexDirection: 'row', gap: 14, marginBottom: 22 }}>
            <Ionicons name={p.icon} size={22} color={COLORS.primary} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15.5, color: '#1c1917', marginBottom: 2 }}>{p.title}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 20, color: '#78716c' }}>{p.body}</Text>
            </View>
          </Animated.View>
        ))}

        <View style={{ flex: 1, minHeight: 16 }} />

        <Pressable
          onPress={done}
          accessibilityRole="button"
          style={{ backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Got it</Text>
        </Pressable>
        {PRIVACY_POLICY_URL ? (
          <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} hitSlop={10} style={{ alignSelf: 'center', paddingTop: 16 }}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#a8a29e' }}>Read our privacy policy</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </WarmBackground>
  );
}
