import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticHeavy } from '../../../lib/haptics';
import { ob, obType } from '../kit/tokens';

const HOLD_MS = 1100;
const PULSE_MS = 90;

type HoldToCommitProps = {
  disabled?: boolean;
  onComplete: () => void;
};

/**
 * Press-and-hold from the old commit screen.
 * Releasing early reverses the fill. The accessibility activate action finishes it.
 */
export function HoldToCommit({ disabled = false, onComplete }: HoldToCommitProps) {
  const [done, setDone] = useState(false);
  const [widthPx, setWidthPx] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishing = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  function stopPulse() {
    if (pulse.current) clearInterval(pulse.current);
    pulse.current = null;
  }

  useEffect(() => {
    return () => {
      stopPulse();
    };
  }, []);

  function finish() {
    if (disabled || finishing.current) return;
    finishing.current = true;
    stopPulse();
    fill.stopAnimation();
    fill.setValue(1);
    setDone(true);
    onCompleteRef.current();
  }

  function handlePressIn() {
    if (disabled || finishing.current) return;
    hapticHeavy();
    stopPulse();
    pulse.current = setInterval(hapticHeavy, PULSE_MS);
    Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
      isInteraction: false,
    }).start(({ finished }) => {
      if (finished) finish();
    });
  }

  function handlePressOut() {
    if (disabled || finishing.current) return;
    stopPulse();
    Animated.timing(fill, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
      isInteraction: false,
    }).start();
  }

  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(widthPx, 1)],
  });
  const label = done ? 'Committed' : 'Hold to commit to my plan';

  return (
    <Pressable
      testID="commit-hold"
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidthPx((current) => (current === next ? current : next));
      }}
      disabled={disabled || done}
      accessibilityRole="button"
      accessibilityLabel={done ? 'Committed' : 'Hold to commit to my plan'}
      accessibilityHint={done ? undefined : 'Press and hold until the button fills'}
      accessibilityActions={[{ name: 'activate', label: 'Commit' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') finish();
      }}
      style={styles.button}
    >
      <Text style={styles.labelLight} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View pointerEvents="none" style={[styles.mask, { width }]}>
        <View style={[styles.fill, { width: Math.max(widthPx, 1) }]}>
          <Text style={styles.labelDark} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: ob.size.button,
    borderRadius: ob.radius.pill,
    backgroundColor: ob.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mask: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#F4E4C4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelLight: {
    ...obType.button,
    color: ob.color.surface,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  labelDark: {
    ...obType.button,
    color: ob.color.ink,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
