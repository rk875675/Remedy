import { ConfigContext, ExpoConfig } from 'expo/config';

// Google Sign-In needs the iOS "reversed client ID" URL scheme registered in
// Info.plist. We derive it from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID so the value
// stays in env (.env.local locally, EAS env vars on build servers) rather than
// hardcoded in source. app.json remains the static base config; this dynamic
// config merges in the Google Sign-In plugin on top of it.
function googleIosUrlScheme(): string | undefined {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!clientId) return undefined;
  const reversed = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${reversed}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = googleIosUrlScheme();
  const plugins = [...(config.plugins ?? [])];

  if (iosUrlScheme) {
    plugins.push([
      '@react-native-google-signin/google-signin',
      { iosUrlScheme },
    ]);
  }

  return {
    ...config,
    name: config.name ?? 'remedy',
    slug: config.slug ?? 'remedy',
    plugins,
  };
};
