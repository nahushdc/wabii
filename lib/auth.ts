import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { posthog } from './posthog';

// Social sign-in can't tell us whether the account is new, so use the account's
// age: created within the last two minutes means this was the sign-up.
async function trackSocialAuth(method: 'google' | 'apple') {
  const { data: { user } } = await supabase.auth.getUser();
  const isNew = user?.created_at ? Date.now() - Date.parse(user.created_at) < 2 * 60 * 1000 : false;
  if (isNew) posthog?.capture('account_signed_up', { signup_method: method });
  else posthog?.capture('user_logged_in', { login_method: method });
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = AuthSession.makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    return { error: error?.message ?? 'Google sign in failed.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    return { error: null };
  }

  // Tokens come back in the URL hash fragment e.g. #access_token=...&refresh_token=...
  const url = result.url;
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex !== -1 ? url.slice(hashIndex + 1) : url.split('?')[1] ?? '';
  const params = new URLSearchParams(fragment);

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    await trackSocialAuth('google');
    return { error: null };
  }

  return { error: 'Could not retrieve session from Google. Please try again.' };
}

// Native "Sign in with Apple". Apple gets a SHA-256 of a random nonce, and
// Supabase gets the raw nonce, so it can confirm the identity token was issued
// for this exact sign-in attempt. Returns `canceled: true` (not an error) when
// the user dismisses the Apple sheet.
export async function signInWithApple(): Promise<{ error: string | null; canceled?: boolean }> {
  try {
    const rawNonce = Array.from(Crypto.getRandomBytes(16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { error: 'Apple did not return an identity token. Please try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { error: error.message };
    await trackSocialAuth('apple');

    // Apple only shares the user's name on the very first sign-in, so keep it.
    const given = credential.fullName?.givenName;
    const family = credential.fullName?.familyName;
    const fullName = [given, family].filter(Boolean).join(' ');
    if (fullName) {
      await supabase.auth.updateUser({ data: { full_name: fullName } });
    }
    return { error: null };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null, canceled: true };
    return { error: e?.message ?? 'Apple sign in failed.' };
  }
}
