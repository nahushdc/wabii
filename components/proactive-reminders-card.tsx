import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const PROACTIVE_REMINDERS_FEATURE = 'proactive_reminders';

const NUDGE_STEPS: { icon: keyof typeof Feather.glyphMap; title: string; when: string }[] = [
  { icon: 'bell', title: 'Notification', when: 'At your reminder time' },
  { icon: 'message-circle', title: 'WhatsApp or iMessage', when: '15 min later, if you haven\'t journaled' },
  { icon: 'phone-call', title: 'Phone call', when: '15 min after that, if still nothing' },
];

// The "Pro · Coming soon" three-step nudge card, shared by Reminders and Streak.
export function ProactiveRemindersCard() {
  const [notifyRequested, setNotifyRequested] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('feature_interest')
          .select('id')
          .eq('user_id', user.id)
          .eq('feature', PROACTIVE_REMINDERS_FEATURE)
          .maybeSingle();
        setNotifyRequested(!!data);
      })();
    }, [])
  );

  async function handleNotifyMe() {
    if (notifyRequested || notifyLoading) return;
    setNotifyLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('feature_interest').insert({ user_id: user.id, feature: PROACTIVE_REMINDERS_FEATURE });
      setNotifyRequested(true);
    }
    setNotifyLoading(false);
  }

  return (
    <View style={{
      backgroundColor: '#2A2530', borderRadius: 18, padding: 20, marginBottom: 20,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: 'rgba(232, 93, 44, 0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
        }}>
          <Feather name="phone-call" size={11} color="#F5A889" />
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: '#F5A889' }}>
            Pro · Coming soon
          </Text>
        </View>
      </View>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 17, color: '#ffffff', marginBottom: 16, lineHeight: 23 }}>
        Proactive reminders
      </Text>

      {/* Three escalating nudges, drawn as a stepper */}
      <View style={{ marginBottom: 18 }}>
        {NUDGE_STEPS.map((step, i) => (
          <View key={step.title} style={{ flexDirection: 'row' }}>
            <View style={{ alignItems: 'center', marginRight: 14 }}>
              <View style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: 'rgba(232, 93, 44, 0.22)', alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name={step.icon} size={16} color="#F5A889" />
              </View>
              {i < NUDGE_STEPS.length - 1 && (
                <View style={{ width: 2, flex: 1, minHeight: 14, marginVertical: 4, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
              )}
            </View>
            <View style={{ flex: 1, paddingBottom: i < NUDGE_STEPS.length - 1 ? 14 : 0, justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: '#ffffff', lineHeight: 20 }}>
                {step.title}
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#c9c2ce', lineHeight: 18 }}>
                {step.when}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Pressable
        onPress={handleNotifyMe}
        disabled={notifyLoading}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: notifyRequested ? 'rgba(255,255,255,0.1)' : '#E85D2C',
          borderRadius: 12, paddingVertical: 12,
        }}>
        {notifyLoading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <>
            <Feather name={notifyRequested ? 'check' : 'bell'} size={15} color="#ffffff" />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#ffffff' }}>
              {notifyRequested ? "You're on the list" : 'Notify me'}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
