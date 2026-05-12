import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

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
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="flex-1 justify-center px-8">
        <Text className="text-2xl font-bold text-gray-900 mb-2">Set new password</Text>
        <Text className="text-gray-500 mb-10">Choose a strong password for your account.</Text>

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        <Text className="text-sm font-medium text-gray-700 mb-1">New password</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-4"
          placeholder="At least 6 characters"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">Confirm password</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-6"
          placeholder="Same password again"
          placeholderTextColor="#9ca3af"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        <Pressable
          className="bg-indigo-600 rounded-xl py-4 items-center"
          onPress={handleUpdate}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Update password</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
