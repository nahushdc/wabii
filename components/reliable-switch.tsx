import { useEffect } from 'react';
import { Pressable, SwitchProps } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// A plain animated toggle instead of the native iOS Switch. The native one
// (especially on the New Architecture) intermittently fails to apply the
// custom thumb color on first paint, so a reminder that was ON looked
// half-on until it was toggled once. This draws the same thing from scratch,
// so it looks identical every time it's shown.
const WIDTH = 51;
const HEIGHT = 31;
const THUMB = 27;
const PADDING = 2;

export function ReliableSwitch({ value, onValueChange, disabled, trackColor, thumbColor }: SwitchProps) {
  const on = !!value;
  const progress = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(on ? 1 : 0, { duration: 160 });
  }, [on, progress]);

  const offTrack = (trackColor?.false as string | undefined) ?? '#e7e5e4';
  const onTrack = (trackColor?.true as string | undefined) ?? '#F5C7B0';

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offTrack, onTrack]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (WIDTH - THUMB - PADDING * 2) }],
  }));

  return (
    <Pressable
      onPress={() => onValueChange?.(!on)}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      style={{ opacity: disabled ? 0.5 : 1 }}>
      <Animated.View
        style={[
          { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT / 2, justifyContent: 'center', paddingHorizontal: PADDING },
          trackStyle,
        ]}>
        <Animated.View
          style={[
            {
              width: THUMB, height: THUMB, borderRadius: THUMB / 2,
              backgroundColor: (thumbColor as string | undefined) ?? '#ffffff',
              shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
