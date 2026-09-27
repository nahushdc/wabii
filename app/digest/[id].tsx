import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { DigestInsightsPanel, type DigestInsights } from '@/components/digest-insights';
import { BoldText } from '@/components/bold-text';

type Digest = {
  id: string;
  content: string;
  week_start: string;
  rating: 'up' | 'down' | null;
  seen_at: string | null;
  feedback_comment: string | null;
  insights: DigestInsights | null;
};

function formatWeek(dateStr: string) {
  const date = new Date(dateStr);
  const end = new Date(date);
  end.setDate(date.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${fmt(date)} – ${fmt(end)}`;
}

export default function DigestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [showFeedbackBox, setShowFeedbackBox] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    async function fetchDigest() {
      const { data, error } = await supabase
        .from('weekly_digests')
        .select('*')
        .eq('id', id)
        .single();
      if (error) console.log('Digest fetch error:', error.message);
      if (data) {
        setDigest(data);
        setRating(data.rating ?? null);
        if (!data.seen_at) {
          const { error: seenErr } = await supabase
            .from('weekly_digests')
            .update({ seen_at: new Date().toISOString() })
            .eq('id', id);
          if (seenErr) console.warn('Failed to mark digest seen:', seenErr.message);
        }
      }
      setLoading(false);
    }
    fetchDigest();
  }, [id]);

  async function handleRating(value: 'up' | 'down') {
    const newRating = rating === value ? null : value;
    setRating(newRating);
    setRatingLoading(true);
    await supabase
      .from('weekly_digests')
      .update({ rating: newRating })
      .eq('id', id);
    setRatingLoading(false);

    if (newRating === 'down') {
      setShowFeedbackBox(true);
    } else {
      setShowFeedbackBox(false);
    }
  }

  async function handleSendFeedback() {
    if (!feedbackComment.trim()) return;
    const { error } = await supabase
      .from('weekly_digests')
      .update({ feedback_comment: feedbackComment.trim() })
      .eq('id', id);
    if (error) { console.warn('Failed to save digest feedback:', error.message); return; }
    setFeedbackSent(true);
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  if (!digest) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a8a29e' }}>Reflection not found.</Text>
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
      {/* Header */}
      <View className="px-6 pt-16 pb-4">
        <Pressable onPress={() => router.back()} className="p-1 mb-6" style={{ alignSelf: 'flex-start' }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <View className="flex-row items-center gap-2 mb-1">
          <Text style={{ fontSize: 20 }}>🌿</Text>
          <Text className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#b07d4a' }}>Your Weekly Journey</Text>
        </View>
        <Text className="text-2xl font-bold mt-1" style={{ color: '#1c1917' }}>{formatWeek(digest.week_start)}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>
        <DigestInsightsPanel insights={digest.insights} />
        <BoldText text={digest.content} style={{ fontSize: 18, lineHeight: 32, color: '#292524', letterSpacing: 0.1 }} />
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Rating */}
        <View className="flex-row items-center justify-center gap-3 mx-6 mb-4">
          <Text className="text-xs" style={{ color: '#a8a29e' }}>Was this helpful?</Text>
          <Pressable
            onPress={() => handleRating('up')}
            disabled={ratingLoading}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: rating === 'up' ? '#dcfce7' : '#f3f4f6',
              borderWidth: 1.5,
              borderColor: rating === 'up' ? '#22c55e' : 'transparent',
            }}>
            <Text style={{ fontSize: 16 }}>👍</Text>
          </Pressable>
          <Pressable
            onPress={() => handleRating('down')}
            disabled={ratingLoading}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: rating === 'down' ? '#fee2e2' : '#f3f4f6',
              borderWidth: 1.5,
              borderColor: rating === 'down' ? '#ef4444' : 'transparent',
            }}>
            <Text style={{ fontSize: 16 }}>👎</Text>
          </Pressable>
        </View>

        {/* Downvote feedback */}
        {showFeedbackBox && !feedbackSent && (
          <View style={{
            marginHorizontal: 24, marginBottom: 24, backgroundColor: '#ffffff', borderRadius: 14, padding: 14,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1c1917', marginBottom: 8 }}>
              Sorry this one missed. What was off?
            </Text>
            <TextInput
              value={feedbackComment}
              onChangeText={setFeedbackComment}
              placeholder="e.g. didn't sound like me, missed what actually mattered this week…"
              placeholderTextColor="#c4b9b0"
              multiline
              style={{
                fontFamily: 'Inter_400Regular', fontSize: 13, color: '#292524', lineHeight: 18,
                backgroundColor: '#f7f4ef', borderRadius: 10, padding: 10, minHeight: 60, marginBottom: 10,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setShowFeedbackBox(false)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#a8a29e' }}>Skip</Text>
              </Pressable>
              <Pressable
                onPress={handleSendFeedback}
                disabled={!feedbackComment.trim()}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
                  backgroundColor: feedbackComment.trim() ? '#E85D2C' : '#e7e2da',
                }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#ffffff' }}>Send</Text>
              </Pressable>
            </View>
          </View>
        )}

        {feedbackSent && (
          <View style={{ marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Feather name="check-circle" size={13} color="#3F7A3F" />
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#3F7A3F' }}>Thanks — that helps.</Text>
          </View>
        )}

        {!showFeedbackBox && !feedbackSent && <View style={{ marginBottom: 10 }} />}
      </KeyboardAvoidingView>
    </WarmBackground>
  );
}
