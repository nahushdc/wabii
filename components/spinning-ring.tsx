import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const SEGMENTS = 96;

// A thick ring segment that rotates slowly: a bright rounded head trailing off
// into a faded tail, like a loading arc. Built from short overlapping bars
// (no SVG library, so no native rebuild); the whole thing is rasterized once and
// just spun, so the animation is cheap.
export function SpinningRing({
  size = 260,
  thickness = 18,
  color = '#F2A07C',
  arcDegrees = 300,
  duration = 9000,
}: {
  size?: number;
  thickness?: number;
  color?: string;
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
  const step = 360 / SEGMENTS;
  const count = Math.round(arcDegrees / step);
  const segmentWidth = ((2 * Math.PI * radius) / SEGMENTS) * 1.5;

  const bars = [];
  for (let i = 0; i < count; i++) {
    // i = 0 is the faint tail, i = count - 1 the bright head.
    const strength = Math.pow(i / (count - 1), 1.7);
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
            opacity: strength,
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
