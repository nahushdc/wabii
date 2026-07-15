import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { registerForPushNotifications } from '@/lib/notifications';
import { COLORS } from '@/constants/colors';
import { useSetOnboardingComplete } from './_layout';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const VALUE_PROPS = [
  { icon: 'book-open', title: 'Journal', description: 'Write freely, anytime.', chipBg: COLORS.primaryLight },
  { icon: 'message-circle', title: 'Reflect with AI', description: 'Get insights on what you write.', chipBg: COLORS.primaryDark },
  { icon: 'zap', title: 'A more self-aware you', description: 'The result of showing up.', chipBg: '#9A3412' },
] as const;

const INITIAL_REMINDERS = [
  { icon: 'sunrise', hour: 8, minute: 0, label: 'Morning reflection', message: 'Start your day with a little reflection ☀️' },
  { icon: 'sun', hour: 13, minute: 0, label: 'Midday pause', message: 'Take a moment to pause 🌿' },
  { icon: 'moon', hour: 21, minute: 0, label: 'Evening check-in', message: 'How was your day? 🌙' },
];

function timeToDate(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function OnboardingScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  const isValueStep = !step;
  const isNameStep = step === 'name';
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [reminders, setReminders] = useState(() => INITIAL_REMINDERS.map(r => ({ ...r })));
  const [selectedReminders, setSelectedReminders] = useState<Set<number>>(new Set([0, 1, 2]));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const setOnboardingComplete = useSetOnboardingComplete();

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed) {
      setLoading(true);
      await supabase.auth.updateUser({ data: { full_name: trimmed } });
      setLoading(false);
    }
    router.replace('/onboarding?step=welcome');
  }

  function toggleReminder(index: number) {
    setSelectedReminders(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function setReminderTime(index: number, time: Date) {
    setReminders(prev => prev.map((r, i) => (i === index ? { ...r, hour: time.getHours(), minute: time.getMinutes() } : r)));
  }

  async function finish(withReminders: boolean, withPermission: boolean) {
    setLoading(true);

    const save = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (withReminders && selectedReminders.size > 0) {
        const rows = Array.from(selectedReminders).map(i => {
          const r = reminders[i];
          return {
            user_id: user.id,
            hour: r.hour,
            minute: r.minute,
            message: r.message,
            skip_if_journaled: true,
            days_of_week: ALL_DAYS,
            enabled: true,
          };
        });
        await supabase.from('reminders').insert(rows);
      }
      await supabase.from('users').upsert({ id: user.id, onboarding_complete: true });
      // Push permission involves a native prompt the user may not respond to
      // right away — don't block finishing onboarding on it.
      if (withPermission) registerForPushNotifications(user.id);
    };

    try {
      // However this fails or however long it takes, onboarding must not get
      // stuck — cap the wait and move on regardless.
      const timeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000));
      await Promise.race([save(), timeout]);
    } catch (e) {
      console.log('Onboarding finish error:', e);
    } finally {
      setLoading(false);
      setOnboardingComplete(true);
      router.replace('/(tabs)');
    }
  }

  if (isValueStep) {
    return (
      <WarmBackground>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 34, color: COLORS.primary, textAlign: 'center', marginBottom: 24 }}>
            Wabii
          </Text>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 27, color: '#1c1917', marginBottom: 10, textAlign: 'center' }}>
            Get to know yourself
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#8a7a6f', textAlign: 'center', lineHeight: 23, marginBottom: 32 }}>
            Wabii helps you build real self-awareness, one small habit at a time.
          </Text>

          <View style={{ marginBottom: 20 }}>
            {VALUE_PROPS.map(v => (
              <View key={v.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                <View style={{
                  width: 42, height: 42, borderRadius: 21, backgroundColor: v.chipBg,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name={v.icon} size={19} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>{v.title}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e', lineHeight: 19 }}>{v.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => router.push('/onboarding?step=name')}
            style={{
              width: '100%', backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
            }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Get started</Text>
          </Pressable>
        </View>
      </WarmBackground>
    );
  }

  if (isNameStep) {
    return (
      <WarmBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 20 }}>👋</Text>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: '#1c1917', marginBottom: 12, textAlign: 'center' }}>
            What should we call you?
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#78716c', textAlign: 'center', lineHeight: 23, marginBottom: 32 }}>
            We'll use this to personalize your experience.
          </Text>
          <TextInput
            style={{
              backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
              fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917', width: '100%', marginBottom: 20,
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
            }}
            placeholder="Your name"
            placeholderTextColor="#c4b9b0"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveName}
          />
          <Pressable
            onPress={saveName}
            disabled={loading || !name.trim()}
            style={{
              backgroundColor: name.trim() ? COLORS.primary : '#e7e5e4',
              borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 14, width: '100%',
            }}>
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Continue</Text>}
          </Pressable>
          <Pressable onPress={() => router.replace('/onboarding?step=welcome')} disabled={loading}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#a8a29e' }}>Skip for now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 44, marginBottom: 16 }}>🌿</Text>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1c1917', marginBottom: 10, textAlign: 'center' }}>
          Build the habit
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#78716c', textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
          Pick the times that fit your day. Tap any to adjust it, or remove ones you don't need.
        </Text>

        <View style={{ width: '100%', marginBottom: 24 }}>
          {reminders.map((r, i) => {
            const selected = selectedReminders.has(i);
            const isEditing = editingIndex === i;
            return (
              <Pressable
                key={r.label}
                onPress={() => toggleReminder(i)}
                style={{
                  backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 10,
                  shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18, backgroundColor: '#FDE6DB',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Feather name={r.icon as any} size={16} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1c1917', marginBottom: 2 }}>{r.label}</Text>
                      <Pressable
                        onPress={() => setEditingIndex(isEditing ? null : i)}
                        hitSlop={6}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.primary }}>
                          {formatTime(timeToDate(r.hour, r.minute))}
                        </Text>
                        <Feather name="edit-2" size={10} color={COLORS.primary} />
                      </Pressable>
                    </View>
                  </View>
                  <View
                    style={{
                      width: 22, height: 22, borderRadius: 7,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selected ? COLORS.primary : 'transparent',
                      borderWidth: 1.5, borderColor: selected ? COLORS.primary : '#d6d0c8',
                    }}>
                    {selected && <Feather name="check" size={13} color="#ffffff" />}
                  </View>
                </View>

                {isEditing && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f5f0eb', paddingBottom: 8 }}>
                    <DateTimePicker
                      value={timeToDate(r.hour, r.minute)}
                      mode="time"
                      display="spinner"
                      themeVariant="light"
                      textColor="#1c1917"
                      onChange={(_, selected) => { if (selected) setReminderTime(i, selected); }}
                    />
                    <Pressable
                      onPress={() => setEditingIndex(null)}
                      style={{ alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 8 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.primary }}>Done</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => finish(true, true)}
          disabled={loading}
          style={{ backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 14, width: '100%' }}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Enable notifications</Text>}
        </Pressable>
        <Pressable onPress={() => finish(false, false)} disabled={loading}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#a8a29e' }}>Not now</Text>
        </Pressable>
      </View>
    </WarmBackground>
  );
}
