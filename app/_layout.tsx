import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';
import 'react-native-reanimated';
import '../global.css';

import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/notifications';
import { syncAllReminderNotifications } from '@/lib/reminder-notifications';
import { posthog } from '@/lib/posthog';
import { markReminderOpened } from '@/lib/reminder-attribution';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { WarmBackground } from '@/components/warm-background';
import { LaunchScreen } from '@/components/launch-screen';
import { AppLockScreen } from '@/components/app-lock-screen';
import { UpdateBanner } from '@/components/update-banner';
import { syncPendingEntries } from '@/lib/offline-entries';
import { hasSeenPrivacyIntro } from '@/lib/privacy-intro';
import {
  rememberUserId, getRememberedUserId, forgetRememberedUser,
  cacheOnboardingComplete, getCachedOnboardingComplete, cacheAppLock, getCachedAppLock,
} from '@/lib/offline-session';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

const PUBLIC_ROUTES = ['log-in', 'sign-up', 'forgot-password', 'reset-password'];
const PRIVATE_ROUTES = ['profile', 'entry', 'digest', 'monthly-digest', 'notifications', 'export', 'therapist-invite', 'chat', 'reminder', 'onboarding', 'prompt-themes', 'prompt-theme', 'theme-insight', 'search-overlay', 'search-onboarding', 'pursuits-onboarding', 'reflection-settings', 'app-lock', 'help'];

function identifyPostHogUser(session: Session) {
  if (!posthog || !session.user.id) return;

  // User id only: no email or name goes to analytics.
  posthog.identify(session.user.id);
}

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

    if (!session) {
      // New people see how their data is handled before anything else, once.
      if (currentRoute === 'privacy-intro') return;
      hasSeenPrivacyIntro().then(seen => {
        if (!seen) router.replace('/privacy-intro');
        else if (!inPublicRoute) router.replace('/log-in');
      });
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
  rememberUserId(userId);
  const { data, error } = await supabase.from('users').select('onboarding_complete, force_onboarding').eq('id', userId).single();
  // No connection (or the server is down): don't send someone who has
  // finished onboarding back through it. PGRST116 just means "no row yet",
  // which is a genuinely new person.
  if (error && error.code !== 'PGRST116') return (await getCachedOnboardingComplete(userId)) ?? true;
  // force_onboarding is a persistent testing switch — while it's on,
  // onboarding shows every launch regardless of whether it's actually been
  // completed, so it doesn't "stick" as done the moment you finish it once.
  if (data?.force_onboarding === true) return false;
  const complete = data?.onboarding_complete === true;
  cacheOnboardingComplete(userId, complete);
  return complete;
}

// An expired access token can't be refreshed without a connection, so supabase
// hands back no session even though the person is still signed in on this
// phone. Keep them in, working locally, until the connection returns and the
// session refreshes itself.
async function offlineSession(error: { name?: string } | null): Promise<Session | null> {
  if (error?.name !== 'AuthRetryableFetchError') return null;
  const userId = await getRememberedUserId();
  if (!userId) return null;
  return { user: { id: userId }, access_token: '', refresh_token: '', expires_in: 0, token_type: 'bearer' } as unknown as Session;
}

type AppLockSettings = { enabled: boolean; hash: string | null; salt: string | null };

async function loadAppLockSettings(userId: string): Promise<AppLockSettings> {
  const { data, error } = await supabase
    .from('users')
    .select('app_lock_enabled, app_lock_pin_hash, app_lock_pin_salt')
    .eq('id', userId)
    .single();
  // Offline, keep using the last known lock so going offline can't switch the
  // PIN off.
  if (error && error.code !== 'PGRST116') {
    return (await getCachedAppLock(userId)) ?? { enabled: false, hash: null, salt: null };
  }
  const settings: AppLockSettings = {
    enabled: data?.app_lock_enabled === true && !!data?.app_lock_pin_hash && !!data?.app_lock_pin_salt,
    hash: data?.app_lock_pin_hash ?? null,
    salt: data?.app_lock_pin_salt ?? null,
  };
  cacheAppLock(userId, settings);
  return settings;
}

