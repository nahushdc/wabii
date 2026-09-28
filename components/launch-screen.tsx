import { useEffect, useState } from 'react';
import { Dimensions, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { WARM_BG_COLOR } from '@/components/warm-background';
import { COLORS } from '@/constants/colors';

const WORDMARK = 'Wabii';
const REVEAL_MS = 500;
const HOLD_MS = 150;
const SETTLE_MS = 140;
const RIPPLE_MS = 320;

const CIRCLE_SIZE = 64;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Scale needed for the circle to cover the full screen diagonal from its
// center, plus a little buffer so no sliver of background peeks through.
const COVER_SCALE = Math.sqrt(SCREEN_W ** 2 + SCREEN_H ** 2) / CIRCLE_SIZE + 2;

export function LaunchScreen({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  // Mask starts covering the wordmark fully (100) and shrinks to 0, uncovering
  // it left-to-right — an ink-stroke reveal without needing traced SVG paths.
  const maskWidth = useSharedValue(100);
  const wordmarkOpacity = useSharedValue(1);
  const wordmarkTranslateY = useSharedValue(0);
  const circleOpacity = useSharedValue(0);
  const circleScale = useSharedValue(0.001);
  const screenOpacity = useSharedValue(1);

  const [expandComplete, setExpandComplete] = useState(false);

  useEffect(() => {
    maskWidth.value = withTiming(0, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) });

    const toSettle = REVEAL_MS + HOLD_MS;
    // The wordmark fades as the circle appears in its place...
    wordmarkOpacity.value = withDelay(toSettle, withTiming(0, { duration: SETTLE_MS }));
    wordmarkTranslateY.value = withDelay(toSettle, withTiming(-10, { duration: SETTLE_MS }));
    circleOpacity.value = withDelay(toSettle, withTiming(1, { duration: SETTLE_MS }));

    // ...then it ripples straight out from nothing to full-screen cover in one
    // continuous motion — no held "small circle" beat, and no decelerating
    // tail at the end either — constant speed all the way through reads as
    // quicker/peppier than an eased-out curve that lingers as it finishes.
    circleScale.value = withDelay(
      toSettle,
      withTiming(COVER_SCALE, { duration: RIPPLE_MS, easing: Easing.linear }, finished => {
        if (finished) runOnJS(setExpandComplete)(true);
      })
    );
  }, []);

  useEffect(() => {
    if (!ready || !expandComplete) return;
    screenOpacity.value = withTiming(0, { duration: 300 }, finished => {
      if (finished) runOnJS(onFinished)();
    });
  }, [ready, expandComplete]);

  const maskStyle = useAnimatedStyle(() => ({
    width: `${maskWidth.value}%`,
  }));

  const penTipStyle = useAnimatedStyle(() => ({
    right: `${maskWidth.value}%`,
    opacity: maskWidth.value > 0 && maskWidth.value < 100 ? 1 : 0,
  }));

  const wordmarkAnimStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkTranslateY.value }],
  }));

  const circleAnimStyle = useAnimatedStyle(() => ({
    opacity: circleOpacity.value,
    transform: [{ scale: circleScale.value }],
  }));

  const screenAnimStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
        { alignItems: 'center', justifyContent: 'center', backgroundColor: WARM_BG_COLOR },
        screenAnimStyle,
      ]}>
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 120, height: 60 }}>
        <Animated.View style={[{ position: 'relative' }, wordmarkAnimStyle]}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 40, color: '#1c1917', letterSpacing: 0.5 }}>
            {WORDMARK}
          </Text>
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: 0, bottom: 0, right: 0, backgroundColor: WARM_BG_COLOR },
              maskStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: 2, bottom: 2, width: 3, borderRadius: 2, backgroundColor: COLORS.primary },
              penTipStyle,
            ]}
          />
        </Animated.View>

        <Animated.View
          style={[
            {
              position: 'absolute', width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2,
              backgroundColor: COLORS.primary,
            },
            circleAnimStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
}
