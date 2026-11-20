import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PetMood } from '../../../constants/petImages';
import { fillPetLine } from '../../../constants/petOnboardingLines';
import { useOnboardingPet } from '../../../lib/useOnboardingPet';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { PetSays, type PetEntrance } from '../../pet/PetSays';
import { ob, obType } from './tokens';

/**
 * PetSays types one step every `ob.motion.typeMs`. Lines longer than 70
 * characters step two characters at a time. The cushion covers the tick
 * before the first character and the paint after the last one.
 * Entrance time is not included: question screens use entrance "none".
 */
const TYPE_CUSHION_MS = 120;
/** Horizontal gap between the pet and the bubble, matching PetSays. */
const PET_BUBBLE_GAP = 14;

export function useTypedDelay(line: string): number {
  const { name } = useOnboardingPet();
  const spoken = fillPetLine(line, { name });
  const step = spoken.length > 70 ? 2 : 1;
  const ticks = Math.ceil(spoken.length / step);
  return ticks * ob.motion.typeMs + TYPE_CUSHION_MS;
}

export type AskHeaderProps = {
  line: string;
  mood?: PetMood;
  /** Quiet helper under the bubble, aligned to the bubble's left edge. */
  sub?: string;
  /** Fires once the line has finished typing. Re-arms when `line` changes. */
  onTyped?: () => void;
  /** Passed through to PetSays. Default `none` so question screens stay quick. */
  entrance?: PetEntrance;
};

export function AskHeader({ line, mood = 'ready', sub, onTyped, entrance = 'none' }: AskHeaderProps) {
  const { stage, name } = useOnboardingPet();
  const reduce = useReduceMotion();
  const delay = useTypedDelay(line);
  const onTypedRef = useRef(onTyped);
  onTypedRef.current = onTyped;

  useEffect(() => {
    if (reduce === null) return;
    let active = true;
    const notify = () => {
      if (!active) return;
      onTypedRef.current?.();
    };
    if (reduce) {
      notify();
      return () => {
        active = false;
      };
    }
    const id = setTimeout(notify, delay);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [delay, line, reduce]);

  const tag = name && name.trim() ? name.trim() : null;

  return (
    <View style={tag ? styles.withTag : undefined}>
      <PetSays
        line={line}
        mood={mood}
        stage={stage}
        name={name}
        size={ob.size.petQuestion}
        variant="question"
        entrance={entrance}
      />
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The name tag sits 9pt above the bubble. This keeps that tag inside the
  // scroll content, just under the top bar, without a spare empty band.
  withTag: {
    paddingTop: 12,
  },
  sub: {
    ...obType.caption,
    marginTop: ob.space.sm,
    marginLeft: ob.size.petQuestion + PET_BUBBLE_GAP,
  },
});
