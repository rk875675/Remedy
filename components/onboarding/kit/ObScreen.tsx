import React, { useCallback, useId } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import type { LinearGradientProps } from 'react-native-linear-gradient';
import { WarmBackground } from '../WarmBackground';
import { Icon } from './Icon';
import { SegmentedProgress } from './SegmentedProgress';
import { ob } from './tokens';

export type ObScreenProps = {
  /** null or omitted: no progress bar (cold open, loader, plan). */
  chapter?: 1 | 2 | 3 | 4 | null;
  /** 0..1 fill of the current chapter segment. */
  progress?: number;
  /** Omitted: `router.back()` when possible. null: hide the back button. */
  onBack?: (() => void) | null;
  /** Pinned bottom area, usually an `ObFooter`. */
  footer?: React.ReactNode;
  /** Default true. */
  scroll?: boolean;
  /** Default `warm` (cream plus the warm wash). */
  background?: 'warm' | 'plain' | 'mint';
  /** Wrap in KeyboardAvoidingView so the footer rides the keyboard. */
  keyboard?: boolean;
  /** Soft dissolve above the pinned footer. Default off. */
  fade?: boolean;
  /** Footer fill. Default is the screen background. */
  footerColor?: string;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
};

const BAR_HEIGHT = 44;
const BAR_GAP = 14;
const CONTENT_GAP = 12;
const FADE_H = 24;
const FOOTER_PAD_TOP = 12;

/**
 * Centers a short stack in the body. Content taller than the body
 * still starts at the top and scrolls.
 */
export const obCenterContent: ViewStyle = {
  flexGrow: 1,
  justifyContent: 'center',
};

type GradientComponent = React.ComponentType<LinearGradientProps>;

let nativeGradient: GradientComponent | null = null;

function loadLinearGradient(): GradientComponent {
  if (nativeGradient) return nativeGradient;
  const loaded = require('react-native-linear-gradient') as { default?: GradientComponent };
  const component = loaded.default;
  if (!component) {
    throw new Error('react-native-linear-gradient is missing a default export');
  }
  nativeGradient = component;
  return component;
}

function screenColor(background: 'warm' | 'plain' | 'mint'): string {
  if (background === 'mint') return ob.color.mint;
  return ob.color.bg;
}

/**
 * Soft dissolve above the pinned footer.
 * Web has no native gradient view, so screenshot QA draws the same fade with SVG.
 */
function FooterFade({ color }: { color: string }) {
  const rawId = useId();
  const id = `obFade${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  if (Platform.OS === 'web') {
    return (
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    );
  }

  const Gradient = loadLinearGradient();
  return (
    <Gradient
      pointerEvents="none"
      colors={['transparent', color]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={styles.back}
    >
      <Icon name="chevron-back" size={20} color={ob.color.ink} />
    </Pressable>
  );
}

export function ObScreen({
  chapter,
  progress,
  onBack,
  footer,
  scroll = true,
  background = 'warm',
  keyboard = false,
  fade = false,
  footerColor,
  contentStyle,
  children,
  testID,
}: ObScreenProps) {
  const insets = useSafeAreaInsets();
  const bg = screenColor(background);
  const showProgress = chapter != null;
  const showBack = onBack !== null;
  const showBar = showBack || showProgress;
  const bottomInset = Math.max(insets.bottom, 16);
  const contentBottom = !footer ? bottomInset : fade ? FADE_H : 0;

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
  }, [onBack]);

  const pad = {
    paddingHorizontal: ob.space.screen,
    paddingBottom: contentBottom,
  };

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[pad, contentStyle]}
      keyboardShouldPersistTaps="handled"
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustKeyboardInsets={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, pad, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]} testID={testID}>
      {background === 'warm' ? <WarmBackground /> : null}
      <KeyboardAvoidingView
        style={styles.flex}
        enabled={keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ paddingTop: insets.top }}>
          {showBar ? (
            <View style={styles.topBar}>
              {showBack ? <BackButton onPress={handleBack} /> : null}
              {showProgress ? (
                <View style={styles.progressSlot}>
                  <SegmentedProgress chapter={chapter} progress={progress ?? 0} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={[styles.flex, showBar ? styles.belowBar : null]}>{body}</View>
        {footer ? (
          <View style={[styles.footer, { backgroundColor: footerColor ?? bg, paddingBottom: bottomInset }]}>
            {fade ? (
              <View pointerEvents="none" style={styles.fade}>
                <FooterFade color={bg} />
              </View>
            ) : null}
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    height: BAR_HEIGHT,
    paddingHorizontal: ob.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
  progressSlot: {
    flex: 1,
    minWidth: 0,
  },
  belowBar: {
    paddingTop: CONTENT_GAP,
  },
  back: {
    width: ob.size.backButton,
    height: ob.size.backButton,
    borderRadius: ob.size.backButton / 2,
    backgroundColor: ob.color.surface,
    borderWidth: 1,
    borderColor: ob.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingTop: FOOTER_PAD_TOP,
    paddingHorizontal: ob.space.screen,
    zIndex: 2,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -FADE_H,
    height: FADE_H,
  },
});
