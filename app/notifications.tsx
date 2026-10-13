import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, ScrollView, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { ReliableSwitch } from '@/components/reliable-switch';
import { ProactiveRemindersCard } from '@/components/proactive-reminders-card';
import { registerForPushNotifications } from '@/lib/notifications';
import { scheduleReminderOccurrences, cancelAllForReminder } from '@/lib/reminder-notifications';

type Reminder = {
  id: string;
  hour: number;
  minute: number;
  message: string | null;
  skip_if_journaled: boolean;
  enabled: boolean;
  days_of_week: number[];
};

function formatTime(hour: number, minute: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute.toString().padStart(2, '0')} ${period}`;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

function formatDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && WEEKDAYS.every(d => sorted.includes(d))) return 'Weekdays';
  if (sorted.length === 2 && WEEKEND.every(d => sorted.includes(d))) return 'Weekends';
  return sorted.map(d => DAY_ABBR[d]).join(', ');
}


export default function NotificationsScreen() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  // null while unknown/checking, so the banner doesn't flash on before we know.
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  const [hasPushToken, setHasPushToken] = useState<boolean | null>(null);
  const [pushEnabling, setPushEnabling] = useState(false);
  const [pushError, setPushError] = useState('');

  async function checkPushStatus() {
    const { status } = await Notifications.getPermissionsAsync();
    setPushStatus(status as 'granted' | 'denied' | 'undetermined');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('users').select('push_token').eq('id', user.id).single();
    setHasPushToken(!!data?.push_token);
  }

  async function handleEnablePush() {
    if (pushEnabling) return;
    if (pushStatus === 'denied') {
      // requestPermissionsAsync won't re-prompt once denied — only the OS
      // settings screen can flip it back.
      Linking.openSettings();
      return;
    }
    setPushEnabling(true);
    setPushError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const result = await registerForPushNotifications(user.id);
      if (!result.success) setPushError(result.error);
    }
    await checkPushStatus();
    setPushEnabling(false);
  }

  async function fetchReminders() {
    const { data } = await supabase
      .from('reminders')
      .select('id, hour, minute, message, skip_if_journaled, enabled, days_of_week')
      .order('hour', { ascending: true })
      .order('minute', { ascending: true });
    setReminders(data ?? []);
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([fetchReminders(), checkPushStatus()]).finally(() => setLoading(false));
    }, [])
  );

  async function toggleEnabled(reminder: Reminder, value: boolean) {
    setReminders(prev => prev.map(r => (r.id === reminder.id ? { ...r, enabled: value } : r)));
    await supabase.from('reminders').update({ enabled: value }).eq('id', reminder.id);
    await scheduleReminderOccurrences({ ...reminder, enabled: value });
  }

  function handleDelete(reminder: Reminder) {
    Alert.alert('Delete reminder', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('reminders').delete().eq('id', reminder.id);
          await cancelAllForReminder(reminder.id);
          setReminders(prev => prev.filter(r => r.id !== reminder.id));
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
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917', flex: 1 }}>Reminders</Text>
        <Pressable onPress={() => router.push('/reminder/new')} style={{ padding: 4 }}>
          <Feather name="plus" size={22} color="#E85D2C" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {(pushStatus === 'denied' || pushStatus === 'undetermined' || (pushStatus === 'granted' && hasPushToken === false)) && (
          <View style={{ marginBottom: 16 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: '#fff1f0', borderRadius: 16, padding: 16,
            }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="bell-off" size={15} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1c1917', marginBottom: 2 }}>
                  Notifications aren't enabled
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#78716c', lineHeight: 17 }}>
                  {pushStatus === 'denied'
                    ? "You'll need to turn this on in Settings for reminders to reach you."
                    : pushStatus === 'granted'
                    ? "Permission's on, but we couldn't save your device — tap to retry."
                    : "Reminders below won't reach you until this is on."}
                </Text>
              </View>
              <Pressable
                onPress={handleEnablePush}
                disabled={pushEnabling}
                style={{ backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                {pushEnabling
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#ffffff' }}>{pushStatus === 'denied' ? 'Settings' : 'Enable'}</Text>}
              </Pressable>
            </View>
            {pushError ? (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#ef4444', marginTop: 8, marginLeft: 4 }}>
                {pushError}
              </Text>
            ) : null}
          </View>
        )}

        <ProactiveRemindersCard />

        {reminders.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#1c1917', marginBottom: 6, textAlign: 'center' }}>
              No reminders yet
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', textAlign: 'center', lineHeight: 20 }}>
              Add one to get a gentle nudge to write.
            </Text>
          </View>
        ) : (
          reminders.map(reminder => (
            <Pressable
              key={reminder.id}
              onPress={() => router.push(`/reminder/${reminder.id}`)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 12,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
              }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
                  {formatTime(reminder.hour, reminder.minute)}
                </Text>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#E85D2C', marginBottom: 2 }}>
                  {formatDays(reminder.days_of_week ?? [])}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e' }} numberOfLines={1}>
                  {reminder.message?.trim() || 'How was your day? Take a moment to write.'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ReliableSwitch
                  value={reminder.enabled}
                  onValueChange={v => toggleEnabled(reminder, v)}
                  trackColor={{ false: '#e7e5e4', true: '#F5C7B0' }}
                  thumbColor={reminder.enabled ? '#E85D2C' : '#ffffff'}
                />
                <Pressable onPress={() => handleDelete(reminder)} hitSlop={8} style={{ padding: 2 }}>
                  <Feather name="trash-2" size={18} color="#ef4444" />
                </Pressable>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
    </WarmBackground>
  );
}
