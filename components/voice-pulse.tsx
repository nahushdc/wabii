import { View, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
  FadeIn, FadeOut, SharedValue, interpolateColor, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

const BAR_COUNT = 30;
const BAR_WIDTH = 3.5;
const MIN_BAR = 3.5; // at silence a bar is a round dot
const MAX_BAR = 28;
const SAMPLE_MS = 70; // how often the wave scrolls by one bar

function WaveBar({ index, history }: { index: number; history: SharedValue<number[]> }) {
  const style = useAnimatedStyle(() => {
    const level = history.value[index] ?? 0;
    return {
      height: withTiming(MIN_BAR + level * (MAX_BAR - MIN_BAR), { duration: 80 }),
      backgroundColor: interpolateColor(level, [0.05, 0.3], ['#c4b9b0', '#57534e']),
    };
  });
  return <Animated.View style={[{ width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2 }, style]} />;
}

// A scrolling record of how loud you've been: each tick pushes the current
// (smoothed) mic level in on the right and shifts everything left, so speech
// shows up as tall bars travelling across and silence as a line of dots.
// Everything runs on the UI thread — the mic level is a shared value.
function LiveWaveform({ amplitude }: { amplitude: SharedValue<number> }) {
  const history = useSharedValue<number[]>(new Array(BAR_COUNT).fill(0));
  const smoothed = useSharedValue(0);
  const elapsed = useSharedValue(0);

  useFrameCallback(info => {
    'worklet';
    // Ease toward the latest reading so the 10Hz mic updates read as a
    // continuous wave instead of stair-steps.
    smoothed.value += (amplitude.value - smoothed.value) * 0.4;
    elapsed.value += info.timeSincePreviousFrame ?? 16;
    if (elapsed.value < SAMPLE_MS) return;
    elapsed.value = 0;
    const next = history.value.slice(1);
    next.push(smoothed.value);
    history.value = next;
  });

  return (
    <View style={{ flex: 1, height: MAX_BAR, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {Array.from({ length: BAR_COUNT }, (_, i) => <WaveBar key={i} index={i} history={history} />)}
    </View>
  );
}

const BUTTON = 44;
const buttonShadow = {
  shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
};

// Dictation control. Idle: a mic button. Tap it and it turns into a live bar —
// cancel (discard what you just dictated), a waveform that moves with your
// voice, and a stop button (keep it). While recording it fills the row it's in.
export function VoiceMicControl({
  isRecording,
  connecting,
  amplitude,
  onStart,
  onStop,
  onCancel,
}: {
  isRecording: boolean;
  connecting: boolean;
  amplitude: SharedValue<number>;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  if (isRecording) {
    return (
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(100)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel dictation"
          style={{
            width: BUTTON - 4, height: BUTTON - 4, borderRadius: (BUTTON - 4) / 2,
            backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', ...buttonShadow,
          }}>
          <Feather name="x" size={18} color="#57534e" />
        </Pressable>

        <LiveWaveform amplitude={amplitude} />

        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
          style={{
            width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2,
            backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...buttonShadow,
          }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: '#ffffff' }} />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Pressable
      onPress={onStart}
      disabled={connecting}
      accessibilityRole="button"
      accessibilityLabel="Dictate with your voice"
      style={{
        width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2,
        backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', ...buttonShadow,
      }}>
      {connecting
        ? <ActivityIndicator color="#a8a29e" size="small" />
        : <Feather name="mic" size={19} color={COLORS.primary} />}
    </Pressable>
  );
}
