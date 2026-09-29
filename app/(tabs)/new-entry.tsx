import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Keyboard, LayoutAnimation, UIManager, Animated } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { supabase } from '@/lib/supabase';
import { TagPicker, SelectedTag } from '@/components/tag-picker';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { useLiveTranscription } from '@/hooks/use-live-transcription';
import { cancelTodaysReminderOccurrencesIfJournaled } from '@/lib/reminder-notifications';
import { Waveform } from '@/components/waveform';
import { AnimatedTranscript } from '@/components/animated-transcript';

type Mode = 'text' | 'voice';

function getTodayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ---------- Text mode ----------

function TextComposer({
  content, setContent, tags, setTags,
  activeThemeId, setActiveThemeId, nightThemeId, prompts, promptIndex, setPromptIndex,
}: {
  content: string; setContent: (v: string) => void;
  tags: SelectedTag[]; setTags: (v: SelectedTag[]) => void;
  activeThemeId: string | null; setActiveThemeId: (v: string | null) => void;
  nightThemeId: string | null; prompts: string[]; promptIndex: number; setPromptIndex: (fn: (i: number) => number) => void;
}) {
  const wordCount = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;

  return (
    <View style={{ flex: 1 }}>
      {/* Prompt mode */}
      {activeThemeId && prompts.length > 0 ? (
        <View style={{
          marginHorizontal: 24, marginTop: 12, backgroundColor: '#FDE6DB', borderRadius: 16,
          paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="edit-3" size={13} color={COLORS.primary} />
              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', color: COLORS.primary }}>
                Prompt
              </Text>
            </View>
            <Pressable onPress={() => setActiveThemeId(null)} hitSlop={8}>
              <Feather name="x" size={16} color={COLORS.primaryDark} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 16, fontFamily: 'Inter_500Medium', color: '#292524', lineHeight: 24, marginBottom: 10 }}>
            {prompts[promptIndex]}
          </Text>
          {prompts.length > 1 && (
            <Pressable
              onPress={() => setPromptIndex(i => (i + 1) % prompts.length)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: COLORS.primary }}>Next prompt</Text>
              <Feather name="arrow-right" size={12} color={COLORS.primary} />
            </Pressable>
          )}
        </View>
      ) : (
        !activeThemeId && nightThemeId && (
          <Pressable
            onPress={() => setActiveThemeId(nightThemeId)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
              marginHorizontal: 24, marginTop: 12,
              backgroundColor: '#f0ebe3', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
            }}>
            <Feather name="edit-3" size={13} color="#78716c" />
            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#78716c' }}>Use a prompt</Text>
          </Pressable>
        )
      )}

      {/* Writing area — a bounded, flex:1 multiline input handles its own
          internal scrolling natively, which correctly responds to drag
          gestures over the text and keeps the cursor in view while typing.
          An unbounded auto-growing TextInput inside an outer ScrollView
          can't be dragged to scroll once it fills the screen, since the
          drag gesture is captured by the TextInput for cursor placement
          instead of reaching the ScrollView. */}
      <TextInput
        style={{
          flex: 1,
          paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
          fontSize: 18, fontFamily: 'Inter_400Regular',
          color: '#1c1917', lineHeight: 30,
          textAlignVertical: 'top',
        }}
        placeholder="What's on your mind today?"
        placeholderTextColor="#c4b9b0"
        value={content}
        onChangeText={setContent}
        multiline
        autoFocus
      />

      <TagPicker selected={tags} onChange={setTags} />

      <View style={{ paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 }}>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#c4b9b0' }}>
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </Text>
      </View>
    </View>
  );
}

// ---------- Voice mode ----------

