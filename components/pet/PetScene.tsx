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
  children?: React.ReactNode;
};

const TRACK_WIDTH = 180;

/** Home hero: forest-green panel with the pet on a soft hill and the day's action on the hill. */
export function PetScene({
  topInset,
  greeting,
  firstName,
  onPressFirstName,
  pet,
  mood,
  children,
}: PetSceneProps) {
  const { width, height } = useWindowDimensions();
  const petSize = Math.min(240, Math.max(170, Math.round(height * 0.27)));
  const petAreaHeight = topInset + 30 + petSize;
  // The hill is the top of a large circle. A wide box with a big corner radius
  // would not work: the radius is clamped to half the shorter side, leaving a flat band.
  const hillSize = width * 1.8;
  const petName = pet?.name ?? 'Your armadillo';

  return (
    <View style={styles.panel}>
      <View
        pointerEvents="none"
        style={[
          styles.hill,
          {
            width: hillSize,
            height: hillSize,
            borderRadius: hillSize / 2,
            left: (width - hillSize) / 2,
            top: petAreaHeight - petSize * 0.24,
          },
        ]}
      />

      <View style={{ height: petAreaHeight }} pointerEvents="box-none">
        {pet ? (
          // Centred on the hill's crest. Only the ears reach the header's height, and
          // they sit near the centre, clear of the left-hand name column.
          <View pointerEvents="box-none" style={styles.petSlot}>
            <Pet stage={pet.stage} mood={mood} size={petSize} />
          </View>
        ) : null}
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

      {children ? (
        <View style={styles.actions}>{children}</View>
      ) : (
        <View style={styles.noActions} />
      )}

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
              style={styles.greetingHit}
            >
              <Text style={styles.greeting}>{firstName}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text
          // Long names shrink a little, then wrap once, rather than running under the pet.
          style={styles.petName}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {petName}
        </Text>
      </View>
    </View>
  );
}

export function SceneLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sceneLabel}>{children}</Text>;
}

export function SceneTitle({
  children,
  hasBody,
}: {
  children: React.ReactNode;
  hasBody?: boolean;
}) {
  return (
    <Text style={[styles.sceneTitle, hasBody ? styles.sceneTitleWithBody : null]} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function SceneBody({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sceneBody}>{children}</Text>;
}

export function SceneButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.sceneButton}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Text style={styles.sceneButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SceneLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Text style={styles.sceneLink}>{label}</Text>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  panel: {
    width: '100%',
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
    overflow: 'hidden',
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
  greetingHit: {
    maxWidth: '100%',
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
    bottom: 0,
    alignItems: 'center',
  },
  pillSlot: {
    marginTop: 10,
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
  actions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  noActions: {
    paddingBottom: 16,
  },
  sceneLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#FFFFFF',
    opacity: 0.7,
    marginBottom: 6,
  },
  sceneTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 30,
    color: '#FFFFFF',
    marginBottom: 14,
  },
  sceneTitleWithBody: {
    marginBottom: 6,
  },
  sceneBody: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 14,
  },
  sceneButton: {
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  sceneLink: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    paddingVertical: 10,
  },
});
