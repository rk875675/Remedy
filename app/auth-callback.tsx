import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { colors } from '../constants/colors';

// Tracks token_hashes we've already consumed. getInitialURL() can hand back a stale
// recovery/confirm link on relaunch, and the screen can remount — neither must
// re-consume (or re-fail) the same token.
const handledTokens = new Set<string>();

// Deep-link landing for email confirmation / password reset. The HTTPS auth-bridge
// 302s here (remedy://auth-callback?token_hash=…&type=…). verifyOtp is called HERE and
// only here, so email prefetchers that merely follow the bridge link don't burn the token.
export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;

    const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : undefined;
    const type = typeof params.type === 'string' ? (params.type as EmailOtpType) : undefined;

    if (!tokenHash || !type) {
      router.replace('/(onboarding)');
      return;
    }
    if (handledTokens.has(tokenHash)) return;
    handledTokens.add(tokenHash);
    ran.current = true;

    (async () => {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) {
        router.replace('/(auth)/sign-in');
        return;
      }
      // Recovery → let the user set a new password. Other types (signup/email_change)
      // just establish the session; hand back to the root navigator to route.
      router.replace(type === 'recovery' ? '/reset-password' : '/');
    })();
  }, [params.token_hash, params.type]);

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
