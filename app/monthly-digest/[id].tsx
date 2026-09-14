import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { DigestInsightsPanel, type DigestInsights } from '@/components/digest-insights';
import { BoldText } from '@/components/bold-text';

type MonthlyDigest = {
  id: string;
  content: string;
  month_start: string;
  rating: 'up' | 'down' | null;
  seen_at: string | null;
  feedback_comment: string | null;
  insights: DigestInsights | null;
};

function formatMonth(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

type ReflectionSection = { title: string | null; paragraphs: string[] };

function parseReflectionSections(content: string): ReflectionSection[] {
  const sections: ReflectionSection[] = [];
  let current: ReflectionSection = { title: null, paragraphs: [] };

  for (const block of content.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean)) {
    if (block.startsWith('## ')) {
      if (current.title || current.paragraphs.length) sections.push(current);
      current = { title: block.slice(3).trim(), paragraphs: [] };
    } else {
      current.paragraphs.push(block);
    }
  }
  if (current.title || current.paragraphs.length) sections.push(current);
  return sections;
}

function sectionStyle(title: string | null) {
  if (title?.toLowerCase().includes('pattern')) return { icon: 'repeat' as const, color: '#6D4CAD', background: '#F3EDFC' };
  if (title?.toLowerCase().includes('pursuit')) return { icon: 'compass' as const, color: '#C2410C', background: '#FDE6DB' };
  return { icon: 'sun' as const, color: '#B07A37', background: '#FDF1D7' };
}

export default function MonthlyDigestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [digest, setDigest] = useState<MonthlyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [showFeedbackBox, setShowFeedbackBox] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    async function fetchDigest() {
      const { data, error } = await supabase
        .from('monthly_digests')
        .select('*')
        .eq('id', id)
        .single();
      if (error) console.log('Monthly digest fetch error:', error.message);
      if (data) {
        setDigest(data);
        setRating(data.rating ?? null);
        if (!data.seen_at) {
          const { error: seenErr } = await supabase
            .from('monthly_digests')
            .update({ seen_at: new Date().toISOString() })
            .eq('id', id);
          if (seenErr) console.warn('Failed to mark monthly digest seen:', seenErr.message);
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
      .from('monthly_digests')
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
      .from('monthly_digests')
      .update({ feedback_comment: feedbackComment.trim() })
      .eq('id', id);
    if (error) { console.warn('Failed to save monthly digest feedback:', error.message); return; }
    setFeedbackSent(true);
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6D4CAD" />
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

  const sections = parseReflectionSections(digest.content);

  return (
    <WarmBackground>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 14 }}>
        <Pressable onPress={() => router.back()} style={{ alignSelf: 'flex-start', padding: 5, marginBottom: 17 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 }}>
          <View style={{ width: 35, height: 35, borderRadius: 18, backgroundColor: '#E5D8F5', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>🌙</Text>
          </View>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: '#6D4CAD' }}>
            Your monthly reflection
          </Text>
        </View>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 37, color: '#1c1917' }}>{formatMonth(digest.month_start)}</Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, color: '#78716c', marginTop: 7 }}>
          A gentle look at what this month held for you.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 42 }}>
        <DigestInsightsPanel insights={digest.insights} />
        <View style={{ backgroundColor: '#FFFCF8', borderRadius: 24, paddingHorizontal: 20, paddingTop: 21, paddingBottom: 8, borderWidth: 1, borderColor: '#E8E0D7' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 19 }}>
            <Feather name="coffee" size={14} color="#B07A37" />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#8a7a6f' }}>
              Take your time with this one
            </Text>
          </View>
          {sections.map((section, sectionIndex) => {
            const style = sectionStyle(section.title);
            const isPatterns = section.title?.toLowerCase().includes('pattern');
            return (
              <View key={`${sectionIndex}-${section.title ?? 'reflection'}`}>
                {sectionIndex > 0 && <View style={{ height: 1, backgroundColor: '#EEE7DE', marginBottom: 22 }} />}
                {section.title && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 }}>
                    <View style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: style.background, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={style.icon} size={13} color={style.color} />
                    </View>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: style.color, letterSpacing: 0.2 }}>
                      {section.title}
                    </Text>
                  </View>
                )}
                {section.paragraphs.map((paragraph, paragraphIndex) => {
                  const isBullet = paragraph.startsWith('•') || paragraph.startsWith('- ');
                  const body = isBullet ? paragraph.replace(/^[•-]\s*/, '') : paragraph;
                  const leadParagraph = sectionIndex === 0 && paragraphIndex === 0;
                  return (
                    <View key={`${paragraphIndex}-${body.slice(0, 16)}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingBottom: 22 }}>
                      <View style={{ width: isBullet ? 8 : 7, height: isBullet ? 8 : 7, borderRadius: 4, marginTop: leadParagraph ? 10 : 8, backgroundColor: leadParagraph ? '#6D4CAD' : (isPatterns ? '#6D4CAD' : '#D9C8B6') }} />
                      <BoldText
                        text={body}
                        style={{ flex: 1, fontFamily: leadParagraph ? 'Inter_500Medium' : 'Inter_400Regular', fontSize: leadParagraph ? 19 : 16.5, lineHeight: leadParagraph ? 29 : 27, color: '#292524', letterSpacing: 0.05 }}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}
          <View style={{ height: 1, backgroundColor: '#EEE7DE', marginBottom: 16 }} />
          <View style={{ alignItems: 'center', paddingBottom: 12 }}>
            <Text style={{ fontSize: 17 }}>✦</Text>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#8a7a6f', marginTop: 5 }}>
              Keep what resonates. Leave the rest.
            </Text>
          </View>
        </View>
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Rating */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginHorizontal: 24, marginBottom: 13 }}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#8a7a6f' }}>Did this feel true to your month?</Text>
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
              placeholder="e.g. didn't sound like me, missed what actually mattered this month…"
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
                  backgroundColor: feedbackComment.trim() ? '#6D4CAD' : '#e7e2da',
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
