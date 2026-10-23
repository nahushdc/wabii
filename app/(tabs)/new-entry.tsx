import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Keyboard, LayoutAnimation, UIManager, BackHandler } from 'react-native';

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
import { DictationNotice } from '@/components/dictation-notice';
import { posthog } from '@/lib/posthog';
import { consumeReminderAttribution } from '@/lib/reminder-attribution';
import { posthogLogs } from '@/lib/posthog-logs';
import { clearDraft, currentUserId, loadDraft, newEntryId, queueEntry, saveDraft, syncPendingEntries } from '@/lib/offline-entries';

// "today, 3:20 pm" / "yesterday, 9:14 pm" / "Mon, 9:14 pm"
function draftLabel(iso: string) {
  const when = new Date(iso);
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(when)) / 86400000);
  const day = days <= 0 ? 'today' : days === 1 ? 'yesterday' : when.toLocaleDateString('en-US', { weekday: 'short' });
  return `${day}, ${time}`;
}

function getTodayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

type Dictation = {
  isRecording: boolean;
  connecting: boolean;
  interimText: string;
  error: string;
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
  // While dictating, keep the newest words in view as the text grows.
  const dictationScrollRef = useRef<ScrollView>(null);
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
        <ScrollView
          ref={dictationScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 }}
          onContentSizeChange={() => dictationScrollRef.current?.scrollToEnd({ animated: false })}>
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
        {dictation.error ? (
          <View style={{ flex: 1, flexDirection: 'row', marginRight: 12 }}>
            <DictationNotice message={dictation.error} />
          </View>
        ) : !dictation.isRecording ? (
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#c4b9b0' }}>
            {`${wordCount} ${wordCount === 1 ? 'word' : 'words'}`}
          </Text>
        ) : null}
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
  // Whatever was being written is kept on the phone, so closing the app or
  // leaving this screen never loses it; saving clears it.
  const skipDraftRef = useRef(false);
  // The draft as it was loaded, so reopening the screen doesn't count as an
  // edit and keep pushing back the day it expires.
  const loadedDraftRef = useRef('');
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [clearedDraft, setClearedDraft] = useState<{ content: string; savedAt: string } | null>(null);
  useFocusEffect(
    useCallback(() => {
      skipDraftRef.current = false;
      loadedDraftRef.current = '';
      setDraftSavedAt(null);
      setClearedDraft(null);
      setError('');
      setContent(seed ? `${seed}\n\n` : '');
      setTags([]);
      setActiveThemeId(deepLinkThemeId ?? null);
      setPromptIndex(0);
      if (!seed) {
        loadDraft().then(draft => {
          if (!draft || skipDraftRef.current) return;
          loadedDraftRef.current = draft.content;
          setContent(draft.content);
          setDraftSavedAt(draft.savedAt);
        });
      }
    }, [seed, deepLinkThemeId])
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (!skipDraftRef.current && content !== loadedDraftRef.current) saveDraft(content);
    }, 600);
    return () => clearTimeout(t);
  }, [content]);

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

  // The latest text, readable after awaits (dictation lands a moment after stop).
  const contentRef = useRef(content);
  contentRef.current = content;

  // Leaving with something written just saves it as an entry; it can be
  // deleted from the entry afterwards. Leaving an empty page just leaves.
  const leaveRef = useRef<() => void>(() => {});
  leaveRef.current = async function leave() {
    if (loading) return;
    if (live.isRecording) {
      await live.stop();
      await new Promise(r => setTimeout(r, 60));
    }
    if (contentRef.current.trim()) await handleSave();
    else router.replace('/(tabs)');
  };
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => { leaveRef.current(); return true; });
      return () => sub.remove();
    }, [])
  );

  function startFresh() {
    setClearedDraft({ content, savedAt: draftSavedAt ?? new Date().toISOString() });
    skipDraftRef.current = false;
    loadedDraftRef.current = '';
    setContent('');
    setDraftSavedAt(null);
    clearDraft();
  }

  function undoStartFresh() {
    if (!clearedDraft) return;
    loadedDraftRef.current = '';
    setContent(clearedDraft.content);
    setDraftSavedAt(clearedDraft.savedAt);
    setClearedDraft(null);
  }

  async function handleSave() {
    setError('');
    const finalContent = contentRef.current.trim();
    if (!finalContent) { setError('Add something before saving.'); return; }
    setLoading(true);

    // The entry is written to the phone first, so it saves instantly and
    // survives having no signal; it uploads in the background.
    const userId = await currentUserId();
    if (!userId) { setError('Please sign in again to save.'); setLoading(false); return; }

    skipDraftRef.current = true;
    try {
      await queueEntry({
        id: newEntryId(),
        user_id: userId,
        content: finalContent,
        created_at: new Date().toISOString(),
        prompt_theme_id: activeThemeId,
        tags: tags.map(t => ({ name: t.name, category: t.category })),
      });
    } catch {
      skipDraftRef.current = false;
      setError("Couldn't save to this phone. Check that it has free storage and try again.");
      setLoading(false);
      return;
    }
    await clearDraft();
    syncPendingEntries();

    // Only after the entry is actually saved — cancel today's reminder(s)
    // for skip_if_journaled, not before, so a save that fails partway
    // through still leaves the reminder in place.
    cancelTodaysReminderOccurrencesIfJournaled();

    const wordCount = finalContent.split(/\s+/).length;
    const usedPrompt = Boolean(activeThemeId);
    posthog?.capture('journal_entry_created', {
      word_count: wordCount,
      tag_count: tags.length,
      used_prompt: usedPrompt,
      from_reminder: consumeReminderAttribution(),
    });
    posthogLogs.info('Journal entry saved', {
      word_count: wordCount,
      tag_count: tags.length,
      used_prompt: usedPrompt,
    });

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
        <Pressable onPress={() => leaveRef.current()} style={{ padding: 4 }}>
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

      {draftSavedAt && content.trim() ? (
        <View style={{
          marginHorizontal: 24, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
        }}>
          <Feather name="edit-2" size={14} color={COLORS.primary} />
          <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#57534e' }}>
            Draft from {draftLabel(draftSavedAt)}
          </Text>
          <Pressable onPress={startFresh} hitSlop={8}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: COLORS.primary }}>Start fresh</Text>
          </Pressable>
        </View>
      ) : clearedDraft && !content.trim() ? (
        <View style={{
          marginHorizontal: 24, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
        }}>
          <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#57534e' }}>Draft cleared</Text>
          <Pressable onPress={undoStartFresh} hitSlop={8}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: COLORS.primary }}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={{ marginHorizontal: 24, marginTop: 8, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
        </View>
      ) : null}

      <TextComposer
        content={content} setContent={setContent}
        tags={tags} setTags={setTags}
        activeThemeId={activeThemeId} setActiveThemeId={setActiveThemeId}
        nightThemeId={nightThemeId} prompts={prompts} promptIndex={promptIndex} setPromptIndex={setPromptIndex}
        dictation={{
          isRecording: live.isRecording, connecting: live.connecting, interimText: live.interimText, error: live.error,
          amplitude: live.amplitude, start: startDictation, stop: stopDictation, cancel: cancelDictation,
        }}
      />
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
