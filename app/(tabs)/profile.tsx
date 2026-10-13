import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { calculateStreak } from '@/lib/streak';
import { WarmBackground, WARM_BG_COLOR } from '@/components/warm-background';
import { LinearGradient } from 'expo-linear-gradient';

function getInitials(nameOrEmail: string) {
  const parts = nameOrEmail.split(/[\s@]+/);
  if (parts.length >= 2 && !nameOrEmail.includes('@')) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nameOrEmail[0].toUpperCase();
}

function StatBox({ value, label, emoji }: { value: string | number; label: string; emoji: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8 }}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1c1917', marginTop: 4 }}>{value}</Text>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#a8a29e', textAlign: 'center', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function StreakRow({ streak }: { streak: number }) {
  return (
    <Pressable
      onPress={() => router.push('/streak')}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 10,
        shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE6DB',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 18 }}>🔥</Text>
        </View>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#1c1917' }}>
          {streak} day{streak === 1 ? '' : 's'} streak
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#E85D2C' }}>See more</Text>
        <Feather name="chevron-right" size={14} color="#E85D2C" />
      </View>
    </Pressable>
  );
}

// A flat, airy settings row — no card, no divider, no chevron.
function MenuItem({ label, subtitle, icon, onPress, danger }: { label: string; subtitle?: string; icon: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 19,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flex: 1, marginRight: 12 }}>
        <Feather name={icon as any} size={20} color={danger ? '#ef4444' : '#8a8279'} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: danger ? '#ef4444' : '#1c1917' }}>{label}</Text>
          {subtitle ? (
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: '#a8a29e', marginTop: 1 }}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? '');
        setName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '');
      }

      const { data: entries } = await supabase
        .from('journal_entries')
        .select('created_at, content');

      if (entries) {
        const dates = entries.map(e => e.created_at);
        setTotalEntries(entries.length);
        setStreak(calculateStreak(dates));
        const words = entries.reduce((sum, e) => sum + (e.content?.trim().split(/\s+/).length ?? 0), 0);
        setTotalWords(words);
      }

      setLoading(false);
    }
    fetchData();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and everything in it: journal entries, reflections, tags, reminders and chats. It can\u2019t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you absolutely sure?', 'Your journal will be gone for good.', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete everything', style: 'destructive', onPress: deleteAccount },
            ]),
        },
      ]
    );
  }

  async function deleteAccount() {
    setDeleteError('');
    setDeleting(true);
    const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: true } });
    if (error) {
      setDeleting(false);
      setDeleteError('Could not delete your account. Please try again.');
      return;
    }
    // The account is gone server-side: stop any reminders still scheduled on
    // this phone, then drop the local session (the auth guard returns to log-in).
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    await supabase.auth.signOut({ scope: 'local' });
  }

  async function handlePursuitsPress() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = user
      ? await supabase.from('users').select('pursuits_onboarding_seen').eq('id', user.id).maybeSingle()
      : { data: null };
    if (data?.pursuits_onboarding_seen) {
      router.push('/prompt-themes');
    } else {
      router.push('/pursuits-onboarding');
    }
  }

  const displayName = name || email;
  const initials = displayName ? getInitials(displayName) : '?';

  return (
    <WarmBackground>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 16 }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#1c1917' }}>Profile</Text>
      </View>

      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 48 }}>
          <ActivityIndicator color="#E85D2C" />
        </View>
      ) : (
        <>
          {/* Avatar + name */}
          <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: '#E85D2C',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
            }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: '#ffffff' }}>
                {initials}
              </Text>
            </View>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 20, color: '#1c1917', marginBottom: 4 }}>
              {name || 'Your Name'}
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e' }}>
              {email}
            </Text>
          </View>

          {/* Stats */}
          <View style={{ paddingHorizontal: 24, marginBottom: 28 }}>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <StatBox value={totalEntries} label="thoughts shared" emoji="💭" />
              <StatBox
                value={totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords}
                label="words written"
                emoji="✍️"
              />
            </View>
            <StreakRow streak={streak} />
          </View>

          {/* Menu */}
          <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 6 }}>
              Settings
            </Text>
            <MenuItem label="Reminders" icon="bell" onPress={() => router.push('/notifications')} />
            <MenuItem label="App Lock" icon="lock" onPress={() => router.push('/app-lock')} />
            <MenuItem label="Reflection Settings" icon="feather" onPress={() => router.push('/reflection-settings')} />
            <MenuItem label="Pursuits" icon="edit-3" onPress={handlePursuitsPress} />
            <MenuItem label="Share with coach" icon="share-2" onPress={() => router.push('/therapist-invite')} />
            <MenuItem label="Export & Import" icon="download" onPress={() => router.push('/export')} />
            <MenuItem label="Help" icon="help-circle" onPress={() => router.push('/help')} />
          </View>

          {/* Sign out */}
          <View style={{ paddingHorizontal: 24 }}>
            <Pressable
              onPress={handleSignOut}
              style={{ backgroundColor: '#fff1f0', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#ef4444' }}>Sign out</Text>
            </Pressable>

            <Pressable
              onPress={confirmDeleteAccount}
              disabled={deleting}
              style={{ paddingVertical: 18, alignItems: 'center', marginTop: 4 }}>
              {deleting
                ? <ActivityIndicator color="#a8a29e" />
                : <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#a8a29e' }}>Delete account</Text>}
            </Pressable>
            {deleteError ? (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444', textAlign: 'center' }}>{deleteError}</Text>
            ) : null}
          </View>
        </>
      )}
    </ScrollView>
    {/* Soft fade so rows slide out under the floating nav bar instead of colliding with it */}
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(245, 239, 228, 0)', WARM_BG_COLOR]}
      locations={[0, 0.7]}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }}
    />
    </WarmBackground>
  );
}
