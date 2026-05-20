import { useState, useEffect } from 'react';
import { View, Text, Pressable, Switch, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const TIMES = [
  { label: 'Morning',   emoji: '🌅', time: '7:00 AM',  hour: 7  },
  { label: 'Afternoon', emoji: '☀️',  time: '1:00 PM',  hour: 13 },
  { label: 'Evening',   emoji: '🌇', time: '7:00 PM',  hour: 19 },
  { label: 'Night',     emoji: '🌙', time: '10:00 PM', hour: 22 },
];

const SUGGESTED_MESSAGES = [
  "Hey, how was your day? 🌿",
  "Take a moment to reflect ✨",
  "What's on your mind today?",
  "Time to check in with yourself 💭",
];

export default function NotificationsScreen() {
  const [enabled, setEnabled] = useState(false);
  const [selectedHour, setSelectedHour] = useState(19);
  const [skipIfJournaled, setSkipIfJournaled] = useState(true);
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchPrefs() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('notify_enabled, notify_hour, notify_message, notify_skip_if_journaled')
        .eq('id', user.id)
        .single();
      if (data) {
        setEnabled(data.notify_enabled ?? false);
        setSelectedHour(data.notify_hour ?? 19);
        setCustomMessage(data.notify_message ?? '');
        setSkipIfJournaled(data.notify_skip_if_journaled ?? true);
      }
      setLoading(false);
    }
    fetchPrefs();
  }, []);

  async function save(updates: Record<string, any>) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update(updates).eq('id', user.id);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf9f7' }}>
        <ActivityIndicator color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#faf9f7' }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: '#1c1917', flex: 1 }}>Notifications</Text>
        {saving && <ActivityIndicator size="small" color="#a8a29e" />}
      </View>

      <View style={{ paddingHorizontal: 24 }}>

        {/* Main toggle */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 24,
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>Daily reminder</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e' }}>Get nudged to write each day</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={v => { setEnabled(v); save({ notify_enabled: v }); }}
            trackColor={{ false: '#e7e5e4', true: '#c7d2fe' }}
            thumbColor={enabled ? '#4f46e5' : '#ffffff'}
          />
        </View>

        {enabled && (
          <>
            {/* Time picker */}
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
              Remind me at
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {TIMES.map(t => {
                const isSelected = selectedHour === t.hour;
                return (
                  <Pressable
                    key={t.hour}
                    onPress={() => { setSelectedHour(t.hour); save({ notify_hour: t.hour }); }}
                    style={{
                      flex: 1, minWidth: '45%',
                      backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                      borderRadius: 14, padding: 14,
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#4f46e5' : 'transparent',
                      shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                    }}>
                    <Text style={{ fontSize: 18, marginBottom: 4 }}>{t.emoji}</Text>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: isSelected ? '#4f46e5' : '#1c1917' }}>{t.label}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: isSelected ? '#818cf8' : '#a8a29e', marginTop: 1 }}>{t.time}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Smart: skip if already journaled */}
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
              Smart behaviour
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 24,
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
            }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1c1917', marginBottom: 2 }}>Skip if already journaled</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a8a29e', lineHeight: 18 }}>
                  No reminder on days you've already written an entry
                </Text>
              </View>
              <Switch
                value={skipIfJournaled}
                onValueChange={v => { setSkipIfJournaled(v); save({ notify_skip_if_journaled: v }); }}
                trackColor={{ false: '#e7e5e4', true: '#c7d2fe' }}
                thumbColor={skipIfJournaled ? '#4f46e5' : '#ffffff'}
              />
            </View>

            {/* Custom message */}
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
              Reminder message
            </Text>
            <TextInput
              style={{
                backgroundColor: '#ffffff', borderRadius: 14,
                paddingHorizontal: 16, paddingVertical: 14,
                fontFamily: 'Inter_400Regular', fontSize: 14, color: '#1c1917',
                marginBottom: 10,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
              }}
              placeholder="Write a custom reminder message…"
              placeholderTextColor="#c4b9b0"
              value={customMessage}
              onChangeText={setCustomMessage}
              onEndEditing={() => save({ notify_message: customMessage.trim() })}
              returnKeyType="done"
            />
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#b8b0a8', marginBottom: 10 }}>Suggestions:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {SUGGESTED_MESSAGES.map(msg => (
                <Pressable
                  key={msg}
                  onPress={() => { setCustomMessage(msg); save({ notify_message: msg }); }}
                  style={{
                    backgroundColor: customMessage === msg ? '#eef2ff' : '#f0ebe3',
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                    borderWidth: 1, borderColor: customMessage === msg ? '#4f46e5' : 'transparent',
                  }}>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: customMessage === msg ? '#4f46e5' : '#78716c' }}>
                    {msg}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
