import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const SEGMENTS = 96;

// A thick ring with a gap that slowly rotates. Built from short overlapping
// bars rather than an SVG arc so it needs no extra native library; the whole
// ring is rasterized once and just spun, so the animation is cheap.
export function SpinningRing({
  size = 230,
  thickness = 22,
  color = '#F5CBB6',
  gapSegments = 11,
  duration = 18000,
}: {
  size?: number;
  thickness?: number;
  color?: string;
  gapSegments?: number;
  duration?: number;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rotation);
  }, [duration, rotation]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  const radius = size / 2 - thickness / 2;
  const segmentWidth = ((2 * Math.PI * radius) / SEGMENTS) * 1.4;
  const half = Math.floor(gapSegments / 2);
  const step = 360 / SEGMENTS;

  const bars = [];
  for (let i = 0; i < SEGMENTS; i++) {
    // The gap is centred on the top (index 0): skip bars on either side of it.
    if (i <= half || i >= SEGMENTS - half) continue;
    bars.push(
      <View
        key={i}
        style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${i * step}deg` }] }}>
        <View
          style={{
            position: 'absolute',
            left: size / 2 - segmentWidth / 2,
            top: size / 2 - radius - thickness / 2,
            width: segmentWidth,
            height: thickness,
            backgroundColor: color,
          }}
        />
      </View>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      shouldRasterizeIOS
      renderToHardwareTextureAndroid
      style={[{ width: size, height: size }, spin]}>
      {bars}
    </Animated.View>
  );
}
