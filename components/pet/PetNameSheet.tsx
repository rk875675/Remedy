import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, serifFont } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import type { PetStage } from '../../constants/petImages';
import {
  PET_MEET_TITLE,
  PET_NAME_INVALID,
  PET_NAME_LABEL,
  PET_NAME_MAX_LENGTH,
  PET_NAME_PLACEHOLDER,
} from '../../constants/petLines';
import type { PetState } from '../../lib/pet';
import { setPetName } from '../../lib/petApi';
import { PetBadge } from './PetBadge';

const SAVE_FAILED = 'Could not save. Try again.';

type Props = {
  visible: boolean;
  stage: PetStage;
  onNamed: (state: PetState) => void;
  onDismiss: () => void;
};

/** One-time naming sheet on Home for pets created before onboarding named them. */
export function PetNameSheet({ visible, stage, onNamed, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<'invalid' | 'failed' | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= PET_NAME_MAX_LENGTH;

  useEffect(() => {
    if (visible) return;
    const clear = setTimeout(() => {
      savingRef.current = false;
      setName('');
      setSaving(false);
      setError(null);
    }, 220);
    return () => clearTimeout(clear);
  }, [visible]);

  // Small phones cannot fit the full badge, the field and both buttons above the keyboard.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardOpen(true);
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  async function handleSave() {
    if (!valid || savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setSaving(true);
    const result = await setPetName(trimmed);
    savingRef.current = false;
    setSaving(false);
    if (result.ok) {
      onNamed(result.state);
      return;
    }
    setError(result.reason);
  }

  function dismiss() {
    if (savingRef.current) return;
    onDismiss();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        />
          <View
            style={[
              styles.sheet,
              {
                // A KeyboardAvoidingView inside a Modal does not lift this sheet.
                // Android already resizes the window, so only iOS needs the inset.
                marginBottom: Platform.OS === 'ios' ? keyboardHeight : 0,
                paddingBottom: keyboardHeight > 0 ? 16 : Math.max(insets.bottom, 16) + 8,
              },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.badgeWrap}>
              <PetBadge
                stage={stage}
                mood={valid ? 'ready' : 'idle'}
                size={keyboardOpen && height < 720 ? 84 : 140}
              />
            </View>
            <Text style={styles.title}>{PET_MEET_TITLE}</Text>
            <Text style={styles.label}>{PET_NAME_LABEL}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError(null);
              }}
              placeholder={PET_NAME_PLACEHOLDER}
              placeholderTextColor={colors.textTertiary}
              maxLength={PET_NAME_MAX_LENGTH}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
            />
            {error && (
              <Text style={styles.error}>{error === 'invalid' ? PET_NAME_INVALID : SAVE_FAILED}</Text>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, (!valid || saving) && styles.btnDisabled]}
              onPress={() => void handleSave()}
              disabled={!valid || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Save name</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={dismiss} disabled={saving}>
              <Text style={styles.cancelText}>Not now</Text>
            </TouchableOpacity>
          </View>
      </View>
    </Modal>
  );
}

const DISMISSED_PREFIX = 'remedy.petNamePromptDismissed.';

export async function hasDismissedPetNamePrompt(userId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(DISMISSED_PREFIX + userId);
    return value === '1';
  } catch {
    return false;
  }
}

export async function markPetNamePromptDismissed(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_PREFIX + userId, '1');
  } catch {
    // Best-effort: the prompt may show once more next launch.
  }
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
  badgeWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: serifFont,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 17,
    paddingHorizontal: 16,
    marginBottom: 12,
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
