import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { markPursuitIntroSeen } from '@/lib/pursuits';

const EXAMPLES = ['Why do I sabotage myself?', 'What do I actually want?', 'Why am I anxious on Sundays?'];

const STARTERS = [
  'Why do I sabotage myself?',
  'What do I actually want?',
  'What kind of person am I?',
  'Why do hard conversations feel so hard?',
];

const HOW_IT_WORKS = [
  { title: 'Name the question', body: 'The one you keep circling back to.' },
  { title: 'Write as you normally do', body: "No need to write about it. Wabii looks across everything you've written." },
  { title: 'See what comes up', body: "Patterns, how often, and how it's changing. It fills in as you write." },
];

// First time: what a pursuit is, how it works, then pick a question. After
// that, adding a pursuit goes straight to the last step (`?step=pick`).
export default function PursuitStartScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  const [chosen, setChosen] = useState<string | null>(null);
  const [writingOwn, setWritingOwn] = useState(false);
  const [ownText, setOwnText] = useState('');
  const [why, setWhy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const backArrow = (
    <Pressable onPress={() => router.back()} hitSlop={10} style={{ alignSelf: 'flex-start', padding: 4 }}>
      <Feather name="arrow-left" size={22} color="#374151" />
    </Pressable>
  );

  const nextButton = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>{label}</Text>
    </Pressable>
  );

  if (!step) {
    return (
      <WarmBackground>
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 40 }}>
          {backArrow}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <View style={{
                width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
              }}>
                <Feather name="compass" size={26} color={COLORS.primary} />
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, lineHeight: 32, color: '#1c1917', marginBottom: 10 }}>
                A pursuit is a question about you
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14.5, lineHeight: 22, color: '#78716c', marginBottom: 18 }}>
                Something you keep wondering about yourself, and want a real answer to.
              </Text>
            </Animated.View>
            {EXAMPLES.map((q, i) => (
              <Animated.View
                key={q}
                entering={FadeInDown.duration(400).delay(120 + i * 80)}
                style={{ backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#1c1917' }}>{q}</Text>
              </Animated.View>
            ))}
          </View>
          {nextButton('Next', () => router.push('/pursuit-start?step=how'))}
        </View>
      </WarmBackground>
    );
  }

  if (step === 'how') {
    return (
      <WarmBackground>
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 40 }}>
          {backArrow}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, lineHeight: 32, color: '#1c1917', marginBottom: 26 }}>
              Ask once. Keep writing.
            </Text>
            {HOW_IT_WORKS.map((s, i) => (
              <Animated.View
                key={s.title}
                entering={FadeInDown.duration(400).delay(100 + i * 100)}
                style={{ flexDirection: 'row', gap: 14, marginBottom: 22 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#FDE6DB', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#B8421A' }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15.5, color: '#1c1917', marginBottom: 2 }}>{s.title}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 20, color: '#78716c' }}>{s.body}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
          {nextButton('Next', () => router.push('/pursuit-start?step=pick'))}
        </View>
      </WarmBackground>
    );
  }

  const question = (writingOwn ? ownText : chosen ?? '').trim();
  const canAdd = question.length > 0 && !saving;

  async function addPursuit() {
    if (!canAdd) return;
    setSaving(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); setError('Please sign in again.'); return; }

    const { data, error: err } = await supabase
      .from('prompt_themes')
      .insert({ user_id: session.user.id, name: question, motivation: why.trim() || null, duration_days: null })
      .select('id')
      .single();
    if (err || !data) {
      setSaving(false);
      setError("Couldn't add that. Check your connection and try again.");
      return;
    }
    await markPursuitIntroSeen();
    router.replace(`/pursuit/${data.id}`);
  }

  return (
    <WarmBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 36 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {backArrow}
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 30, color: '#1c1917', marginTop: 16, marginBottom: 6 }}>
            What do you want to find out?
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 20, color: '#78716c', marginBottom: 16 }}>
            Pick one to start, or write your own.
          </Text>

          {STARTERS.map(q => {
            const selected = !writingOwn && chosen === q;
            return (
              <Pressable
                key={q}
                onPress={() => { setWritingOwn(false); setChosen(q); }}
                style={{
                  backgroundColor: selected ? '#FDE6DB' : '#ffffff',
                  borderWidth: 1.5, borderColor: selected ? COLORS.primary : 'transparent',
                  borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8,
                }}>
                <Text style={{ fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_400Regular', fontSize: 14.5, color: '#1c1917' }}>{q}</Text>
              </Pressable>
            );
          })}

          {writingOwn ? (
            <TextInput
              autoFocus
              value={ownText}
              onChangeText={setOwnText}
              placeholder="What do you want to find out?"
              placeholderTextColor="#c4b9b0"
              maxLength={140}
              multiline
              style={{
                backgroundColor: '#FDE6DB', borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 14,
                paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_500Medium', fontSize: 14.5, color: '#1c1917', minHeight: 48,
              }}
            />
          ) : (
            <Pressable
              onPress={() => { setWritingOwn(true); setChosen(null); }}
              style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#d6cdc3', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="edit-3" size={15} color="#a8a29e" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14.5, color: '#a8a29e' }}>Write your own</Text>
            </Pressable>
          )}

          {question.length > 0 && (
            <TextInput
              value={why}
              onChangeText={setWhy}
              placeholder="Why does this matter to you? (optional)"
              placeholderTextColor="#c4b9b0"
              multiline
              style={{
                backgroundColor: '#ffffff', borderRadius: 14, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12,
                fontFamily: 'Inter_400Regular', fontSize: 14, color: '#1c1917', minHeight: 64, textAlignVertical: 'top',
              }}
            />
          )}

          {error ? (
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444', marginTop: 12 }}>{error}</Text>
          ) : null}

          <View style={{ flex: 1, minHeight: 20 }} />
          <Pressable
            onPress={addPursuit}
            disabled={!canAdd}
            accessibilityRole="button"
            style={{ backgroundColor: canAdd ? COLORS.primary : '#e7e5e4', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 16 }}>
            {saving
              ? <ActivityIndicator color="white" />
              : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: canAdd ? '#ffffff' : '#a8a29e' }}>Add pursuit</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </WarmBackground>
  );
}
