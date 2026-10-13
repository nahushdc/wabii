import { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, SharedValue, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';

// Two vivid colours at a time, stepping around this ring.
const PAIRS: [string, string][] = [
  ['#FFC72C', '#FF6F61'], // sun and coral
  ['#FF6F61', '#3D9BFF'], // coral and sky
  ['#3D9BFF', '#2FCF8E'], // sky and mint
  ['#2FCF8E', '#FFC72C'], // mint and sun
];
const STEP_MS = 7600;
const HOLD = 0.68; // fraction of each step spent holding before the next pair fades in

// One two-colour gradient layer. At any moment the current pair is fully
// visible underneath and the next pair fades in on top of it; when the step
// ends the incoming layer is already at full strength, so the hand-over is
// seamless. All driven by one shared value on the UI thread.
function PairLayer({ index, u }: { index: number; u: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const step = Math.floor(u.value) % PAIRS.length;
    const t = u.value - Math.floor(u.value);
    const next = (step + 1) % PAIRS.length;
    if (index === step) return { opacity: 1, zIndex: 1 };
    if (index === next) return { opacity: Math.min(1, Math.max(0, (t - HOLD) / (1 - HOLD))), zIndex: 2 };
    return { opacity: 0, zIndex: 0 };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, style]}>
      <LinearGradient
        colors={PAIRS[index]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      />
    </Animated.View>
  );
}

// A slow, wobbly, bright mood blob: a clipped shape whose outline morphs and
// drifts, with a big two-colour gradient slowly turning inside it. Built from
// expo-linear-gradient (already in the app) plus Reanimated, so it ships over
// the air.
export function MoodBlob({ size = 260 }: { size?: number }) {
  const morph = useSharedValue(0);
  const spin = useSharedValue(0);
  const u = useSharedValue(0);

  useEffect(() => {
    morph.value = withRepeat(withTiming(1, { duration: 15000, easing: Easing.linear }), -1, false);
    spin.value = withRepeat(withTiming(360, { duration: 26000, easing: Easing.linear }), -1, false);
    u.value = withRepeat(withTiming(PAIRS.length, { duration: STEP_MS * PAIRS.length, easing: Easing.linear }), -1, false);
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
        { rotate: `${interpolate(m, kf, [0, 4, -3, 3, 0])}deg` },
        { scaleX: interpolate(m, kf, [1, 1.04, 0.98, 1.03, 1]) },
        { scaleY: interpolate(m, kf, [1, 0.98, 1.04, 0.99, 1]) },
      ],
    };
  });
  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  const big = size * 1.6;
  const offset = -(big - size) / 2;

  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* A soft halo so the blob glows against the background. */}
      <View style={{ position: 'absolute', width: size * 1.34, height: size * 1.34, borderRadius: size, backgroundColor: 'rgba(255, 190, 150, 0.16)' }} />
      <View style={{ position: 'absolute', width: size * 1.16, height: size * 1.16, borderRadius: size, backgroundColor: 'rgba(255, 190, 150, 0.22)' }} />

      <Animated.View style={[{ width: size, height: size, overflow: 'hidden', backgroundColor: PAIRS[0][0] }, shape]}>
        <Animated.View style={[{ position: 'absolute', left: offset, top: offset, width: big, height: big }, turning]}>
          {PAIRS.map((_, i) => <PairLayer key={i} index={i} u={u} />)}
        </Animated.View>
        {/* A faint highlight so it reads as a glossy, lit shape. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          start={{ x: 0.15, y: 0.05 }}
          end={{ x: 0.7, y: 0.8 }}
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        />
      </Animated.View>
    </View>
  );
}
