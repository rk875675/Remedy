import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import {
  friendShareCancelled,
  friendShareCompleted,
  friendShareDismissed,
  friendShareOffered,
  friendShareStarted,
} from '../../lib/analytics/events/engagement';
import type { friendShareDismissReason } from '../../lib/analytics/events/enums';
import { AppLogo } from '../brand/AppLogo';
import {
  friendShareOutboundMessage,
  friendShareSheetCopy,
  recordFriendShareDismissed,
  recordFriendShareShared,
} from '../../lib/friendShare';
import { hapticPrimaryAction, hapticSelection } from '../../lib/haptics';

type DismissReason = import('zod').z.infer<typeof friendShareDismissReason>;

type Props = {
  firstName: string | null;
  painImproved: boolean;
  onDismiss: () => void;
};

/**
 * Bottom sheet on Home, after Back to Home. Slides up from the bottom edge,
 * over the tab bar. The name stays on screen and in the share text only.
 */
export function FriendShareSheet({ firstName, painImproved, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const settled = useRef<'open' | 'close' | 'shared'>('open');
  const rise = useRef(new Animated.Value(0)).current;
  const copy = friendShareSheetCopy(firstName, painImproved);
  const shown = useRef({ firstName, painImproved });

  useEffect(() => {
    const { firstName: name, painImproved: improved } = shown.current;
    friendShareOffered({
      source_screen: 'home',
      has_name: Boolean(name),
      pain_improved: improved,
    });
    Animated.timing(rise, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    return () => {
      if (settled.current !== 'open') return;
      settled.current = 'close';
      void recordFriendShareDismissed();
      friendShareDismissed({ source_screen: 'home', reason: 'left' });
    };
  }, [rise]);

  function finish(reason: DismissReason) {
    if (settled.current !== 'open') return;
    settled.current = 'close';
    hapticSelection();
    void recordFriendShareDismissed();
    friendShareDismissed({ source_screen: 'home', reason });
    Animated.timing(rise, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }

  async function share() {
    if (settled.current !== 'open') return;
    hapticPrimaryAction();
    friendShareStarted({ source_screen: 'home' });
    try {
      const result = await Share.share({
        message: friendShareOutboundMessage(),
      });
      if (settled.current !== 'open') return;
      if (result.action !== Share.sharedAction) {
        friendShareCancelled({ source_screen: 'home' });
        return;
      }
      settled.current = 'shared';
      void recordFriendShareShared();
      friendShareCompleted({ source_screen: 'home' });
      Animated.timing(rise, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDismiss();
      });
    } catch {
      // The system sheet did not open. Leave this one up.
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => finish('close')}
    >
      <View style={styles.fill}>
        <Animated.View style={[styles.scrim, { opacity: rise }]}>
          <Pressable
            style={styles.fill}
            onPress={() => finish('scrim')}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 20) + 16,
              transform: [
                {
                  translateY: rise.interpolate({
                    inputRange: [0, 1],
                    outputRange: [640, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.handle} />
          <TouchableOpacity
            style={styles.close}
            onPress={() => finish('close')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={styles.closeMark}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          <DancingLogo />

          <TouchableOpacity
            style={styles.share}
            onPress={() => { void share(); }}
            accessibilityRole="button"
          >
            <Text style={styles.shareText}>Show them</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Hop, lean left, hop, lean right, rest. Loops while the sheet is up. */
function DancingLogo() {
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 3, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 4, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(420),
        Animated.timing(beat, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat]);

  const input = [0, 1, 2, 3, 4];
  const translateY = beat.interpolate({ inputRange: input, outputRange: [0, -18, 0, -18, 0] });
  const rotate = beat.interpolate({ inputRange: input, outputRange: ['0deg', '-12deg', '0deg', '12deg', '0deg'] });
  const scaleX = beat.interpolate({ inputRange: input, outputRange: [1, 0.94, 1.08, 0.94, 1.08] });
  const scaleY = beat.interpolate({ inputRange: input, outputRange: [1, 1.08, 0.9, 1.08, 0.9] });
  const shadowScale = beat.interpolate({ inputRange: input, outputRange: [1, 0.6, 1, 0.6, 1] });

  return (
    <View style={styles.dance}>
      <Animated.View style={{ transform: [{ translateY }, { rotate }, { scaleX }, { scaleY }] }}>
        <AppLogo size={72} />
      </Animated.View>
      <Animated.View style={[styles.danceShadow, { transform: [{ scaleX: shadowScale }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  dance: {
    marginTop: 26,
    alignItems: 'center',
  },
  danceShadow: {
    marginTop: 8,
    width: 54,
    height: 8,
    borderRadius: radius.circle,
    backgroundColor: 'rgba(28, 28, 30, 0.1)',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 30, 0.28)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    ...shadows.high,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.circle,
    backgroundColor: colors.border,
    marginBottom: 22,
  },
  close: {
    position: 'absolute',
    top: 8,
    right: 12,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMark: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  title: {
    fontFamily: serifFont,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    paddingRight: 28,
  },
  body: {
    marginTop: 12,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textSecondary,
    paddingRight: 8,
  },
  share: {
    marginTop: 22,
    height: 56,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  shareText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
