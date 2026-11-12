import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { motion } from '../../constants/typography';
import type { PetMood, PetStage } from '../../constants/petImages';
import { PetBadge } from './PetBadge';

type PetSaysProps = {
  /** What the pet is saying. Changing it fades the new line in. */
  line: string;
  mood: PetMood;
  stage?: PetStage;
  /** Size of the pet badge beside the bubble. */
  size?: number;
};

const BORDER = 2;
const TAIL = 12;

/**
 * The pet with a speech bubble: how it talks on every screen it presents.
 * The bubble has the same heavy dark outline as the pet so the two read as one
 * sticker. It keeps a fixed minimum height so a new line never shifts the layout.
 */
export function PetSays({ line, mood, stage = 1, size = 64 }: PetSaysProps) {
  const appear = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  const lastLineAt = useRef(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const now = Date.now();
    // A pain slider can cross several buckets inside one fade. Restarting from
    // 0 each time holds the line at opacity 0 until the finger stops.
    const rapid = now - lastLineAt.current < motion.fast;
    lastLineAt.current = now;
    if (rapid) {
      appear.setValue(1);
      return;
    }
    appear.setValue(0);
    const anim = Animated.timing(appear, {
      toValue: 1,
      duration: motion.fast,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [line, appear]);

  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={line}>
      <PetBadge stage={stage} mood={mood} size={size} />
      <View style={styles.bubbleWrap}>
        <View style={styles.tail} />
        <View style={styles.bubble}>
          <Animated.Text
            style={[
              styles.line,
              {
                opacity: appear,
                transform: [
                  { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
                ],
              },
            ]}
          >
            {line}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}

/** Same bubble without the pet, for places where the pet is already drawn large. */
export function PetBubble({ line }: { line: string }) {
  return (
    <View style={styles.bubble} accessible accessibilityRole="text">
      <Text style={styles.line}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bubbleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  bubble: {
    minHeight: 66,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: BORDER,
    borderColor: colors.textPrimary,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  // A square turned 45 degrees, half hidden under the bubble's left edge.
  tail: {
    position: 'absolute',
    left: -TAIL / 2 + BORDER / 2,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.surface,
    borderLeftWidth: BORDER,
    borderBottomWidth: BORDER,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  line: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
