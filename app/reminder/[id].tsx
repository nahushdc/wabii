import { useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, TextInput, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

function timeToDate(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const SUGGESTED_MESSAGES = [
  "Hey, how was your day? 🌿",
  "Take a moment to reflect ✨",
  "What's on your mind today?",
  "Time to check in with yourself 💭",
];

type ThemeOption = { id: string; name: string };

export default function ReminderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [time, setTime] = useState(() => timeToDate(19, 0));
  const [showPicker, setShowPicker] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set(ALL_DAYS));
  const [skipIfJournaled, setSkipIfJournaled] = useState(true);
  const [customMessage, setCustomMessage] = useState('');
  const [themes, setThemes] = useState<ThemeOption[]>([]);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('prompt_themes').select('id, name').order('created_at', { ascending: false }).then(({ data }) => {
      setThemes(data ?? []);
    });
  }, []);

  useEffect(() => {
    if (isNew) return;
    async function fetchReminder() {
      const { data } = await supabase
        .from('reminders')
        .select('hour, minute, message, skip_if_journaled, days_of_week, prompt_theme_id')
        .eq('id', id)
        .single();
      if (data) {
        setTime(timeToDate(data.hour, data.minute ?? 0));
        setCustomMessage(data.message ?? '');
        setSkipIfJournaled(data.skip_if_journaled ?? true);
        setSelectedDays(new Set(data.days_of_week ?? ALL_DAYS));
        setThemeId(data.prompt_theme_id ?? null);
      }
      setLoading(false);
    }
    fetchReminder();
  }, [id]);

  function toggleDay(day: number) {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function handleSave() {
    if (selectedDays.size === 0) {
      setError('Pick at least one day.');
      return;
    }
    setError('');
    setSaving(true);
    const payload = {
      hour: time.getHours(),
      minute: time.getMinutes(),
      message: customMessage.trim() || null,
      skip_if_journaled: skipIfJournaled,
      days_of_week: Array.from(selectedDays).sort((a, b) => a - b),
      prompt_theme_id: themeId,
    };

    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('reminders').insert({ ...payload, user_id: user!.id, enabled: true });
    } else {
      await supabase.from('reminders').update(payload).eq('id', id);
    }
    setSaving(false);
    router.back();
  }

  function handleDelete() {
    Alert.alert('Delete reminder', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('reminders').delete().eq('id', id);
          router.back();
        },
      },
    ]);
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
            <Feather name="arrow-left" size={22} color="#374151" />
          </Pressable>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>
            {isNew ? 'New reminder' : 'Edit reminder'}
          </Text>
        </View>
        {!isNew && (
          <Pressable onPress={handleDelete} style={{ padding: 4 }}>
            <Feather name="trash-2" size={20} color="#ef4444" />
          </Pressable>
        )}
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {/* Time picker */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Remind me at
        </Text>
        <Pressable
          onPress={() => setShowPicker(v => !v)}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: showPicker ? 0 : 24,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="clock" size={18} color="#E85D2C" />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#1c1917' }}>{formatTime(time)}</Text>
          </View>
          <Feather name={showPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#a8a29e" />
        </Pressable>

        {showPicker && (
          <View style={{ backgroundColor: '#ffffff', borderRadius: 14, marginBottom: 24, paddingBottom: 8 }}>
            <DateTimePicker
              value={time}
              mode="time"
              display="spinner"
              onChange={(_, selected) => { if (selected) setTime(selected); }}
            />
            <Pressable
              onPress={() => setShowPicker(false)}
              style={{ alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 8 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#E85D2C' }}>Done</Text>
            </Pressable>
          </View>
        )}

        {/* Day picker */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          On these days
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {DAY_LABELS.map((label, day) => {
            const isSelected = selectedDays.has(day);
            return (
              <Pressable
                key={day}
                onPress={() => toggleDay(day)}
                style={{
                  flex: 1, aspectRatio: 1, borderRadius: 999,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSelected ? '#E85D2C' : '#ffffff',
                  borderWidth: 1.5, borderColor: isSelected ? '#E85D2C' : '#e7e5e4',
                }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: isSelected ? '#ffffff' : '#78716c' }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={{ marginBottom: 16, backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
          </View>
        ) : (
          <View style={{ marginBottom: 24 }} />
        )}

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
            onValueChange={setSkipIfJournaled}
            trackColor={{ false: '#e7e5e4', true: '#F5C7B0' }}
            thumbColor={skipIfJournaled ? '#E85D2C' : '#ffffff'}
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
          returnKeyType="done"
        />
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#b8b0a8', marginBottom: 10 }}>Suggestions:</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {SUGGESTED_MESSAGES.map(msg => (
            <Pressable
              key={msg}
              onPress={() => setCustomMessage(msg)}
              style={{
                backgroundColor: customMessage === msg ? '#FDE6DB' : '#f0ebe3',
                borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                borderWidth: 1, borderColor: customMessage === msg ? '#E85D2C' : 'transparent',
              }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: customMessage === msg ? '#E85D2C' : '#78716c' }}>
                {msg}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Prompt theme */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Prompt theme
        </Text>
        <Pressable
          onPress={() => setShowThemePicker(v => !v)}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: showThemePicker ? 0 : 28,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="edit-3" size={18} color="#E85D2C" />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917' }}>
              {themes.find(t => t.id === themeId)?.name ?? 'None'}
            </Text>
          </View>
          <Feather name={showThemePicker ? 'chevron-up' : 'chevron-down'} size={18} color="#a8a29e" />
        </Pressable>

        {showThemePicker && (
          <View style={{ backgroundColor: '#ffffff', borderRadius: 14, marginBottom: 28, paddingVertical: 6 }}>
            <Pressable
              onPress={() => { setThemeId(null); setShowThemePicker(false); }}
              style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: themeId === null ? '#E85D2C' : '#1c1917' }}>None</Text>
            </Pressable>
            {themes.map(t => (
              <Pressable
                key={t.id}
                onPress={() => { setThemeId(t.id); setShowThemePicker(false); }}
                style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: themeId === t.id ? '#E85D2C' : '#1c1917' }}>{t.name}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => { setShowThemePicker(false); router.push('/prompt-themes'); }}
              style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f5f0eb' }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#a8a29e' }}>Manage themes</Text>
            </Pressable>
          </View>
        )}

        {/* Save button */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 18,
            alignItems: 'center', justifyContent: 'center',
          }}>
          {saving
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Save reminder</Text>}
        </Pressable>
      </View>
    </ScrollView>
    </WarmBackground>
  );
}
