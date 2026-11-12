import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { PET_STAGE_SCALE, petImage, type PetStage } from '../../constants/petImages';

const STAGES: PetStage[] = [1, 2, 3, 4, 5];

type PetStageStripProps = {
  /** The stage the pet is at now; the other four are shown faded. */
  stage: PetStage;
  /** Height of the row, which is also the width of each slot. */
  size?: number;
};

/** The five stages in a row, ball to fully grown, with the current one in full colour. */
export function PetStageStrip({ stage, size = 56 }: PetStageStripProps) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Stage ${stage} of 5`}
    >
      {STAGES.map((s) => {
        const drawn = size * PET_STAGE_SCALE[s];
        return (
          <View key={s} style={[styles.slot, { width: size, height: size }]}>
            <Image
              source={petImage(s, 'idle')}
              resizeMode="contain"
              style={{ width: drawn, height: drawn, opacity: s === stage ? 1 : 0.28 }}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
