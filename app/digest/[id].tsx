import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type Digest = {
  id: string;
  content: string;
  week_start: string;
  rating: 'up' | 'down' | null;
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
        <Text style={{ fontSize: 18, lineHeight: 32, color: '#292524', letterSpacing: 0.1 }}>
          {digest.content}
        </Text>
      </ScrollView>

      {/* Rating */}
      <View className="flex-row items-center justify-center gap-3 mx-6 mb-10">
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
    </WarmBackground>
  );
}
