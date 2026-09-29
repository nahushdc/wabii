import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

const BAR_COUNT = 24;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 36;

// A live VU-meter-style bar waveform driven by a single rolling amplitude
// value (from useLiveTranscription). Each bar gets its own small random
// jitter around that shared value so the bars don't all move in lockstep —
// reads as "listening" rather than a single pulsing block.
export function Waveform({ amplitude, active, color = '#ffffff' }: { amplitude: number; active: boolean; color?: string }) {
  const bars = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(MIN_HEIGHT))).current;

  useEffect(() => {
    if (!active) {
      bars.forEach(bar => Animated.timing(bar, { toValue: MIN_HEIGHT, duration: 250, useNativeDriver: false }).start());
      return;
    }
    bars.forEach(bar => {
      const jitter = 0.5 + Math.random() * 1.0;
      const height = MIN_HEIGHT + Math.max(0, Math.min(1, amplitude * jitter)) * (MAX_HEIGHT - MIN_HEIGHT);
      Animated.timing(bar, { toValue: height, duration: 150, useNativeDriver: false }).start();
    });
    // Only the shared amplitude value should retrigger the bars — `bars`
    // itself is a stable ref, and `active` is handled by the branch above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amplitude, active]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: MAX_HEIGHT, gap: 3 }}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={{ width: 3, borderRadius: 2, backgroundColor: color, height: bar }} />
      ))}
    </View>
  );
}
