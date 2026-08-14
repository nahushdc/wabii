import { View, Text, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { WarmBackground } from '@/components/warm-background';

const OPTIONS: { icon: keyof typeof Feather.glyphMap; label: string; subtitle: string; subject: string }[] = [
  { icon: 'alert-triangle', label: 'Report an issue', subtitle: 'Something broken or not working right', subject: 'Bug report on Wabii' },
  { icon: 'message-square', label: 'Share feedback', subtitle: 'General thoughts on using the app', subject: 'Feedback on Wabii' },
  { icon: 'gift', label: 'Request a feature', subtitle: "Something you wish Wabii could do", subject: 'Feature request for Wabii' },
];

export default function HelpScreen() {
  function handleOption(subject: string) {
    Linking.openURL(`mailto:hello@wabii.app?subject=${encodeURIComponent(subject)}`);
  }

  return (
    <WarmBackground>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>Help</Text>
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {OPTIONS.map((opt, i) => (
          <Pressable
            key={opt.label}
            onPress={() => handleOption(opt.subject)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 12,
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
            }}>
            <View style={{
              width: 40, height: 40, borderRadius: 20, backgroundColor: '#E85D2C',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Feather name={opt.icon} size={17} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
                {opt.label}
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#a8a29e' }}>
                {opt.subtitle}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color="#d4cdc8" />
          </Pressable>
        ))}
      </View>
    </WarmBackground>
  );
}
