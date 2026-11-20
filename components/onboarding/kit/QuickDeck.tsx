import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { hapticSelection } from '../../../lib/haptics';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Icon, type IconName } from './Icon';
import { ob, obType } from './tokens';

export type QuickCard<K extends string> = {
  key: K;
  prompt: string;
  options: Array<{ value: string; label: string; icon?: IconName }>;
};

export type QuickDeckProps<K extends string> = {
  cards: QuickCard<K>[];
  answers: Partial<Record<K, string>>;
  onAnswer: (key: K, value: string) => void;
  /** Called when the last card is answered, or when Next is tapped there. */
  onDone: () => void;
  header?: (index: number, total: number) => React.ReactNode;
};

function startIndex<K extends string>(
  cards: QuickCard<K>[],
  answers: Partial<Record<K, string>>,
): number {
  if (cards.length === 0) return 0;
  const firstOpen = cards.findIndex((card) => answers[card.key] == null);
  return firstOpen === -1 ? cards.length - 1 : firstOpen;
}

/**
 * One question at a time. A tap flashes the pill, then the card slides
 * away and the next one comes in from the right. Reduce motion cross-fades.
 */
export function QuickDeck<K extends string>({
  cards,
  answers,
  onAnswer,
  onDone,
  header,
}: QuickDeckProps<K>) {
  const reduce = useReduceMotion();
  const [index, setIndex] = useState(() => startIndex(cards, answers));
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(0);
  const tx = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const dir = useRef<1 | -1>(1);
  const widthRef = useRef(0);
  const reduceRef = useRef(reduce);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  const skipEnter = useRef(true);
  reduceRef.current = reduce;
  onDoneRef.current = onDone;
  widthRef.current = width;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Completing the last card leaves `busy` set. Coming back to this screen
  // (swipe from the next step) must be able to move forward again.
  useFocusEffect(
    useCallback(() => {
      setBusy(false);
      setFlash(null);
      return () => {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      };
    }, []),
  );

  useEffect(() => {
    if (skipEnter.current) {
      skipEnter.current = false;
      return;
    }
    const distance = reduceRef.current ? 0 : Math.max(widthRef.current, 1);
    const duration = reduceRef.current ? ob.motion.fast : ob.motion.base;
    tx.setValue(dir.current * distance);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(tx, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setBusy(false));
  }, [index, tx, opacity]);

  if (cards.length === 0) return null;
  const safeIndex = Math.min(index, cards.length - 1);
  const card = cards[safeIndex];
  if (!card) return null;
  const chosen = flash ?? answers[card.key];
  const showNext = !busy && flash == null && answers[card.key] != null;

  function leave(direction: 1 | -1, next: number) {
    dir.current = direction;
    const distance = reduceRef.current ? 0 : Math.max(widthRef.current, 1);
    const duration = reduceRef.current ? ob.motion.fast : ob.motion.base;
    Animated.parallel([
      Animated.timing(tx, {
        toValue: -direction * distance,
        duration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        tx.setValue(0);
        opacity.setValue(1);
        setBusy(false);
        return;
      }
      setFlash(null);
      setIndex(next);
    });
  }

  function choose(value: string) {
    if (busy) return;
    hapticSelection();
    setFlash(value);
    onAnswer(card.key, value);
    const last = safeIndex >= cards.length - 1;
    if (last) {
      setBusy(true);
      timer.current = setTimeout(() => {
        onDoneRef.current();
        setBusy(false);
        setFlash(null);
      }, 450);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(() => leave(1, safeIndex + 1), 260);
  }

  function goForward() {
    if (busy) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (safeIndex >= cards.length - 1) {
      onDoneRef.current();
      return;
    }
    setBusy(true);
    leave(1, safeIndex + 1);
  }

  function goBack() {
    if (busy || safeIndex <= 0) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setBusy(true);
    leave(-1, safeIndex - 1);
  }

  return (
    <View style={styles.deck}>
      {header ? <View style={styles.header}>{header(safeIndex, cards.length)}</View> : null}
      <View
        accessibilityLabel={`${safeIndex + 1} of ${cards.length}`}
        style={styles.counter}
      >
        <Text style={styles.count}>
          {safeIndex + 1} of {cards.length}
        </Text>
        <View style={styles.dots}>
          {cards.map((item, dotIndex) => (
            <View
              key={item.key}
              style={[
                styles.dot,
                dotIndex === safeIndex && styles.dotCurrent,
                answers[item.key] != null ? styles.dotOn : styles.dotOff,
              ]}
            />
          ))}
        </View>
      </View>
      <View
        style={styles.stage}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View style={{ opacity, transform: [{ translateX: tx }] }}>
          <Text style={styles.prompt} numberOfLines={3}>
            {card.prompt}
          </Text>
          <View style={styles.options}>
            {card.options.map((option) => {
              const selected = chosen === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => choose(option.value)}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionOn,
                    pressed && styles.optionPressed,
                  ]}
                >
                  {option.icon ? (
                    <Icon
                      name={option.icon}
                      size={20}
                      color={selected ? ob.color.surface : ob.color.ink}
                    />
                  ) : null}
                  <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {safeIndex > 0 || showNext ? (
            <View style={styles.navRow}>
              {safeIndex > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  disabled={busy}
                  onPress={goBack}
                  style={({ pressed }) => [
                    styles.navLink,
                    pressed && styles.navPressed,
                    busy && styles.navPressed,
                  ]}
                >
                  <Text style={styles.navText}>Back</Text>
                </Pressable>
              ) : null}
              {safeIndex > 0 && showNext ? <Text style={styles.navSlash}>/</Text> : null}
              {showNext ? (
                <Pressable
                  testID="quick-next"
                  accessibilityRole="button"
                  accessibilityLabel="Next"
                  disabled={busy}
                  onPress={goForward}
                  style={({ pressed }) => [
                    styles.navLink,
                    pressed && styles.navPressed,
                    busy && styles.navPressed,
                  ]}
                >
                  <Text style={styles.navText}>Next</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 12,
  },
  header: {
    marginBottom: 8,
  },
  counter: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  count: {
    ...obType.micro,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotCurrent: {
    width: 16,
  },
  dotOn: {
    backgroundColor: ob.color.accent,
  },
  dotOff: {
    backgroundColor: ob.color.line,
  },
  stage: {
    overflow: 'hidden',
  },
  prompt: {
    ...obType.title,
    textAlign: 'center',
    marginBottom: 18,
  },
  options: {
    gap: ob.space.row,
  },
  option: {
    minHeight: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: ob.color.line,
    backgroundColor: ob.color.surface,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  optionOn: {
    backgroundColor: ob.color.accent,
    borderColor: ob.color.accent,
  },
  optionPressed: {
    opacity: 0.72,
  },
  optionLabel: {
    ...obType.rowLabel,
    textAlign: 'center',
    flexShrink: 1,
  },
  optionLabelOn: {
    color: ob.color.surface,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  navLink: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPressed: {
    opacity: 0.6,
  },
  navText: {
    ...obType.caption,
    color: ob.color.ink,
    textDecorationLine: 'underline',
  },
  navSlash: {
    ...obType.caption,
    color: ob.color.hint,
  },
});
