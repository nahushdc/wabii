import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle } from '@/lib/auth';

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignUp() {
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) setError(err.message);
    else router.replace('/(tabs)');
  }

  async function handleGoogle() {
    setError('');
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    setGoogleLoading(false);
    if (err) setError(err);
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="flex-1 justify-center px-8">
        <Text className="text-3xl font-bold text-indigo-600 mb-2">Wabii</Text>
        <Text className="text-gray-500 mb-10">Create your account</Text>

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-4"
          placeholder="you@example.com"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">Password</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-6"
          placeholder="At least 6 characters"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          className="bg-indigo-600 rounded-xl py-4 items-center mb-3"
          onPress={handleSignUp}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Create account</Text>}
        </Pressable>

        <Pressable
          className="border border-gray-200 rounded-xl py-4 items-center mb-6"
          onPress={handleGoogle}
          disabled={googleLoading}>
          {googleLoading
            ? <ActivityIndicator color="#4f46e5" />
            : <Text className="text-gray-700 font-medium text-base">Continue with Google</Text>}
        </Pressable>

        <Link href="/log-in" asChild>
          <Pressable className="items-center py-2">
            <Text className="text-gray-500">Already have an account? <Text className="text-indigo-600 font-medium">Log in</Text></Text>
          </Pressable>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
