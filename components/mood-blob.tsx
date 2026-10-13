import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing, SharedValue, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';

// Colours in ring order; neighbours in this order sit in neighbouring corners.
const RING_COLORS = ['#F8D56B', '#F4A394', '#8DB9EE', '#8FD3A4'];
const CORNERS: { top?: number; bottom?: number; left?: number; right?: number }[] = [
  { top: 0, left: 0 },
  { top: 0, right: 0 },
  { bottom: 0, right: 0 },
  { bottom: 0, left: 0 },
];
const LAYERS = 12;

// Soft-edged colour patch built from stacked, nearly transparent circles —
// no blur or gradient library needed, so it ships over the air.
function SoftPatch({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: LAYERS }, (_, i) => {
        const d = size * (1 - (i / LAYERS) * 0.92);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (size - d) / 2, top: (size - d) / 2,
              width: d, height: d, borderRadius: d / 2,
              backgroundColor: color, opacity: 0.14,
            }}
          />
        );
      })}
    </View>
  );
}

function ColorPatch({ index, u, size }: { index: number; u: SharedValue<number>; size: number }) {
  // Weight peaks when the cycle position is at this colour and fades over one
  // step either side, so at most two neighbouring colours are visible at once.
  const style = useAnimatedStyle(() => {
    const diff = Math.abs(u.value - (index + 0.5));
    const d = Math.min(diff, 4 - diff);
    return { opacity: Math.max(0, 1 - d) };
  });
  return (
    <Animated.View style={[{ position: 'absolute', ...CORNERS[index] }, style]}>
      <SoftPatch size={size} color={RING_COLORS[index]} />
    </Animated.View>
  );
}

// A slow, wobbly mood blob: the outline morphs and drifts, the colour patches
// turn inside it, and two neighbouring colours show at a time.
export function MoodBlob({ size = 200 }: { size?: number }) {
  const morph = useSharedValue(0);
  const spin = useSharedValue(0);
  const u = useSharedValue(0);

  useEffect(() => {
    morph.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.linear }), -1, false);
    spin.value = withRepeat(withTiming(360, { duration: 30000, easing: Easing.linear }), -1, false);
    u.value = withRepeat(withTiming(4, { duration: 28000, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(morph); cancelAnimation(spin); cancelAnimation(u); };
  }, [morph, spin, u]);

  const kf = [0, 0.25, 0.5, 0.75, 1];
  const shape = useAnimatedStyle(() => {
    const m = morph.value;
    return {
      borderTopLeftRadius: interpolate(m, kf, [0.58, 0.46, 0.52, 0.42, 0.58]) * size,
      borderTopRightRadius: interpolate(m, kf, [0.42, 0.54, 0.48, 0.58, 0.42]) * size,
      borderBottomRightRadius: interpolate(m, kf, [0.5, 0.44, 0.52, 0.42, 0.5]) * size,
      borderBottomLeftRadius: interpolate(m, kf, [0.42, 0.52, 0.4, 0.52, 0.42]) * size,
      transform: [
        { rotate: `${interpolate(m, kf, [0, 3, -2, 2, 0])}deg` },
        { scaleX: interpolate(m, kf, [1, 1.03, 0.98, 1.02, 1]) },
        { scaleY: interpolate(m, kf, [1, 0.98, 1.03, 0.99, 1]) },
      ],
    };
  });
  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  const patch = size * 0.82;
  const inset = (size - patch) / 2;

  return (
    <Animated.View
      pointerEvents="none"
      shouldRasterizeIOS
      style={[{ width: size, height: size, overflow: 'hidden', backgroundColor: '#FBF1E6' }, shape]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, turning]}>
        <View style={{ position: 'absolute', left: inset, top: inset, width: patch, height: patch }}>
          {RING_COLORS.map((_, i) => <ColorPatch key={i} index={i} u={u} size={patch * 0.78} />)}
        </View>
      </Animated.View>
    </Animated.View>
  );
}
