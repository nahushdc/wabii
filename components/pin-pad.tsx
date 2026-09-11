import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import { PIN_LENGTH } from '@/lib/app-lock';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// `shakeKey` starts at 0 (no shake on first mount) — bump it each time a PIN
// attempt is wrong to clear the dots and play a shake, without the parent
// needing access to the pad's internal animation state.
export function PinPad({ onComplete, shakeKey = 0 }: { onComplete: (pin: string) => void; shakeKey?: number }) {
  const [pin, setPin] = useState('');
  const shake = useRef(new Animated.Value(0)).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPin('');
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeKey]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      onComplete(pin);
    }
  }, [pin]);

  function press(key: string) {
    if (key === '') return;
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    setPin(p => p + key);
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={{ flexDirection: 'row', gap: 14, marginBottom: 36, transform: [{ translateX: shake }] }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: i < pin.length ? COLORS.primary : '#e7e2da',
            }}
          />
        ))}
      </Animated.View>

      <View style={{ width: 260, flexDirection: 'row', flexWrap: 'wrap' }}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            onPress={() => press(key)}
            disabled={key === ''}
            style={{
              width: '33.333%', height: 66, alignItems: 'center', justifyContent: 'center',
            }}>
            {key === 'del' ? (
              <Feather name="delete" size={22} color="#78716c" />
            ) : (
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 26, color: '#1c1917' }}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
