import * as SecureStore from 'expo-secure-store';

// What the app needs to know about the signed-in person when there is no
// connection. Their account stays signed in on the phone, but supabase can't
// refresh an expired access token offline and then reports no session at all,
// which would otherwise look like being signed out.

const USER_KEY = 'wabii_last_user_id';
const ONBOARDING_KEY = 'wabii_onboarding_cache';
const LOCK_KEY = 'wabii_app_lock_cache';

async function read<T>(key: string): Promise<T | null> {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // Best effort: without a cache the app simply needs a connection at launch.
  }
}

export function rememberUserId(userId: string): Promise<void> {
  return write(USER_KEY, userId);
}

export function getRememberedUserId(): Promise<string | null> {
  return read<string>(USER_KEY);
}

// Called on sign-out, so the next person on this phone starts clean.
export async function forgetRememberedUser(): Promise<void> {
  await Promise.all([USER_KEY, ONBOARDING_KEY, LOCK_KEY].map(k => SecureStore.deleteItemAsync(k).catch(() => {})));
}

export function cacheOnboardingComplete(userId: string, complete: boolean): Promise<void> {
  return write(ONBOARDING_KEY, { userId, complete });
}

export async function getCachedOnboardingComplete(userId: string): Promise<boolean | null> {
  const cached = await read<{ userId: string; complete: boolean }>(ONBOARDING_KEY);
  return cached && cached.userId === userId ? cached.complete : null;
}

export type CachedAppLock = { enabled: boolean; hash: string | null; salt: string | null };

export function cacheAppLock(userId: string, settings: CachedAppLock): Promise<void> {
  return write(LOCK_KEY, { userId, ...settings });
}

export async function getCachedAppLock(userId: string): Promise<CachedAppLock | null> {
  const cached = await read<{ userId: string } & CachedAppLock>(LOCK_KEY);
  return cached && cached.userId === userId ? { enabled: cached.enabled, hash: cached.hash, salt: cached.salt } : null;
}
