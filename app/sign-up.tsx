import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle } from '@/lib/auth';
import { PasswordInput } from '@/components/password-input';
import { WarmBackground } from '@/components/warm-background';

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
    <WarmBackground>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 }} keyboardShouldPersistTaps="handled">

        {/* Brand */}
        <View style={{ marginBottom: 40 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 40, color: '#1c1917', marginBottom: 8 }}>
            Wabii
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: '#a8a29e' }}>
            Start your reflection journey ✨
          </Text>
        </View>

        {error ? (
          <View style={{ backgroundColor: '#fff1f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#ef4444' }}>{error}</Text>
          </View>
        ) : null}

        {/* Email */}
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#78716c', marginBottom: 6 }}>Email</Text>
        <TextInput
          style={{
            backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
            fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917', marginBottom: 14,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
          }}
          placeholder="you@example.com"
          placeholderTextColor="#c4b9b0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {/* Password */}
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#78716c', marginBottom: 6 }}>Password</Text>
        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor="#c4b9b0"
          style={{ marginBottom: 28 }}
        />

        {/* Sign up button */}
        <Pressable
          onPress={handleSignUp}
          disabled={loading}
          style={{ backgroundColor: '#E85D2C', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#ffffff' }}>Create account</Text>}
        </Pressable>

        {/* Google */}
        <Pressable
          onPress={handleGoogle}
          disabled={googleLoading}
          style={{
            backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 32,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
          }}>
          {googleLoading
            ? <ActivityIndicator color="#E85D2C" />
            : <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 16, color: '#1c1917' }}>Continue with Google</Text>}
        </Pressable>

        <Link href="/log-in" asChild>
          <Pressable style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e' }}>
              Already have an account?{' '}
              <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#E85D2C' }}>Log in</Text>
            </Text>
          </Pressable>
        </Link>

      </ScrollView>
    </KeyboardAvoidingView>
    </WarmBackground>
  );
}
