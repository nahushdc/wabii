import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PUBLIC_ROUTES = ['log-in', 'sign-up', 'forgot-password', 'reset-password'];

function AuthGuard({ session }: { session: Session | null | undefined }) {
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || session === undefined) return;

    const currentRoute = segments[0] as string;
    const inTabs = currentRoute === '(tabs)';
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY' && navigationState?.key) {
        router.replace('/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigationState?.key]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthGuard session={session} />
      <Slot />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
