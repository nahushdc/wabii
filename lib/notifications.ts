import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export async function registerForPushNotifications(userId: string) {
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
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
      const tokenData = await Promise.race([Notifications.getExpoPushTokenAsync(), timeout]);
      token = tokenData.data;
    } catch {
      return; // Expo Go, offline, or timed out — skip token registration
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
