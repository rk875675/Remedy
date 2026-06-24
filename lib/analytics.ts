import PostHog from 'posthog-react-native';

const posthog = new PostHog(
  process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  { host: 'https://us.i.posthog.com' }
);

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  posthog.identify(userId, traits as Parameters<typeof posthog.identify>[1]);
}

export function trackEvent(event: string, props?: Record<string, unknown>) {
  if (!process.env.EXPO_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, props as Parameters<typeof posthog.capture>[1]);
}

export function resetAnalytics() {
  posthog.reset();
}
