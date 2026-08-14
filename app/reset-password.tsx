import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { PasswordInput } from '@/components/password-input';
import { WarmBackground } from '@/components/warm-background';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpdate() {
    setError('');
    if (!password) { setError('Please enter a new password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords don\'t match.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) setError(err.message);
    else router.replace('/(tabs)');
  }

  return (
    <WarmBackground>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 }} keyboardShouldPersistTaps="handled">

        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1c1917', marginBottom: 8 }}>
          Set new password
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#a8a29e', marginBottom: 32, lineHeight: 22 }}>
          Choose a strong password for your account.
        </Text>

        {error ? (
          <View style={{ backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#ef4444' }}>{error}</Text>
          </View>
        ) : null}

        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#78716c', marginBottom: 6 }}>New password</Text>
        <PasswordInput
          placeholder="At least 6 characters"
          placeholderTextColor="#c4b9b0"
          value={password}
          onChangeText={setPassword}
          style={{ marginBottom: 16 }}
        />

        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#78716c', marginBottom: 6 }}>Confirm password</Text>
        <PasswordInput
          placeholder="Same password again"
          placeholderTextColor="#c4b9b0"
          value={confirm}
          onChangeText={setConfirm}
          style={{ marginBottom: 24 }}
        />

        <Pressable
          onPress={handleUpdate}
          disabled={loading}
          style={{ backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Update password</Text>}
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
