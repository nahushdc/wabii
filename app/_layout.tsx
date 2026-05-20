import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Notifications from 'expo-notifications';
import { Platform, View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

const PUBLIC_ROUTES = ['log-in', 'sign-up', 'forgot-password', 'reset-password'];
const PRIVATE_ROUTES = ['profile', 'entry', 'digest', 'notifications', 'export', 'therapist-invite'];

async function registerForPushNotifications(userId: string) {
  try {
    // Save timezone regardless of notification support
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await supabase.from('users').upsert({ id: userId, timezone });

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    // getExpoPushTokenAsync requires a projectId — only works in production builds
    // Skip silently in Expo Go
    let token: string | null = null;
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      token = tokenData.data;
    } catch {
      return; // Expo Go — skip token registration
    }

    await supabase.from('users').upsert({ id: userId, push_token: token, timezone });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
  } catch (e) {
    console.log('Push notification setup error:', e);
  }
}

function AuthGuard({ session }: { session: Session | null | undefined }) {
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || session === undefined) return;

    const currentRoute = segments[0] as string;
    const inPublicRoute = PUBLIC_ROUTES.includes(currentRoute);

    if (!session && !inPublicRoute) {
      router.replace('/log-in');
    } else if (session && inPublicRoute && currentRoute !== 'reset-password') {
      router.replace('/(tabs)');
    }
  }, [session, segments, navigationState?.key]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const navigationState = useRootNavigationState();

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        registerForPushNotifications(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY' && navigationState?.key) {
        router.replace('/reset-password');
      }
      if (event === 'SIGNED_IN' && session?.user?.id) {
        registerForPushNotifications(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigationState?.key]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#faf9f7' }} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthGuard session={session} />
      <Slot />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
