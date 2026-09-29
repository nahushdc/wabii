import { useEffect, useRef } from 'react';
import { View, Animated, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

const SIZE = 96;

// A Siri/Assistant-style "listening" orb: a slow continuous breathing loop
// for an organic idle feel, plus two rings that spring outward on every
// amplitude update — springs (not timing) so the reaction reads as snappy
// and alive rather than smoothly interpolated, which is what actually makes
// it feel like it's responding to voice intensity instead of just looping.
export function VoicePulseButton({
  isRecording,
  connecting,
  amplitude,
  onPress,
  disabled,
}: {
  isRecording: boolean;
  connecting: boolean;
  amplitude: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  const breathe = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isRecording) {
      breathe.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, breathe]);

  useEffect(() => {
    if (!isRecording) {
      ring1.setValue(0);
      ring2.setValue(0);
      return;
    }
    // A short, near-instant timing beats a spring here — a spring's
    // multi-frame settle reads as lag against 100ms amplitude updates, since
    // the ring is still easing toward the *previous* value when the next
    // one arrives. Snapping quickly and immediately re-targeting instead
    // makes the motion track speech directly rather than chase it.
    const level = Math.max(0, Math.min(1, amplitude));
    Animated.timing(ring1, { toValue: level, duration: 70, useNativeDriver: true }).start();
    Animated.timing(ring2, { toValue: level, duration: 90, useNativeDriver: true }).start();
  }, [amplitude, isRecording, ring1, ring2]);

  const baseScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const ring1Scale = ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const ring1Opacity = ring1.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.02] });
  const ring2Scale = ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] });
  const ring2Opacity = ring2.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0] });

  return (
    <View style={{ width: SIZE * 2.2, height: SIZE * 2.2, alignItems: 'center', justifyContent: 'center' }}>
      {isRecording && (
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2,
              backgroundColor: '#ef4444', opacity: ring2Opacity, transform: [{ scale: ring2Scale }],
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2,
              backgroundColor: '#ef4444', opacity: ring1Opacity, transform: [{ scale: ring1Scale }],
            }}
          />
        </>
      )}
      <Animated.View style={{ transform: [{ scale: baseScale }] }}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={{
            width: SIZE, height: SIZE, borderRadius: SIZE / 2,
            backgroundColor: isRecording ? '#ef4444' : connecting ? '#e7e5e4' : COLORS.primary,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#1c1917', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
          }}>
          {connecting
            ? <ActivityIndicator color="#a8a29e" size="small" />
            : <Feather name={isRecording ? 'square' : 'mic'} size={30} color="#ffffff" />}
        </Pressable>
      </Animated.View>
    </View>
  );
}
