import { createContext, useContext, useEffect, useState } from 'react';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/notifications';
import { Platform } from 'react-native';
import { WarmBackground } from '@/components/warm-background';
import { LaunchScreen } from '@/components/launch-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

const PUBLIC_ROUTES = ['log-in', 'sign-up', 'forgot-password', 'reset-password'];
const PRIVATE_ROUTES = ['profile', 'entry', 'digest', 'monthly-digest', 'notifications', 'export', 'therapist-invite', 'chat', 'reminder', 'onboarding', 'prompt-themes', 'prompt-theme', 'theme-insight', 'search-overlay', 'search-onboarding', 'pursuits-onboarding', 'reflection-settings', 'help'];

const OnboardingContext = createContext<(complete: boolean) => void>(() => {});
export function useSetOnboardingComplete() {
  return useContext(OnboardingContext);
}

function AuthGuard({ session, onboardingComplete }: { session: Session | null | undefined; onboardingComplete: boolean | undefined }) {
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || session === undefined) return;
    if (session && onboardingComplete === undefined) return; // still loading onboarding status

    const currentRoute = segments[0] as string;
    const inPublicRoute = PUBLIC_ROUTES.includes(currentRoute);

    if (!session && !inPublicRoute) {
      router.replace('/log-in');
    } else if (session && inPublicRoute && currentRoute !== 'reset-password') {
      router.replace('/(tabs)');
    } else if (session && onboardingComplete === false && currentRoute !== 'onboarding') {
      router.replace('/onboarding');
    } else if (session && onboardingComplete === true && currentRoute === 'onboarding') {
      router.replace('/(tabs)');
    }
  }, [session, onboardingComplete, segments, navigationState?.key]);

  return null;
}

async function loadOnboardingComplete(userId: string): Promise<boolean> {
  const { data } = await supabase.from('users').select('onboarding_complete').eq('id', userId).single();
  return data?.onboarding_complete === true;
}

function handleNotificationResponse(router: ReturnType<typeof useRouter>, response: Notifications.NotificationResponse) {
  const themeId = response.notification.request.content.data?.prompt_theme_id;
  if (themeId) {
    router.push(`/(tabs)/new-entry?themeId=${themeId}`);
  }
}

function NotificationDeepLinkHandler() {
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || Platform.OS === 'web') return;

    // Tapping a notification while the app is running/backgrounded
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationResponse(router, response);
    });

    // Tapping a notification that launched the app from fully closed — the
    // listener above doesn't fire retroactively for that case
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationResponse(router, response);
    });

    return () => subscription.remove();
  }, [navigationState?.key]);

  return null;
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | undefined>(undefined);
  const [showLaunch, setShowLaunch] = useState(true);
  const router = useRouter();
  const navigationState = useRootNavigationState();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        const complete = await loadOnboardingComplete(session.user.id);
        setOnboardingComplete(complete);
        // Already-onboarded users keep getting registered automatically on app open,
        // as before. New users get this deferred to the end of the onboarding flow.
        if (complete) registerForPushNotifications(session.user.id);
      } else {
        setOnboardingComplete(undefined);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY' && navigationState?.key) {
        router.replace('/reset-password');
      }
      if (event === 'SIGNED_IN' && session?.user?.id) {
        const complete = await loadOnboardingComplete(session.user.id);
        setOnboardingComplete(complete);
        if (complete) registerForPushNotifications(session.user.id);
      }
      if (event === 'SIGNED_OUT') {
        setOnboardingComplete(undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigationState?.key]);

  if (!fontsLoaded) {
    return <WarmBackground />;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <OnboardingContext.Provider value={setOnboardingComplete}>
        <AuthGuard session={session} onboardingComplete={onboardingComplete} />
        <NotificationDeepLinkHandler />
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
        {showLaunch && (
          <LaunchScreen
            ready={session !== undefined}
            onFinished={() => setShowLaunch(false)}
          />
        )}
      </OnboardingContext.Provider>
    </ThemeProvider>
  );
}
