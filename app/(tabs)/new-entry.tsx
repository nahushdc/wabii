import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Keyboard, LayoutAnimation, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import type { SharedValue } from 'react-native-reanimated';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { TagPicker, SelectedTag } from '@/components/tag-picker';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { useLiveTranscription } from '@/hooks/use-live-transcription';
import { cancelTodaysReminderOccurrencesIfJournaled } from '@/lib/reminder-notifications';
import { VoiceMicControl } from '@/components/voice-pulse';

function getTodayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

type Dictation = {
  isRecording: boolean;
  connecting: boolean;
  interimText: string;
  amplitude: SharedValue<number>;
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

// ---------- Text composer ----------

function TextComposer({
  content, setContent, tags, setTags,
  activeThemeId, setActiveThemeId, nightThemeId, prompts, promptIndex, setPromptIndex,
  dictation,
}: {
  content: string; setContent: (v: string) => void;
  tags: SelectedTag[]; setTags: (v: SelectedTag[]) => void;
  activeThemeId: string | null; setActiveThemeId: (v: string | null) => void;
  nightThemeId: string | null; prompts: string[]; promptIndex: number; setPromptIndex: (fn: (i: number) => number) => void;
  dictation: Dictation;
}) {
  const bottomInset = useBottomInset();
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
      {/* While dictating, content updates live from speech, so it's shown as
          read-only text instead of an editable field — editing it mid-dictation
          would fight with the incoming transcript. */}
      {dictation.isRecording ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 }}>
          <Text style={{ fontSize: 18, fontFamily: 'Inter_400Regular', color: '#1c1917', lineHeight: 30 }}>
            {content}
            {dictation.interimText ? <Text style={{ color: '#a8a29e' }}>{content && !/\s$/.test(content) ? ' ' : ''}{dictation.interimText}</Text> : null}
          </Text>
        </ScrollView>
      ) : (
        <TextInput
          style={{
            flex: 1,
            paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
            fontSize: 18, fontFamily: 'Inter_400Regular',
            color: '#1c1917', lineHeight: 30,
            textAlignVertical: 'top',
          }}
          placeholder="Say what you feel like"
          placeholderTextColor="#c4b9b0"
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
        />
      )}

      {!dictation.isRecording && <TagPicker selected={tags} onChange={setTags} />}

      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingTop: 8, marginBottom: bottomInset,
      }}>
        {!dictation.isRecording && (
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#c4b9b0' }}>
            {`${wordCount} ${wordCount === 1 ? 'word' : 'words'}`}
          </Text>
        )}
        <VoiceMicControl
          isRecording={dictation.isRecording}
          connecting={dictation.connecting}
          amplitude={dictation.amplitude}
          onStart={dictation.start}
          onStop={dictation.stop}
          onCancel={dictation.cancel}
        />
      </View>
    </View>
  );
}

// ---------- Keyboard-aware bottom inset ----------

// The tab bar and plus button are hidden on this page, so the composer only
// needs to clear the home indicator — and hugs the keyboard once it's up.
function useBottomInset() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

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

  return keyboardVisible ? 12 : 32;
}

// ---------- Screen ----------

export default function NewEntryScreen() {
  const { themeId: deepLinkThemeId, seed } = useLocalSearchParams<{ themeId?: string; seed?: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [content, setContent] = useState(seed ? `${seed}\n\n` : '');
  const [tags, setTags] = useState<SelectedTag[]>([]);
  const [nightThemeId, setNightThemeId] = useState<string | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(deepLinkThemeId ?? null);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [promptIndex, setPromptIndex] = useState(0);


  // Dictation appends speech onto whatever was already typed. `base` is the
  // text as it stood when recording started; each finalized phrase replaces
  // the session transcript, so base + transcript is always the full content.
  const dictationBaseRef = useRef('');
  const live = useLiveTranscription({
    onFinalTranscript: (sessionTranscript) => {
      const base = dictationBaseRef.current;
      const sep = base && sessionTranscript && !/\s$/.test(base) ? ' ' : '';
      setContent(`${base}${sep}${sessionTranscript}`);
    },
  });

  async function startDictation() {
    Keyboard.dismiss();
    dictationBaseRef.current = content;
    await live.start();
  }

  async function stopDictation() {
    await live.stop();
  }

  // Cancel throws away everything dictated this round, restoring the text as
  // it was when the mic was tapped.
  async function cancelDictation() {
    await live.stop();
    setContent(dictationBaseRef.current);
  }

  // This screen lives inside the (tabs) navigator, which keeps tab screens
  // mounted across visits instead of unmounting them — so without this, the
  // previous entry's text/tags/transcript would still be sitting here the
  // next time this tab is opened. Reset on every focus instead.
  useFocusEffect(
    useCallback(() => {
      setError('');
      setContent(seed ? `${seed}\n\n` : '');
      setTags([]);
      setActiveThemeId(deepLinkThemeId ?? null);
      setPromptIndex(0);
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

  // Leaving the screen (or tab) mid-dictation shouldn't leave the mic open.
  const liveRef = useRef(live);
  liveRef.current = live;
  useFocusEffect(
    useCallback(() => () => { if (liveRef.current.isRecording) liveRef.current.stop(); }, [])
  );

  async function handleSave() {
    setError('');
    const finalContent = content.trim();
    if (!finalContent) { setError('Add something before saving.'); return; }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: entry, error: entryErr } = await supabase
      .from('journal_entries')
      .insert({ user_id: user!.id, content: finalContent, prompt_theme_id: activeThemeId })
      .select('id')
      .single();

    if (entryErr || !entry) { setError(entryErr?.message ?? 'Failed to save.'); setLoading(false); return; }

    if (tags.length > 0) {
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

  const hasContent = content.trim().length > 0 && !live.isRecording;

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

      {(error || live.error) ? (
        <View style={{ marginHorizontal: 24, marginTop: 8, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error || live.error}</Text>
        </View>
      ) : null}

      <TextComposer
        content={content} setContent={setContent}
        tags={tags} setTags={setTags}
        activeThemeId={activeThemeId} setActiveThemeId={setActiveThemeId}
        nightThemeId={nightThemeId} prompts={prompts} promptIndex={promptIndex} setPromptIndex={setPromptIndex}
        dictation={{
          isRecording: live.isRecording, connecting: live.connecting, interimText: live.interimText,
          amplitude: live.amplitude, start: startDictation, stop: stopDictation, cancel: cancelDictation,
        }}
      />
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
