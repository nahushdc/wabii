import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

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
      <View className="flex-1 bg-white justify-center px-8">
        <Text className="text-2xl font-bold text-gray-900 mb-3">Check your email</Text>
        <Text className="text-gray-500 mb-8">
          We sent a password reset link to <Text className="font-medium text-gray-700">{email}</Text>. Check your inbox and tap the link.
        </Text>
        <Pressable className="items-center py-2" onPress={() => router.replace('/log-in')}>
          <Text className="text-indigo-600 font-medium">Back to log in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="flex-1 justify-center px-8">
        <Text className="text-2xl font-bold text-gray-900 mb-2">Forgot password?</Text>
        <Text className="text-gray-500 mb-10">Enter your email and we'll send you a reset link.</Text>

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-6"
          placeholder="you@example.com"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Pressable
          className="bg-indigo-600 rounded-xl py-4 items-center mb-4"
          onPress={handleReset}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Send reset link</Text>}
        </Pressable>

        <Pressable className="items-center py-2" onPress={() => router.back()}>
          <Text className="text-gray-500">Back to log in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