function VoiceComposer({ transcript, setTranscript }: { transcript: string; setTranscript: (v: string) => void }) {
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const player = useAudioPlayer(recordedUri ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);
  const { isRecording, connecting, interimText, error: liveError, durationMs, amplitude, finalWords, start, stop } = useLiveTranscription({
    onFinalTranscript: setTranscript,
  });
  const [error, setError] = useState('');
  const micScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(micScale, {
      toValue: isRecording ? 1 + Math.min(1, amplitude) * 0.18 : 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [amplitude, isRecording, micScale]);

  async function startRecording() {
    setError('');
    setRecordedUri(null);
    setTranscript('');
    await start();
  }

  async function stopRecording() {
    const result = await stop();
    if (!result?.fileUri) {
      setError('No audio was captured. Try recording again.');
      return;
    }
    setRecordedUri(result.fileUri);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24 }}>
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <Animated.View style={{ transform: [{ scale: micScale }] }}>
          <Pressable
            onPress={isRecording ? stopRecording : startRecording}
            disabled={connecting}
            style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: isRecording ? '#ef4444' : connecting ? '#e7e5e4' : COLORS.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
            }}>
            {connecting
              ? <ActivityIndicator color="#a8a29e" size="small" />
              : <Feather name={isRecording ? 'square' : 'mic'} size={34} color="#ffffff" />}
          </Pressable>
        </Animated.View>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#1c1917', marginTop: 16 }}>
          {connecting ? 'Connecting…' : isRecording ? formatDuration(durationMs) : recordedUri ? 'Recording ready' : 'Tap to record'}
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e', marginTop: 4, textAlign: 'center' }}>
          {isRecording
            ? 'Speak freely — your words appear below as you talk.'
            : recordedUri
            ? 'Play it back, re-record, or edit the transcript below.'
            : 'Record your thoughts out loud — transcribed live as you speak.'}
        </Text>
        {isRecording && (
          <View style={{ marginTop: 16 }}>
            <Waveform amplitude={amplitude} active={isRecording} color={COLORS.primary} />
          </View>
        )}
      </View>

      {recordedUri && !isRecording && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <Pressable
            onPress={() => {
              if (playerStatus.isLoaded && playerStatus.duration === 0) {
                setError('This recording has no audio in it, so it can\'t be played back.');
                return;
              }
              player.playing ? player.pause() : player.play();
            }}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 14,
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
            }}>
            <Feather name={player.playing ? 'pause' : 'play'} size={16} color="#1c1917" />
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#1c1917' }}>
              {player.playing ? 'Pause' : 'Play'}
            </Text>
          </Pressable>
          <Pressable
            onPress={startRecording}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 14,
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
            }}>
            <Feather name="rotate-ccw" size={16} color="#1c1917" />
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#1c1917' }}>Re-record</Text>
          </Pressable>
        </View>
      )}

      {(error || liveError) ? (
        <View style={{ backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error || liveError}</Text>
        </View>
      ) : null}

      {(transcript || interimText || isRecording) ? (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 8 }}>
            Transcript
          </Text>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, padding: 16, minHeight: 120,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            {isRecording ? (
              <AnimatedTranscript
                words={finalWords}
                interimText={interimText}
                style={{ fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24 }}
                interimStyle={{ color: '#a8a29e' }}
              />
            ) : (
              <TextInput
                style={{
                  fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917', lineHeight: 24,
                  textAlignVertical: 'top',
                }}
                value={transcript}
                onChangeText={setTranscript}
                multiline
              />
            )}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------- Mode switcher ----------

function ModeSwitcher({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const options: { id: Mode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { id: 'text', label: 'Text', icon: 'edit-3' },
    { id: 'voice', label: 'Voice', icon: 'mic' },
  ];

  useEffect(() => {
    // "Will" events fire alongside the keyboard's own slide animation and carry
    // its real duration/easing on iOS, so animating our layout off that event
    // (instead of "Did", which fires after the keyboard has already settled)
    // keeps our margin change in sync with the keyboard instead of jumping.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animateTo = (visible: boolean, duration?: number) => {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(duration || 250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
      );
      setKeyboardVisible(visible);
    };

    const showSub = Keyboard.addListener(showEvent, e => animateTo(true, e.duration));
    const hideSub = Keyboard.addListener(hideEvent, e => animateTo(false, e.duration));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: 24, marginTop: 8,
      // Idle (no keyboard), the floating tab bar + FAB sit under this — give
      // them clearance. Once the keyboard is up, that chrome is out of the
      // way, so hug the keyboard instead of leaving a dead gap above it.
      marginBottom: keyboardVisible ? 12 : 110,
    }}>
      <View style={{
        flex: 1, flexDirection: 'row',
        backgroundColor: '#ffffff', borderRadius: 18, padding: 6,
        shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
      }}>
        {options.map(opt => {
          const active = mode === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setMode(opt.id)}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: active ? COLORS.primary : 'transparent',
                borderRadius: 13, paddingVertical: 10,
              }}>
              <Feather name={opt.icon} size={14} color={active ? '#ffffff' : '#a8a29e'} />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: active ? '#ffffff' : '#a8a29e' }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {keyboardVisible && (
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          style={{
            width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
          }}>
          <Feather name="chevron-down" size={20} color="#78716c" />
        </Pressable>
      )}
    </View>
  );
}

