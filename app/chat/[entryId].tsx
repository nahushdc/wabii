import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

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
    const text = input.trim();
    if (!text || sending) return;
    setError('');
    setInput('');
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

      {error ? (
        <View style={{ marginHorizontal: 20, marginBottom: 8, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
        </View>
      ) : null}

      {/* Input */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end',
          backgroundColor: '#ffffff', borderRadius: 20,
          paddingHorizontal: 16, paddingVertical: 8,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
          gap: 10,
        }}>
          <TextInput
            style={{ flex: 1, paddingVertical: 8, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917', maxHeight: 100 }}
            placeholder="What's coming up for you?"
            placeholderTextColor="#c4b9b0"
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || sending}
            style={{
              backgroundColor: input.trim() && !sending ? '#E85D2C' : '#e7e5e4',
              borderRadius: 10, padding: 8, marginBottom: 2,
            }}>
            <Feather name="arrow-up" size={16} color="white" />
          </Pressable>
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
