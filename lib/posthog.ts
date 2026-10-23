import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

const posthogProjectToken = Constants.expoConfig?.extra?.posthogProjectToken;
const posthogHost = Constants.expoConfig?.extra?.posthogHost;

if (__DEV__ && !posthogProjectToken) {
  console.error(
    'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured',
  );
}

if (__DEV__ && !posthogHost) {
  console.error(
    'POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured',
  );
}

export const posthog =
  posthogProjectToken && posthogHost
    ? new PostHog(posthogProjectToken, {
        host: posthogHost,
        captureAppLifecycleEvents: true,
        errorTracking: {
          autocapture: {
            uncaughtExceptions: true,
            unhandledRejections: true,
          },
        },
        logs: {
          serviceName: 'wabii-mobile',
          serviceVersion: Constants.expoConfig?.version,
          environment: __DEV__ ? 'development' : 'production',
        },
      })
    : undefined;
