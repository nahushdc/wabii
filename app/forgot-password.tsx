import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleReset() {
    setError('');
    if (!email) { setError('Please enter your email address.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'wabii://reset-password',
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <WarmBackground>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1c1917', marginBottom: 10 }}>
            Check your email
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#78716c', lineHeight: 22, marginBottom: 32 }}>
            We sent a password reset link to{' '}
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#1c1917' }}>{email}</Text>. Check your inbox and tap the link.
          </Text>
          <Pressable style={{ alignItems: 'center', paddingVertical: 8 }} onPress={() => router.replace('/log-in')}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#E85D2C' }}>Back to log in</Text>
          </Pressable>
        </View>
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 }} keyboardShouldPersistTaps="handled">

        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1c1917', marginBottom: 8 }}>
          Forgot password?
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', marginBottom: 32, lineHeight: 22 }}>
          Enter your email and we'll send you a reset link.
        </Text>

        {error ? (
          <View style={{ backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#ef4444' }}>{error}</Text>
          </View>
        ) : null}

        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#78716c', marginBottom: 6 }}>Email</Text>
        <TextInput
          style={{
            backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
            fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917', marginBottom: 24,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
          }}
          placeholder="you@example.com"
          placeholderTextColor="#c4b9b0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Pressable
          onPress={handleReset}
          disabled={loading}
          style={{ backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Send reset link</Text>}
        </Pressable>

        <Pressable style={{ alignItems: 'center', paddingVertical: 8 }} onPress={() => router.back()}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e' }}>Back to log in</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
