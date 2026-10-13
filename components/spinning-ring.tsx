import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { WARM_BG_COLOR } from '@/components/warm-background';

const SEGMENTS = 180;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// A thick arc that turns slowly: a faint tail building into a bright, rounded
// head. It is built from many thin bars, but every bar is fully OPAQUE and gets
// its colour by blending the ring colour toward the background — so where
// neighbours overlap nothing stacks up, and the gradient reads as perfectly
// smooth (see-through bars produced visible ribs). No SVG library needed, so it
// ships over the air; the whole ring is rasterized once and just spun.
export function SpinningRing({
  size = 260,
  thickness = 28,
  color = '#E85D2C',
  background = WARM_BG_COLOR,
  arcDegrees = 305,
  duration = 9000,
}: {
  size?: number;
  thickness?: number;
  color?: string;
  background?: string;
  arcDegrees?: number;
  duration?: number;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rotation);
  }, [duration, rotation]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  const radius = size / 2 - thickness / 2;
  const outerRadius = size / 2;
  const step = 360 / SEGMENTS;
  const count = Math.round(arcDegrees / step);
  // Wide enough that neighbours overlap at the outer edge (no gaps).
  const segmentWidth = ((2 * Math.PI * outerRadius) / SEGMENTS) * 1.25;

  const bars = [];
  for (let i = 0; i < count; i++) {
    // i = 0 is the faint tail, i = count - 1 the bright head.
    const strength = Math.pow(i / (count - 1), 1.5);
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
            backgroundColor: mix(background, color, strength),
          }}
        />
      </View>
    );
  }

  // Rounded cap on the bright end.
  const headAngle = (count - 1) * step;
  bars.push(
    <View
      key="head"
      style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${headAngle}deg` }] }}>
      <View
        style={{
          position: 'absolute',
          left: size / 2 - thickness / 2,
          top: size / 2 - radius - thickness / 2,
          width: thickness,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );

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
