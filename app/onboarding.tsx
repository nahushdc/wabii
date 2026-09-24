import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  ZoomIn, FadeInDown, FadeInUp,
  useSharedValue, useAnimatedStyle, withSequence, withTiming, withDelay,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { registerForPushNotifications } from '@/lib/notifications';
import { COLORS } from '@/constants/colors';
import { useLiveTranscription } from '@/hooks/use-live-transcription';
import { useSetOnboardingComplete } from './_layout';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Tappable starters, not exclusive categories — tapping one inserts that
// phrase into the open field rather than "selecting" it, so the field stays
// the source of truth and people can edit/extend from there.
const REASON_STARTERS = [
  "It's hard to sit with my emotions",
  'I want to understand myself better',
  "I'm going through something and need to process it",
  'I just want a place to vent',
  'My therapist recommended journaling',
];

const VALUE_PROPS = [
  { title: 'Get it out', description: 'Type it, talk it, or say it out loud.', chipBg: COLORS.primaryLight, haloBg: '#FBE3D3' },
  { title: 'Reflect with AI', description: 'Get insights on what you write.', chipBg: COLORS.primaryDark, haloBg: '#F4C7AC' },
  { title: 'A more self-aware you', description: 'The result of showing up.', chipBg: '#9A3412', haloBg: '#E9C2AA' },
] as const;

const INITIAL_REMINDERS = [
  { icon: 'sunrise', hour: 8, minute: 0, label: 'Morning reflection', message: 'Start your day with a little reflection ☀️' },
  { icon: 'sun', hour: 13, minute: 0, label: 'Midday pause', message: 'Take a moment to pause 🌿' },
  { icon: 'moon', hour: 21, minute: 0, label: 'Evening check-in', message: 'How was your day? 🌙' },
];