function handleNotificationResponse(router: ReturnType<typeof useRouter>, response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data;
  const themeId = data?.prompt_theme_id;

  // Journaling reminders carry a reminderId (scheduled on the phone) or a
  // prompt_theme_id (server push); count the tap once.
  const isReminder = Boolean(data?.reminderId) || 'prompt_theme_id' in (data ?? {});
  if (isReminder && markReminderOpened(response.notification.request.identifier)) {
    posthog?.capture('reminder_opened', {
      has_prompt_theme: Boolean(themeId),
      local_hour: new Date().getHours(),
    });
  }
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
  const [appLock, setAppLock] = useState<AppLockSettings | undefined>(undefined);
  const [locked, setLocked] = useState(true);
  const appStateRef = useRef(AppState.currentState);
  const identifiedUserIdRef = useRef<string | null>(null);
  const router = useRouter();
  const navigationState = useRootNavigationState();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: stored }, error: sessionError }) => {
      const session = stored ?? (await offlineSession(sessionError));
      setSession(session);
      if (session?.user?.id) {
        if (identifiedUserIdRef.current !== session.user.id) {
          identifyPostHogUser(session);
          identifiedUserIdRef.current = session.user.id;
        }
        const complete = await loadOnboardingComplete(session.user.id);
        setOnboardingComplete(complete);
        // Already-onboarded users keep getting registered automatically on app open,
        // as before. New users get this deferred to the end of the onboarding flow.
        if (complete) {
          registerForPushNotifications(session.user.id);
          syncAllReminderNotifications();
          syncPendingEntries();
        }
        const lock = await loadAppLockSettings(session.user.id);
        setAppLock(lock);
        setLocked(lock.enabled);
      } else {
        posthog?.reset();
        identifiedUserIdRef.current = null;
        setOnboardingComplete(undefined);
        setAppLock(undefined);
        setLocked(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY' && navigationState?.key) {
        router.replace('/reset-password');
      }
      if (event === 'SIGNED_IN' && session?.user?.id) {
        if (identifiedUserIdRef.current !== session.user.id) {
          identifyPostHogUser(session);
          identifiedUserIdRef.current = session.user.id;
        }
        const complete = await loadOnboardingComplete(session.user.id);
        setOnboardingComplete(complete);
        if (complete) {
          registerForPushNotifications(session.user.id);
          syncAllReminderNotifications();
        }
        const lock = await loadAppLockSettings(session.user.id);
        setAppLock(lock);
        setLocked(lock.enabled);
      }
      if (event === 'SIGNED_OUT') {
        forgetRememberedUser();
        posthog?.reset();
        identifiedUserIdRef.current = null;
        setOnboardingComplete(undefined);
        setAppLock(undefined);
        setLocked(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigationState?.key]);

  // Simple app lock: re-lock the instant the app leaves the foreground, so
  // returning from the background (or a cold relaunch) always asks for the
  // PIN again rather than trusting a grace period.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current === 'active' && next !== 'active' && appLock?.enabled) {
        setLocked(true);
      }
      // Local reminder notifications are only scheduled a rolling window
      // ahead — top it up on every foreground so a long-backgrounded app
      // doesn't run out of upcoming occurrences.
      if (appStateRef.current !== 'active' && next === 'active' && session && onboardingComplete) {
        syncAllReminderNotifications();
        syncPendingEntries();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [appLock?.enabled, session, onboardingComplete]);

  if (!fontsLoaded) {
    return <WarmBackground />;
  }

  const app = (
    <OnboardingContext.Provider value={setOnboardingComplete}>
      <AuthGuard session={session} onboardingComplete={onboardingComplete} />
      <NotificationDeepLinkHandler />
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
      <UpdateBanner />
      {session && appLock?.enabled && locked && appLock.hash && appLock.salt && (
        <AppLockScreen
          pinHash={appLock.hash}
          pinSalt={appLock.salt}
          onUnlock={(newHash, newSalt) => {
            if (newHash && newSalt) setAppLock({ enabled: true, hash: newHash, salt: newSalt });
            setLocked(false);
          }}
        />
      )}
      {showLaunch && (
        <LaunchScreen
          ready={session !== undefined}
          onFinished={() => setShowLaunch(false)}
        />
      )}
    </OnboardingContext.Provider>
  );

  return posthog ? <PostHogProvider client={posthog}>{app}</PostHogProvider> : app;
}
