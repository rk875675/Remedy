import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { PetMood } from '../../constants/petImages';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import { Pet } from './Pet';

type PetSceneProps = {
  topInset: number;
  greeting: string;
  firstName: string | null;
  onPressFirstName?: () => void;
  pet: PetState | null;
  mood: PetMood;
};

const TRACK_WIDTH = 180;
/** Space at the bottom of the panel kept for the growth pill; the pet stands just above it. */
const PILL_ZONE = 58;

/** Home hero: forest-green panel with the pet standing on a soft hill. */
export function PetScene({
  topInset,
  greeting,
  firstName,
  onPressFirstName,
  pet,
  mood,
}: PetSceneProps) {
  const { width, height } = useWindowDimensions();
  const panelHeight = Math.min(330, Math.max(270, Math.round(height * 0.36)));
  // The pet fills everything above the pill; its ears may reach up beside the name.
  const petSize = Math.round((panelHeight - PILL_ZONE) * 0.94);
  // The hill is the top of a large circle. A wide box with a big corner radius
  // would not work: the radius is clamped to half the shorter side, leaving a flat band.
  const hillSize = width * 1.8;
  const petName = pet?.name ?? 'Your armadillo';

  return (
    <View style={[styles.panel, { height: panelHeight + topInset }]}>
      <View
        pointerEvents="none"
        style={[
          styles.hill,
          {
            width: hillSize,
            height: hillSize,
            borderRadius: hillSize / 2,
            left: (width - hillSize) / 2,
            bottom: panelHeight * 0.45 - hillSize,
          },
        ]}
      />

      {pet ? (
        <View pointerEvents="box-none" style={[styles.petSlot, { bottom: PILL_ZONE }]}>
          <Pet stage={pet.stage} mood={mood} size={petSize} accessibilityLabel={petName} />
        </View>
      ) : null}

      {/* After the pet so the text stays readable and tappable where they meet. */}
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>
            {greeting}
            {firstName ? ', ' : ''}
          </Text>
          {firstName ? (
            <TouchableOpacity
              onPress={onPressFirstName}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Edit name"
            >
              <Text style={styles.greeting}>{firstName}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text
          style={styles.petName}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {petName}
        </Text>
      </View>

      {pet ? (
        <View pointerEvents="none" style={styles.pillSlot}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{petGrowthCopy(pet)}</Text>
            {pet.stage < 5 ? (
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: TRACK_WIDTH * stageProgress(pet) }]} />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  hill: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  // Kept to the left so the name sits beside the pet, not across it.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 20,
    maxWidth: '48%',
  },
  greetingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  greeting: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  petName: {
    ...type.title,
    color: '#FFFFFF',
    marginTop: 2,
  },
  petSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pillSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  track: {
    width: TRACK_WIDTH,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: 6,
    overflow: 'hidden',
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});
