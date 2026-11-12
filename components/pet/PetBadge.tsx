import React from 'react';
import { View } from 'react-native';
import { colors } from '../../constants/colors';
import type { PetMood, PetStage } from '../../constants/petImages';
import { Pet } from './Pet';

type PetBadgeProps = {
  stage: PetStage;
  mood: PetMood;
  /** Width and height of the whole badge. */
  size: number;
  accessibilityLabel?: string;
};

/**
 * The pet standing on a forest-green disc, for every screen outside Home.
 * The disc is what keeps the tan pet readable on the tan page; the ears are
 * allowed to poke out over the top of it.
 */
export function PetBadge({ stage, mood, size, accessibilityLabel }: PetBadgeProps) {
  const disc = size * 0.86;
  const petSize = size * 0.9;
  return (
    <View style={{ width: size, height: size }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: (size - disc) / 2,
          bottom: 0,
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          backgroundColor: colors.primary,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: (size - petSize) / 2,
          bottom: size * 0.1,
        }}
      >
        <Pet stage={stage} mood={mood} size={petSize} accessibilityLabel={accessibilityLabel} />
      </View>
    </View>
  );
}
