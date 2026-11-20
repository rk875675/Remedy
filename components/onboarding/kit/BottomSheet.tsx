import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob } from './tokens';

type BottomSheetProps = {
  visible: boolean;
  onClose?: () => void;
  /** Tap on the scrim calls onClose. Default true. */
  dismissable?: boolean;
  children: React.ReactNode;
};

/**
 * White sheet from the bottom of the screen. The scrim fades, the sheet
 * springs up. Reduce motion skips the travel and just shows it.
 */
export function BottomSheet({
  visible,
  onClose,
  dismissable = true,
  children,
}: BottomSheetProps) {
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const scrim = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(windowH)).current;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted || reduce === null) return;
    let alive = true;
    if (visible) {
      if (reduce) {
        scrim.setValue(1);
        ty.setValue(0);
        return;
      }
      scrim.setValue(0);
      ty.setValue(windowH);
      Animated.parallel([
        Animated.timing(scrim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.spring(ty, {
          toValue: 0,
          tension: ob.motion.spring.tension,
          friction: ob.motion.spring.friction,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]).start();
      return () => {
        alive = false;
      };
    }
    if (reduce) {
      scrim.setValue(0);
      ty.setValue(windowH);
      setMounted(false);
      return;
    }
    Animated.parallel([
      Animated.timing(scrim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(ty, {
        toValue: windowH,
        duration: ob.motion.base,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]).start(({ finished }) => {
      if (finished && alive) setMounted(false);
    });
    return () => {
      alive = false;
    };
  }, [visible, mounted, reduce, windowH, scrim, ty]);

  if (!mounted) return null;

  const maxH = windowH * 0.88;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      accessibilityViewIsModal
      onRequestClose={() => {
        if (dismissable) onClose?.();
      }}
    >
      <View style={styles.fill}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
          accessibilityRole={dismissable ? 'button' : undefined}
          accessibilityLabel={dismissable ? 'Close' : undefined}
          disabled={!dismissable}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.scrim, { opacity: scrim }]}
          />
        </Pressable>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: maxH,
              paddingBottom: ob.space.lg + insets.bottom,
              transform: [{ translateY: ty }],
            },
          ]}
        >
          <View style={styles.grabber} />
          <ScrollView
            style={{ maxHeight: maxH - 36 - insets.bottom }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ob.color.scrim,
  },
  sheet: {
    backgroundColor: ob.color.surface,
    borderTopLeftRadius: ob.radius.sheet,
    borderTopRightRadius: ob.radius.sheet,
    paddingTop: 10,
    paddingHorizontal: ob.space.lg,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: ob.color.line,
    marginBottom: 12,
  },
});
