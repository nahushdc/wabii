import * as SecureStore from 'expo-secure-store';

const KEY = 'privacy_intro_seen';

// Set this once a real privacy policy page exists; until then the policy link
// on the privacy screen stays hidden rather than pointing nowhere.
export const PRIVACY_POLICY_URL = '';

// Remembered for the session too, so a storage hiccup can never trap someone
// in a loop of being sent back to this screen.
let seenThisSession = false;

export async function hasSeenPrivacyIntro(): Promise<boolean> {
  if (seenThisSession) return true;
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markPrivacyIntroSeen(): Promise<void> {
  seenThisSession = true;
  try {
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    // Kept in memory for this launch; it will simply show once more next time.
  }
}