// ---------- Screen ----------

export default function NewEntryScreen() {
  const { themeId: deepLinkThemeId, seed } = useLocalSearchParams<{ themeId?: string; seed?: string }>();
  const [mode, setMode] = useState<Mode>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Text mode state
  const [content, setContent] = useState(seed ? `${seed}\n\n` : '');
  const [tags, setTags] = useState<SelectedTag[]>([]);
  const [nightThemeId, setNightThemeId] = useState<string | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(deepLinkThemeId ?? null);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [promptIndex, setPromptIndex] = useState(0);

  // Voice mode state
  const [transcript, setTranscript] = useState('');

  // This screen lives inside the (tabs) navigator, which keeps tab screens
  // mounted across visits instead of unmounting them — so without this, the
  // previous entry's text/tags/transcript would still be sitting here the
  // next time this tab is opened. Reset on every focus instead.
  useFocusEffect(
    useCallback(() => {
      setMode('text');
      setError('');
      setContent(seed ? `${seed}\n\n` : '');
      setTags([]);
      setActiveThemeId(deepLinkThemeId ?? null);
      setPromptIndex(0);
      setTranscript('');
    }, [seed, deepLinkThemeId])
  );

  useEffect(() => {
    supabase
      .from('reminders')
      .select('prompt_theme_id')
      .not('prompt_theme_id', 'is', null)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setNightThemeId(data[0].prompt_theme_id);
      });
  }, []);

  useEffect(() => {
    if (!activeThemeId) { setPrompts([]); return; }
    supabase
      .from('theme_prompts')
      .select('prompt_text')
      .eq('theme_id', activeThemeId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setPrompts((data ?? []).map(p => p.prompt_text));
        setPromptIndex(0);
      });
  }, [activeThemeId]);

  function getSaveContent(): string {
    if (mode === 'text') return content.trim();
    return transcript.trim();
  }

  async function handleSave() {
    setError('');
    const finalContent = getSaveContent();
    if (!finalContent) { setError('Add something before saving.'); return; }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: entry, error: entryErr } = await supabase
      .from('journal_entries')
      .insert({ user_id: user!.id, content: finalContent, prompt_theme_id: mode === 'text' ? activeThemeId : null })
      .select('id')
      .single();

    if (entryErr || !entry) { setError(entryErr?.message ?? 'Failed to save.'); setLoading(false); return; }

    if (mode === 'text' && tags.length > 0) {
      for (const tag of tags) {
        const { data: tagRow, error: tagErr } = await supabase
          .from('tags')
          .upsert({ user_id: user!.id, name: tag.name, category: tag.category }, { onConflict: 'user_id,name' })
          .select('id')
          .single();
        if (tagErr || !tagRow) continue;
        await supabase.from('entry_tags').insert({ entry_id: entry.id, tag_id: tagRow.id });
      }
    }

    supabase.functions.invoke('embed-entry', {
      body: { entry_id: entry.id, content: finalContent },
    });

    // Only after the entry is actually saved — cancel today's reminder(s)
    // for skip_if_journaled, not before, so a save that fails partway
    // through still leaves the reminder in place.
    cancelTodaysReminderOccurrencesIfJournaled();

    setLoading(false);
    router.replace('/(tabs)');
  }

  const hasContent = getSaveContent().length > 0;

  return (
    <WarmBackground>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingTop: 64, paddingBottom: 12,
      }}>
        <Pressable onPress={() => router.replace('/(tabs)')} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color="#78716c" />
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={loading || !hasContent}
          style={{
            backgroundColor: hasContent ? COLORS.primary : '#e7e5e4',
            borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8,
          }}>
          {loading
            ? <ActivityIndicator color="white" size="small" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: hasContent ? '#ffffff' : '#a8a29e' }}>Save</Text>}
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 4 }}>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e' }}>
          {getTodayLabel()}
        </Text>
      </View>

      {error ? (
        <View style={{ marginHorizontal: 24, marginTop: 8, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
        </View>
      ) : null}

      {mode === 'text' && (
        <TextComposer
          content={content} setContent={setContent}
          tags={tags} setTags={setTags}
          activeThemeId={activeThemeId} setActiveThemeId={setActiveThemeId}
          nightThemeId={nightThemeId} prompts={prompts} promptIndex={promptIndex} setPromptIndex={setPromptIndex}
        />
      )}
      {mode === 'voice' && <VoiceComposer transcript={transcript} setTranscript={setTranscript} />}

      <ModeSwitcher mode={mode} setMode={setMode} />
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
