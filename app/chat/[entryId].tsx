import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { useLiveTranscription } from '@/hooks/use-live-transcription';
import { LiveWaveform } from '@/components/voice-pulse';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

let tempIdCounter = 0;
function tempId() {
  return `temp-${Date.now()}-${tempIdCounter++}`;
}

export default function ChatScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const [entryDate, setEntryDate] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<FlatList>(null);

  // inputRef mirrors `input` so dictation callbacks (which can fire after a
  // render) always read the latest text.
  const inputRef = useRef('');
  function updateInput(value: string) {
    inputRef.current = value;
    setInput(value);
  }

  // Dictation appends speech onto whatever was already typed: `base` is the
  // text as it stood when the mic was tapped, and each finalized phrase
  // replaces the session transcript, so base + transcript is the full text.
  const dictationBaseRef = useRef('');
  const live = useLiveTranscription({
    onFinalTranscript: (sessionTranscript) => {
      const base = dictationBaseRef.current;
      const sep = base && sessionTranscript && !/\s$/.test(base) ? ' ' : '';
      updateInput(`${base}${sep}${sessionTranscript}`);
    },
  });

  async function startDictation() {
    Keyboard.dismiss();
    dictationBaseRef.current = inputRef.current;
    await live.start();
  }

  async function stopDictation() {
    await live.stop();
  }

  async function cancelDictation() {
    await live.stop();
    updateInput(dictationBaseRef.current);
  }

  async function sendDictation() {
    await live.stop();
    await handleSend();
  }

  // Leaving the screen mid-dictation shouldn't leave the mic open.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => () => { if (liveRef.current.isRecording) liveRef.current.stop(); }, []);

  useEffect(() => {
    async function load() {
      const { data: entry } = await supabase
        .from('journal_entries')
        .select('created_at')
        .eq('id', entryId)
        .single();
      if (entry) setEntryDate(entry.created_at);

      const { data: conversation } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('entry_id', entryId)
        .maybeSingle();

      if (conversation) {
        const { data: history } = await supabase
          .from('chat_messages')
          .select('id, role, content')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: true });
        if (history && history.length > 0) {
          setMessages(history as Message[]);
          setLoading(false);
          return;
        }
      }

      // No conversation yet, or it has no messages — get an opening reflection.
      const { data, error: err } = await supabase.functions.invoke('chat', {
        body: { entry_id: entryId },
      });
      if (!err && data?.reply) {
        setMessages([{ id: tempId(), role: 'assistant', content: data.reply }]);
      } else {
        setError('Could not start the conversation. Please try again.');
      }
      setLoading(false);
    }
    load();
  }, [entryId]);

  async function handleSend() {
    const text = inputRef.current.trim();
    if (!text || sending) return;
    setError('');
    updateInput('');
    setMessages(prev => [...prev, { id: tempId(), role: 'user', content: text }]);
    setSending(true);

    const { data, error: err } = await supabase.functions.invoke('chat', {
      body: { entry_id: entryId, message: text },
    });

    setSending(false);
    if (err || !data?.reply) {
      setError('Something went wrong sending that. Please try again.');
      return;
    }
    setMessages(prev => [...prev, { id: tempId(), role: 'assistant', content: data.reply }]);
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 24, paddingTop: 64, paddingBottom: 16,
      }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#78716c" />
        </Pressable>
        <View>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#1c1917' }}>
            Talk it through
          </Text>
          {entryDate && (
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a8a29e' }}>
              About your entry from {formatDate(entryDate)}
            </Text>
          )}
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={{
            alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
            backgroundColor: item.role === 'user' ? '#E85D2C' : '#f0ebe3',
            borderRadius: 18,
            paddingHorizontal: 16, paddingVertical: 12,
            maxWidth: '82%',
          }}>
            <Text style={{
              fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22,
              color: item.role === 'user' ? '#ffffff' : '#292524',
            }}>
              {item.content}
            </Text>
          </View>
        )}
        ListFooterComponent={sending ? (
          <View style={{
            alignSelf: 'flex-start', backgroundColor: '#f0ebe3', borderRadius: 18,
            paddingHorizontal: 16, paddingVertical: 12,
          }}>
            <ActivityIndicator size="small" color="#a8a29e" />
          </View>
        ) : null}
      />

      {(error || live.error) ? (
        <View style={{ marginHorizontal: 20, marginBottom: 8, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error || live.error}</Text>
        </View>
      ) : null}

      {/* Input — one rounded card: text on top, actions along the bottom.
          Idle: mic + send. While dictating: cancel, live waveform, stop
          (keep the text to edit) and send (stop and send straight away). */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 28,
          paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
        }}>
          {live.isRecording ? (
            <Text style={{
              fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 23, color: '#1c1917',
              minHeight: 46, maxHeight: 140,
            }}>
              {input}
              {live.interimText
                ? <Text style={{ color: '#a8a29e' }}>{input && !/\s$/.test(input) ? ' ' : ''}{live.interimText}</Text>
                : null}
              {!input && !live.interimText ? <Text style={{ color: '#c4b9b0' }}>Listening…</Text> : null}
            </Text>
          ) : (
            <TextInput
              style={{
                fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 23, color: '#1c1917',
                minHeight: 46, maxHeight: 140, paddingTop: 0, paddingBottom: 0,
              }}
              placeholder="What's coming up for you?"
              placeholderTextColor="#c4b9b0"
              value={input}
              onChangeText={updateInput}
              multiline
            />
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            {live.isRecording ? (
              <>
                <Pressable
                  onPress={cancelDictation}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel dictation"
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0ebe3', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={18} color="#57534e" />
                </Pressable>

                <View style={{ flex: 1, marginHorizontal: 4 }}>
                  <LiveWaveform amplitude={live.amplitude} />
                </View>

                <Pressable
                  onPress={stopDictation}
                  accessibilityRole="button"
                  accessibilityLabel="Stop recording"
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0ebe3', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: '#1c1917' }} />
                </Pressable>
                <Pressable
                  onPress={sendDictation}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel="Stop and send"
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="arrow-up" size={20} color="#ffffff" />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={startDictation}
                  disabled={live.connecting || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Dictate with your voice"
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0ebe3', alignItems: 'center', justifyContent: 'center' }}>
                  {live.connecting
                    ? <ActivityIndicator color="#a8a29e" size="small" />
                    : <Feather name="mic" size={19} color="#57534e" />}
                </Pressable>
                <Pressable
                  onPress={handleSend}
                  disabled={!input.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  style={{
                    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: input.trim() && !sending ? COLORS.primary : '#e7e5e4',
                  }}>
                  <Feather name="arrow-up" size={20} color="#ffffff" />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Disclaimer */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#c4b9b0', textAlign: 'center', lineHeight: 14 }}>
          Wabii is an AI companion, not a licensed therapist. In a crisis, please contact a professional or call 988.
        </Text>
      </View>
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
