import { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';
import { PinPad } from '@/components/pin-pad';
import { createPinHash, verifyPin } from '@/lib/app-lock';

type Stage = 'verify' | 'forgot-password' | 'forgot-new' | 'forgot-confirm';

export function AppLockScreen({
  pinHash, pinSalt, onUnlock,
}: {
  pinHash: string; pinSalt: string; onUnlock: (newHash?: string, newSalt?: string) => void;
}) {
  const [stage, setStage] = useState<Stage>('verify');
  const [shakeKey, setShakeKey] = useState(0);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [firstEntry, setFirstEntry] = useState('');

  async function handleVerify(pin: string) {
    const ok = await verifyPin(pin, pinHash, pinSalt);
    if (ok) {
      onUnlock();
      return;
    }
    setError('Incorrect PIN.');
    setShakeKey(k => k + 1);
  }

  async function handleVerifyPassword() {
    setError('');
    setVerifyingPassword(true);
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email;
    if (!email) { setVerifyingPassword(false); setError('Could not verify your account. Try signing out instead.'); return; }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setVerifyingPassword(false);
    if (signInErr) { setError('Incorrect password.'); return; }
    setPassword('');
    setStage('forgot-new');
  }

  async function handleNewPin(pin: string) {
    if (stage === 'forgot-new') {
      setFirstEntry(pin);
      setStage('forgot-confirm');
      return;
    }
    if (pin !== firstEntry) {
      setError("Those didn't match — try again.");
      setShakeKey(k => k + 1);
      setStage('forgot-new');
      setFirstEntry('');
      return;
    }
    const { hash, salt } = await createPinHash(pin);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('users').update({ app_lock_pin_hash: hash, app_lock_pin_salt: salt }).eq('id', user.id);
    onUnlock(hash, salt);
  }

  return (
    <WarmBackground style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{
            width: 56, height: 56, borderRadius: 28, backgroundColor: '#FDE6DB',
            alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          }}>
            <Feather name="lock" size={24} color={COLORS.primary} />
          </View>

          {stage === 'verify' && (
            <>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#1c1917', marginBottom: 6 }}>Enter your PIN</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: error ? '#ef4444' : '#a8a29e', marginBottom: 32, textAlign: 'center' }}>
                {error || 'Unlock Wabii to continue.'}
              </Text>
              <PinPad onComplete={handleVerify} shakeKey={shakeKey} />
              <Pressable onPress={() => { setStage('forgot-password'); setError(''); }} style={{ marginTop: 28 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.primary }}>Forgot PIN?</Text>
              </Pressable>
            </>
          )}

          {stage === 'forgot-password' && (
            <>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#1c1917', marginBottom: 6, textAlign: 'center' }}>
                Confirm it's you
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#a8a29e', marginBottom: 20, textAlign: 'center' }}>
                Enter your account password to reset your PIN.
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#c4b9b0"
                secureTextEntry
                autoFocus
                style={{
                  width: '100%', backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                  fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1c1917', marginBottom: 12,
                }}
              />
              {error ? (
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#ef4444', marginBottom: 12, textAlign: 'center' }}>{error}</Text>
              ) : null}
              <Pressable
                onPress={handleVerifyPassword}
                disabled={verifyingPassword || !password}
                style={{
                  width: '100%', backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14,
                  alignItems: 'center', marginBottom: 14, opacity: password ? 1 : 0.5,
                }}>
                {verifyingPassword
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#ffffff' }}>Verify</Text>}
              </Pressable>
              <Pressable onPress={() => { setStage('verify'); setError(''); setPassword(''); }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#a8a29e' }}>Back</Text>
              </Pressable>
              <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 20 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12.5, color: '#c4b9b0' }}>Sign out instead</Text>
              </Pressable>
            </>
          )}

          {(stage === 'forgot-new' || stage === 'forgot-confirm') && (
            <>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#1c1917', marginBottom: 6 }}>
                {stage === 'forgot-new' ? 'Set a new PIN' : 'Confirm your PIN'}
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: error ? '#ef4444' : '#a8a29e', marginBottom: 32, textAlign: 'center' }}>
                {error || (stage === 'forgot-new' ? 'Choose a new 4-digit PIN.' : 'Enter it once more.')}
              </Text>
              <PinPad onComplete={handleNewPin} shakeKey={shakeKey} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </WarmBackground>
  );
}
