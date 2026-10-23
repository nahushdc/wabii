import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '@/lib/auth';

// Apple's own button (required look and wording per their guidelines). Renders
// nothing on devices where Sign in with Apple isn't available (e.g. Android).
export function AppleSignInButton({ onError, marginBottom = 12 }: { onError: (message: string) => void; marginBottom?: number }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  return (
    <View style={{ marginBottom }}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={16}
        style={{ width: '100%', height: 52 }}
        onPress={async () => {
          const { error } = await signInWithApple();
          if (error) onError(error);
        }}
      />
    </View>
  );
}
