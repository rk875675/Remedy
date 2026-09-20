import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { supabase } from '../lib/supabase';
import { validatePromoCode, redeemPromoCode } from '../lib/promoCodes';
import { setPendingPromo } from '../lib/pendingPromo';
import { setPendingPurchase } from '../lib/pendingPurchase';
import {
  IAP_AVAILABLE,
  presentAppleOfferCodeSheet,
  restoreRemedyTransaction,
} from '../lib/iap';
import { colors, serifFont } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';

// One replaceable copy block — placeholder copy per spec, keep together.
export const PROMO_COPY = {
  title: 'Enter your code',
  placeholder: 'Code',
  submit: 'Apply code',
  cancel: 'Cancel',
  invalid: 'This code is not valid.',
  network: 'Could not check your code. Please try again.',
  alreadyUsed: 'This code has already been used.',
  alreadyEntitled: 'You already have an active subscription.',
  redeemFailed: 'Could not redeem your code. Please try again.',
  redeemTitle: 'Redeem in the App Store',
  redeemInstructions:
    "Tap the code to copy it, then tap Continue to open Apple's Redeem Code screen.",
  codeCopied: 'Code copied',
  tapToCopy: 'Tap to copy',
  continue: 'Continue',
  done: 'Done',
} as const;

const SHEET_MIN_HEIGHT = Math.round(Dimensions.get('window').height * 0.52);

// RN core Clipboard is deprecated (extracted to a community package) but still
// present in this RN version. Guarded so a future removal degrades to a no-op —
// the code stays visible on screen either way.
function copyToClipboard(text: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Clipboard } = require('react-native');
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after access was granted (fresh redeem, replay, or ALREADY_ENTITLED). */
  onAccessGranted?: () => void;
};

