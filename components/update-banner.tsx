import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import * as Updates from 'expo-updates';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';

// Screens where a restart could cost someone their words, so the banner waits.
const QUIET_PATHS = ['/new-entry', '/chat', '/onboarding', '/log-in', '/sign-up'];

// Over-the-air updates download in the background but only apply on the next
// cold start. This checks on every foreground (not just launch) and, once an
// update is downloaded, offers a one-tap restart instead of making people
// close and reopen the app twice.
export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    async function check() {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          setDismissed(false);
        }
      } catch {
        // Offline or the server's unreachable: try again next foreground.
      } finally {
        checkingRef.current = false;
      }
    }

    check();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') check();
    });
    return () => sub.remove();
  }, []);

  const quiet = QUIET_PATHS.some(p => pathname.startsWith(p));
  if (!Updates.isEnabled || !isUpdatePending || dismissed || quiet) return null;

  async function restart() {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
    }
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutUp.duration(200)}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, zIndex: 50 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#2A2530', borderRadius: 16, paddingVertical: 10, paddingLeft: 14, paddingRight: 10,
        shadowColor: '#1c1917', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
      }}>
        <Feather name="download-cloud" size={17} color="#F5A889" />
        <Text style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13.5, color: '#ffffff' }}>
          A new version is ready
        </Text>
        <Pressable
          onPress={restart}
          disabled={restarting}
          accessibilityRole="button"
          style={{ backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 7 }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#ffffff' }}>
            {restarting ? 'Restarting…' : 'Restart'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} hitSlop={10} accessibilityLabel="Dismiss" style={{ padding: 4 }}>
          <Feather name="x" size={16} color="#c9c2ce" />
        </Pressable>
      </View>
    </Animated.View>
  );
}
