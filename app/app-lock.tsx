import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { WarmBackground } from '@/components/warm-background';
import { ReliableSwitch } from '@/components/reliable-switch';
import { PinPad } from '@/components/pin-pad';
import { createPinHash, verifyPin } from '@/lib/app-lock';

type Stage = 'idle' | 'setup-new' | 'setup-confirm' | 'verify-disable' | 'verify-change' | 'change-new' | 'change-confirm';

export default function AppLockScreen() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinSalt, setPinSalt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [firstEntry, setFirstEntry] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [message, setMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function fetchSettings() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data } = await supabase
          .from('users')
          .select('app_lock_enabled, app_lock_pin_hash, app_lock_pin_salt')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setEnabled(data?.app_lock_enabled ?? false);
        setPinHash(data?.app_lock_pin_hash ?? null);
        setPinSalt(data?.app_lock_pin_salt ?? null);
        setLoading(false);
      }
      fetchSettings();
      return () => { cancelled = true; };
    }, [])
  );

  async function saveToServer(fields: { app_lock_enabled?: boolean; app_lock_pin_hash?: string | null; app_lock_pin_salt?: string | null }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true);
    await supabase.from('users').update(fields).eq('id', user.id);
    setSaving(false);
  }

  function handleToggle(value: boolean) {
    if (value) {
      setMessage('');
      setStage('setup-new');
    } else {
      if (!pinHash) {
        setEnabled(false);
        saveToServer({ app_lock_enabled: false });
        return;
      }
      setMessage('Enter your current PIN to turn off App Lock.');
      setStage('verify-disable');
    }
  }

  function handleChangePin() {
    setMessage('Enter your current PIN.');
    setStage('verify-change');
  }

  async function handlePinEntry(pin: string) {
    if (stage === 'setup-new') {
      setFirstEntry(pin);
      setMessage('Enter the same PIN again to confirm.');
      setStage('setup-confirm');
      return;
    }

    if (stage === 'setup-confirm') {
      if (pin !== firstEntry) {
        setMessage("Those didn't match — try again.");
        setShakeKey(k => k + 1);
        setStage('setup-new');
        setFirstEntry('');
        return;
      }
      const { hash, salt } = await createPinHash(pin);
      setPinHash(hash);
      setPinSalt(salt);
      setEnabled(true);
      await saveToServer({ app_lock_enabled: true, app_lock_pin_hash: hash, app_lock_pin_salt: salt });
      setStage('idle');
      setMessage('');
      return;
    }

    if (stage === 'verify-disable') {
      const ok = pinHash && pinSalt && await verifyPin(pin, pinHash, pinSalt);
      if (!ok) {
        setMessage('Incorrect PIN — try again.');
        setShakeKey(k => k + 1);
        return;
      }
      setEnabled(false);
      setPinHash(null);
      setPinSalt(null);
      await saveToServer({ app_lock_enabled: false, app_lock_pin_hash: null, app_lock_pin_salt: null });
      setStage('idle');
      setMessage('');
      return;
    }

    if (stage === 'verify-change') {
      const ok = pinHash && pinSalt && await verifyPin(pin, pinHash, pinSalt);
      if (!ok) {
        setMessage('Incorrect PIN — try again.');
        setShakeKey(k => k + 1);
        return;
      }
      setMessage('Enter a new PIN.');
      setStage('change-new');
      return;
    }

    if (stage === 'change-new') {
      setFirstEntry(pin);
      setMessage('Enter the same PIN again to confirm.');
      setStage('change-confirm');
      return;
    }

    if (stage === 'change-confirm') {
      if (pin !== firstEntry) {
        setMessage("Those didn't match — try again.");
        setShakeKey(k => k + 1);
        setStage('change-new');
        setFirstEntry('');
        return;
      }
      const { hash, salt } = await createPinHash(pin);
      setPinHash(hash);
      setPinSalt(salt);
      await saveToServer({ app_lock_pin_hash: hash, app_lock_pin_salt: salt });
      setStage('idle');
      setMessage('');
    }
  }

  if (loading) {
    return (
      <WarmBackground style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E85D2C" />
      </WarmBackground>
    );
  }

  if (stage !== 'idle') {
    return (
      <WarmBackground>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
          <Pressable onPress={() => { setStage('idle'); setMessage(''); setFirstEntry(''); }} style={{ padding: 4, marginRight: 12 }}>
            <Feather name="arrow-left" size={22} color="#374151" />
          </Pressable>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>
            {stage.startsWith('setup') ? 'Set PIN' : stage.startsWith('change') ? 'Change PIN' : 'Verify PIN'}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 15, color: '#78716c', marginBottom: 32, textAlign: 'center', paddingHorizontal: 40 }}>
            {message}
          </Text>
          <PinPad onComplete={handlePinEntry} shakeKey={shakeKey} />
        </View>
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
            <Feather name="arrow-left" size={22} color="#374151" />
          </Pressable>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1c1917' }}>App Lock</Text>
        </View>

        <View style={{ paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#a8a29e', lineHeight: 21, marginBottom: 24 }}>
            Require a PIN to open Wabii — anyone who picks up your phone can't read your entries without it.
          </Text>

          <View style={{
            backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 14,
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 12, backgroundColor: '#FDE6DB',
                alignItems: 'center', justifyContent: 'center', marginRight: 14,
              }}>
                <Feather name="lock" size={17} color="#E85D2C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1c1917', marginBottom: 2 }}>
                  App Lock
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#a8a29e', lineHeight: 17 }}>
                  {enabled ? 'On — a PIN is required to open the app.' : 'Off — anyone with your phone can open Wabii.'}
                </Text>
              </View>
              {saving
                ? <ActivityIndicator size="small" color="#E85D2C" style={{ marginLeft: 10 }} />
                : (
                  <ReliableSwitch
                    value={enabled}
                    onValueChange={handleToggle}
                    trackColor={{ false: '#e7e5e4', true: '#F5C7B0' }}
                    thumbColor={enabled ? '#E85D2C' : '#ffffff'}
                  />
                )}
            </View>
          </View>

          {enabled && (
            <Pressable
              onPress={handleChangePin}
              style={{
                backgroundColor: '#ffffff', borderRadius: 16, padding: 18,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
              }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 15, color: '#1c1917' }}>Change PIN</Text>
              <Feather name="chevron-right" size={18} color="#c4b9b0" />
            </Pressable>
          )}
        </View>
      </ScrollView>
    </WarmBackground>
  );
}