function WelcomeCTA({ onPress, label }: { onPress: () => void; label: string }) {
  // A single gentle settle after it arrives — not a repeating pulse, which
  // read as anxious/blinking rather than inviting.
  const scale = useSharedValue(0.97);

  useEffect(() => {
    scale.value = withDelay(950, withSequence(withTiming(1.02, { duration: 260 }), withTiming(1, { duration: 220 })));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInUp.delay(950).springify()} style={animatedStyle}>
      <Pressable
        onPress={onPress}
        style={{
          width: '100%', backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
          shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
        }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

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
  const isReasonsStep = step === 'reasons';
  const [loading, setLoading] = useState(false);
  const [finishingAction, setFinishingAction] = useState<'enable' | 'skip' | null>(null);
  const [name, setName] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [reasonsSaving, setReasonsSaving] = useState(false);
  const dictationBaseRef = useRef('');
  const { isRecording: isDictatingReason, connecting: reasonDictationConnecting, interimText: reasonInterimText, error: reasonDictationError, start: startReasonDictation, stop: stopReasonDictation } = useLiveTranscription({
    onFinalTranscript: (sessionTranscript) => {
      const base = dictationBaseRef.current;
      setReasonText(`${base}${base && sessionTranscript ? ' ' : ''}${sessionTranscript}`.trim());
    },
  });
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
    router.replace('/onboarding?step=reasons');
  }

  function insertReasonStarter(phrase: string) {
    setReasonText(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return phrase;
      const needsPeriod = !/[.!?]$/.test(trimmed);
      return `${trimmed}${needsPeriod ? '.' : ''} ${phrase}`;
    });
  }

  async function startReasonMic() {
    dictationBaseRef.current = reasonText;
    await startReasonDictation();
  }

  async function saveReasons() {
    const text = reasonText.trim();
    if (text) {
      setReasonsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('users').upsert({ id: user.id, signup_reason: text });
      }
      setReasonsSaving(false);
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

  async function finish(withReminders: boolean, withPermission: boolean, action: 'enable' | 'skip') {
    setLoading(true);
    setFinishingAction(action);

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
      const { error: upsertErr } = await supabase.from('users').upsert({ id: user.id, onboarding_complete: true });
      if (upsertErr) console.warn('Failed to persist onboarding_complete:', upsertErr.message);
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
      setFinishingAction(null);
      setOnboardingComplete(true);
      router.replace('/(tabs)');
    }
  }

  if (isValueStep) {
    return (
      <WarmBackground>
        {/* Soft ambient glow — sets a calmer, safer tone than a flat background */}
        <LinearGradient
          colors={['rgba(232,93,44,0.16)', 'rgba(232,93,44,0)']}
          style={{ position: 'absolute', top: -100, left: -80, width: 280, height: 280, borderRadius: 140 }}
        />
        <LinearGradient
          colors={['rgba(154,52,18,0.10)', 'rgba(154,52,18,0)']}
          style={{ position: 'absolute', bottom: -60, right: -100, width: 260, height: 260, borderRadius: 130 }}
        />

        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.Text
            entering={FadeInDown.delay(150).duration(450).springify()}
            style={{ fontFamily: 'Inter_700Bold', fontSize: 27, color: '#1c1917', marginBottom: 10, textAlign: 'center' }}>
            A place to think out loud
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(280).duration(450).springify()}
            style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#8a7a6f', textAlign: 'center', lineHeight: 23, marginBottom: 32 }}>
            Vent, rant, ramble, or reflect — however it comes out.
          </Animated.Text>

          <View style={{ marginBottom: 20 }}>
            {VALUE_PROPS.map((v, i) => (
              <Animated.View
                key={v.title}
                entering={FadeInDown.delay(450 + i * 150).duration(450).springify()}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: i < VALUE_PROPS.length - 1 ? 24 : 0 }}>
                <Animated.View
                  entering={ZoomIn.delay(550 + i * 150).duration(400).springify()}
                  style={{
                    width: 46, height: 46, borderRadius: 23, backgroundColor: v.haloBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: v.chipBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#ffffff' }}>{i + 1}</Text>
                  </View>
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>{v.title}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e', lineHeight: 19 }}>{v.description}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <WelcomeCTA onPress={() => router.push('/onboarding?step=name')} label="Come on in" />
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
          <Pressable onPress={() => router.replace('/onboarding?step=reasons')} disabled={loading}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#a8a29e' }}>Skip for now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </WarmBackground>
    );
  }

  if (isReasonsStep) {
    const canContinue = reasonText.trim().length > 0;
    return (
      <WarmBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1c1917', marginBottom: 10, textAlign: 'center' }}>
            What made you feel like you needed this, right now?
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#78716c', textAlign: 'center', lineHeight: 21, marginBottom: 20 }}>
            Whatever's true — type it, or tap the mic to say it out loud.
          </Text>

          {(reasonDictationError) ? (
            <View style={{ backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{reasonDictationError}</Text>
            </View>
          ) : null}

          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, padding: 16, minHeight: 130, marginBottom: 14,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            {isDictatingReason ? (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917', lineHeight: 24 }}>
                {reasonText}
                {reasonInterimText ? <Text style={{ color: '#a8a29e' }}>{reasonText ? ' ' : ''}{reasonInterimText}</Text> : null}
              </Text>
            ) : (
              <TextInput
                style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917', lineHeight: 24, minHeight: 70, textAlignVertical: 'top' }}
                placeholder="e.g. It's hard to sit with my emotions, and I don't have anyone to talk to about it."
                placeholderTextColor="#c4b9b0"
                value={reasonText}
                onChangeText={setReasonText}
                multiline
              />
            )}

            <Pressable
              onPress={isDictatingReason ? stopReasonDictation : startReasonMic}
              disabled={reasonDictationConnecting}
              style={{
                alignSelf: 'flex-end', marginTop: 8,
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: isDictatingReason ? '#ef4444' : reasonDictationConnecting ? '#e7e5e4' : '#f7f4ef',
                alignItems: 'center', justifyContent: 'center',
              }}>
              {reasonDictationConnecting
                ? <ActivityIndicator size="small" color="#a8a29e" />
                : <Feather name={isDictatingReason ? 'square' : 'mic'} size={17} color={isDictatingReason ? '#ffffff' : '#78716c'} />}
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {REASON_STARTERS.map(phrase => (
              <Pressable
                key={phrase}
                onPress={() => insertReasonStarter(phrase)}
                disabled={isDictatingReason}
                style={{
                  backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8,
                  shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
                }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12.5, color: '#78716c' }}>{phrase}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={saveReasons}
            disabled={reasonsSaving || !canContinue}
            style={{
              backgroundColor: canContinue ? COLORS.primary : '#e7e5e4',
              borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: 14, width: '100%',
            }}>
            {reasonsSaving
              ? <ActivityIndicator color="white" />
              : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Continue</Text>}
          </Pressable>
          <Pressable onPress={() => router.replace('/onboarding?step=welcome')} disabled={reasonsSaving} style={{ alignSelf: 'center' }}>
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
          onPress={() => finish(true, true, 'enable')}
          disabled={loading}
          style={{ backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', width: '100%' }}>
          {finishingAction === 'enable'
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Enable notifications</Text>}
        </Pressable>
        <Pressable
          onPress={() => finish(false, false, 'skip')}
          disabled={loading}
          style={{ paddingVertical: 14, paddingHorizontal: 24 }}>
          {finishingAction === 'skip'
            ? <ActivityIndicator size="small" color="#a8a29e" />
            : <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#a8a29e' }}>Not now</Text>}
        </Pressable>
      </View>
    </WarmBackground>
  );
}
