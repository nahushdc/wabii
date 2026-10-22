import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

type Notice = { icon: keyof typeof Feather.glyphMap; title: string; body: string };

// Turns a dictation error into a short, calm note: what's wrong, and what to do.
function describe(message: string): Notice {
  if (/connect|network|internet/i.test(message)) {
    return { icon: 'wifi-off', title: 'No internet', body: 'You can keep typing.' };
  }
  if (/stopped/i.test(message)) {
    return { icon: 'mic-off', title: 'Dictation stopped', body: 'Your text is saved. Tap the mic to continue.' };
  }
  if (/microphone/i.test(message)) {
    return { icon: 'mic-off', title: 'Microphone is off', body: 'Allow microphone access to dictate.' };
  }
  return { icon: 'alert-circle', title: "Dictation isn't working", body: message };
}

// A small card that sits beside the mic button, where the person just tapped.
export function DictationNotice({ message }: { message: string }) {
  if (!message) return null;
  const { icon, title, body } = describe(message);
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#ffffff', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9,
        shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 5, elevation: 2,
      }}>
      <Feather name={icon} size={19} color={COLORS.primary} />
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 16, color: '#1c1917' }}>{title}</Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 15, color: '#78716c' }}>{body}</Text>
      </View>
    </View>
  );
}