export function PromoCodeSheet({ visible, onClose, onAccessGranted }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { refreshPremium } = usePremium();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [pane, setPane] = useState<'input' | 'apple'>('input');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sheetOpened, setSheetOpened] = useState(false);

  function reset() {
    setPane('input');
    setCode('');
    setBusy(false);
    setError(null);
    setCopied(false);
    setSheetOpened(false);
  }

  // Fade the dim, then focus — avoids the pageSheet + keyboard fight that felt choppy.
  useEffect(() => {
    if (!visible) {
      const clear = setTimeout(reset, 220);
      return () => clearTimeout(clear);
    }
    const focus = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(focus);
  }, [visible]);

  function close() {
    onClose();
  }

  function grantAccess() {
    onClose();
    onAccessGranted?.();
  }

  async function redeemAsSignedInUser(validatedCode: string) {
    const result = await redeemPromoCode(validatedCode);
    if (result.redeemed) {
      await refreshPremium();
      grantAccess();
      return;
    }
    switch (result.error) {
      case 'ALREADY_ENTITLED':
        // Counts as access — the user already has a live subscription.
        await refreshPremium();
        Alert.alert('', PROMO_COPY.alreadyEntitled);
        grantAccess();
        return;
      case 'CODE_FULLY_REDEEMED':
        setError(PROMO_COPY.alreadyUsed);
        return;
      case 'INVALID_CODE':
        setError(PROMO_COPY.invalid);
        return;
      default:
        setError(PROMO_COPY.redeemFailed);
        return;
    }
  }

  async function handleApply() {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    try {
      const validation = await validatePromoCode(trimmed);

      // Network/server failure: show the network copy. Never fall through to the
      // Apple pane on anything but an explicit { valid: false }.
      if (validation.valid === null) {
        setError(PROMO_COPY.network);
        return;
      }

      if (validation.valid === false) {
        if (validation.alreadyUsed) {
          setError(PROMO_COPY.alreadyUsed);
          return;
        }
        // Not a backend code — possibly an Apple offer code. If Apple's sheet
        // cannot present here (not iOS / no IAP), it is simply an invalid code;
        // never mention Apple or a second system.
        if (Platform.OS !== 'ios' || !IAP_AVAILABLE) {
          setError(PROMO_COPY.invalid);
          return;
        }
        setPane('apple');
        return;
      }

      // Live backend code.
      if (user) {
        await redeemAsSignedInUser(validation.code);
        return;
      }

      // Anonymous: stash, then create the account. building-plan redeems the stash
      // after signup (redeem replaces purchase-sync — no Apple purchase happened).
      await setPendingPromo({
        code: validation.code,
        type: validation.type,
        months: validation.months,
        weeks: validation.weeks,
        minutes: validation.minutes,
        creatorName: validation.creator.name,
        creatorSlug: validation.creator.slug,
        validatedAt: new Date().toISOString(),
      });
      onClose();
      router.replace(
        `/(auth)/sign-in?mode=signup&promo=${encodeURIComponent(validation.code)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  function handleCopy() {
    if (copyToClipboard(code.trim())) setCopied(true);
  }

  async function handleContinue() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const opened = await presentAppleOfferCodeSheet();
      if (!opened) {
        // Sheet unavailable or the native call threw — same generic invalid copy.
        setError(PROMO_COPY.invalid);
        return;
      }
      setSheetOpened(true);
    } finally {
      setBusy(false);
    }
  }

  // After Apple's sheet: sync StoreKit and only claim success if a real
  // transaction confirms. Otherwise stay on this pane (the user may have
  // dismissed Apple's sheet without redeeming).
  async function handleDone() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const tx = await restoreRemedyTransaction();
      if (!tx) return; // No transaction — stay on the pane, claim nothing.

      if (!user) {
        // Same handoff as a paywall purchase: stash the transaction, create the
        // account, building-plan verifies it server-side.
        await setPendingPurchase(tx);
        onClose();
        router.replace('/(auth)/sign-in?mode=signup');
        return;
      }

      const { data } = await supabase.functions.invoke<{ success?: boolean }>(
        'restore-purchases',
        {
          body: {
            originalTransactionId: tx.originalTransactionId,
            signedTransaction: tx.jws,
          },
          headers: { 'Idempotency-Key': `restore_${user.id}_${tx.originalTransactionId}` },
        },
      );
      if (data?.success) {
        await refreshPremium();
        grantAccess();
      }
      // Not confirmed → stay on the pane.
    } catch {
      // Sync failed — stay on the pane.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : close}
          accessibilityRole="button"
          accessibilityLabel={PROMO_COPY.cancel}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.sheet,
              {
                minHeight: SHEET_MIN_HEIGHT,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              },
            ]}
          >
            <View style={styles.handle} />
            {pane === 'input' ? (
              <View style={styles.body}>
                <Text style={styles.title}>{PROMO_COPY.title}</Text>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={code}
                  onChangeText={(t) => {
                    setCode(t);
                    setError(null);
                  }}
                  placeholder={PROMO_COPY.placeholder}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus={false}
                  maxLength={64}
                  editable={!busy}
                  onSubmitEditing={() => void handleApply()}
                  returnKeyType="go"
                />
                {error && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity
                  style={[styles.primaryBtn, (!code.trim() || busy) && styles.btnDisabled]}
                  onPress={() => void handleApply()}
                  disabled={!code.trim() || busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{PROMO_COPY.submit}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={close} disabled={busy}>
                  <Text style={styles.cancelText}>{PROMO_COPY.cancel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.body}>
                <Text style={styles.title}>{PROMO_COPY.redeemTitle}</Text>
                <Text style={styles.instructions}>{PROMO_COPY.redeemInstructions}</Text>
                <Pressable style={styles.codeBox} onPress={handleCopy}>
                  <Text style={styles.codeText}>{code.trim()}</Text>
                  <Text style={styles.copyHint}>
                    {copied ? PROMO_COPY.codeCopied : PROMO_COPY.tapToCopy}
                  </Text>
                </Pressable>
                {error && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  onPress={() => void handleContinue()}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{PROMO_COPY.continue}</Text>
                  )}
                </TouchableOpacity>
                {sheetOpened && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => void handleDone()}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnText}>{PROMO_COPY.done}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.cancelBtn} onPress={close} disabled={busy}>
                  <Text style={styles.cancelText}>{PROMO_COPY.cancel}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 30, 0.4)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: 24,
    paddingTop: 10,
    ...shadows.high,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.circle,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  body: {
    flexGrow: 1,
  },
  title: {
    fontFamily: serifFont,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  instructions: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  codeBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingVertical: 18,
    marginBottom: 12,
  },
  codeText: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  copyHint: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
  },
  error: {
    color: colors.secondary,
    fontSize: 14,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 10,
  },
  secondaryBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
});
