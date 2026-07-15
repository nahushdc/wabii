import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Share, Alert, Clipboard } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

type TherapistLink = {
  id: string;
  therapist_email: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
};

const WORDS = [
  'Maple','River','Cloud','Tiger','Stone','Cedar','Ember','Frost','Haven','Lark',
  'Mira','Noble','Ocean','Pearl','Quinn','Raven','Sierra','Terra','Unity','Viola',
];

function generatePassword(): string {
  const w1 = WORDS[Math.floor(Math.random() * WORDS.length)];
  const w2 = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${w1}-${w2}-${num}`;
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 864e5));
}

function formatExpiry(expiresAt: string): string {
  const days = daysLeft(expiresAt);
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

export default function TherapistInviteScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [links, setLinks] = useState<TherapistLink[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchLinks(); }, []);

  async function fetchLinks() {
    const { data } = await supabase
      .from('therapist_links')
      .select('id, therapist_email, expires_at, revoked, created_at')
      .eq('revoked', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    setLinks(data ?? []);
    setLoading(false);
  }

  async function handleGenerate() {
    setError('');
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/therapist-portal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ therapist_email: email.trim(), password }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Failed to generate link');

      const shareMessage =
        `Hi, I'd like to share my journal with you via Wabii so you can review my entries before our sessions.\n\n` +
        `🔗 Access link (valid for 7 days):\n${result.url}\n\n` +
        `🔐 Password: ${password}\n\n` +
        `Open the link and enter the password to access my journal.`;

      setEmail('');
      setPassword(generatePassword()); // fresh password for next time
      await fetchLinks();
      await Share.share({ message: shareMessage, title: 'Journal access for your therapist' });
    } catch (e: any) {
      setError(e.message);
    }
    setGenerating(false);
  }

  async function handleRevoke(linkId: string, therapistEmail: string) {
    Alert.alert(
      'Revoke access',
      `${therapistEmail} will immediately lose access to your journal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke', style: 'destructive',
          onPress: async () => {
            await supabase.from('therapist_links').update({ revoked: true }).eq('id', linkId);
            setLinks(prev => prev.filter(l => l.id !== linkId));
          },
        },
      ]
    );
  }

  async function handleResend(linkId: string) {
    const { data } = await supabase
      .from('therapist_links')
      .select('token, therapist_email')
      .eq('id', linkId)
      .single();
    if (!data) return;
    const portalBase = process.env.EXPO_PUBLIC_THERAPIST_PORTAL_URL ?? 'https://wabii-portal.vercel.app';
    const url = `${portalBase}?token=${data.token}`;
    await Share.share({
      message: `Hi, here's your access link to my Wabii journal (valid for 7 days):\n\n🔗 ${url}\n\nUse the password I shared with you when I first sent this.`,
    });
  }

  function handleCopyPassword() {
    Clipboard.setString(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <WarmBackground>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>Share with therapist</Text>
      </View>

      <View style={{ paddingHorizontal: 24 }}>

        {/* Explainer */}
        <View style={{ backgroundColor: '#fdf6ee', borderRadius: 16, padding: 18, marginBottom: 28 }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#b07d4a', marginBottom: 6 }}>🌿 How it works</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#78716c', lineHeight: 20 }}>
            Generate a private, password-protected link for your therapist. They open it in any browser — no account needed. Access expires in 7 days and you can revoke it anytime.
          </Text>
        </View>

        {/* Email */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Therapist's email
        </Text>
        <TextInput
          style={{
            backgroundColor: '#ffffff', borderRadius: 14,
            paddingHorizontal: 16, paddingVertical: 14,
            fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917',
            marginBottom: 20,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}
          placeholder="therapist@example.com"
          placeholderTextColor="#c4b9b0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {/* Auto-generated password */}
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 10 }}>
          Access password
        </Text>
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 14, marginBottom: 8,
          flexDirection: 'row', alignItems: 'center',
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
        }}>
          <Text style={{ flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#E85D2C', paddingHorizontal: 16, paddingVertical: 14, letterSpacing: 0.5 }}>
            {password}
          </Text>
          <Pressable onPress={handleCopyPassword} style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
            <Feather name={copied ? 'check' : 'copy'} size={16} color={copied ? '#22c55e' : '#a8a29e'} />
          </Pressable>
          <Pressable onPress={() => setPassword(generatePassword())} style={{ paddingRight: 14, paddingVertical: 14 }}>
            <Feather name="refresh-cw" size={16} color="#a8a29e" />
          </Pressable>
        </View>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#b8b0a8', marginBottom: 24 }}>
          This password will be included in the share message automatically.
        </Text>

        {error ? (
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{error}</Text>
        ) : null}

        <Pressable
          onPress={handleGenerate}
          disabled={generating}
          style={{
            backgroundColor: generating ? '#c4b9b0' : '#E85D2C',
            borderRadius: 14, paddingVertical: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 36,
          }}>
          {generating
            ? <ActivityIndicator color="white" />
            : <>
                <Feather name="link" size={16} color="white" />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#ffffff' }}>Generate & share link</Text>
              </>}
        </Pressable>

        {/* Active links */}
        {loading ? (
          <ActivityIndicator color="#E85D2C" />
        ) : links.length > 0 ? (
          <>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#c4b9b0', marginBottom: 12 }}>
              Active access
            </Text>
            {links.map(link => (
              <View key={link.id} style={{
                backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 10,
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#1c1917', marginBottom: 3 }}>
                      {link.therapist_email}
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: daysLeft(link.expires_at) <= 1 ? '#f59e0b' : '#a8a29e' }}>
                      {formatExpiry(link.expires_at)}
                    </Text>
                  </View>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', marginTop: 4 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => handleResend(link.id)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f0ebe3', borderRadius: 10, paddingVertical: 10 }}>
                    <Feather name="share-2" size={14} color="#78716c" />
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#78716c' }}>Resend</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRevoke(link.id, link.therapist_email)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff1f0', borderRadius: 10, paddingVertical: 10 }}>
                    <Feather name="x" size={14} color="#ef4444" />
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#ef4444' }}>Revoke</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </View>
    </ScrollView>
    </WarmBackground>
  );
}
