import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type PushRegistrationResult = { success: true } | { success: false; error: string };

export async function registerForPushNotifications(userId: string): Promise<PushRegistrationResult> {
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

    if (finalStatus !== 'granted') return { success: false, error: `Notification permission is "${finalStatus}", not granted.` };

    // getExpoPushTokenAsync requires a projectId — only works in production builds,
    // not Expo Go. Surface the real error instead of swallowing it, since a
    // silent failure here is otherwise impossible to diagnose from a device.
    let token: string | null = null;
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for a push token.')), 8000));
      const tokenData = await Promise.race([Notifications.getExpoPushTokenAsync(), timeout]);
      token = tokenData.data;
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Could not get a push token.' };
    }

    const { error: upsertErr } = await supabase.from('users').upsert({ id: userId, push_token: token, timezone });
    if (upsertErr) return { success: false, error: `Got a push token but couldn't save it: ${upsertErr.message}` };

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Unknown error.' };
  }
}
