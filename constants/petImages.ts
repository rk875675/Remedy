import type { ImageSourcePropType } from 'react-native';

export const PET_MOODS = [
  'idle',
  'ready',
  'celebrating',
  'proud',
  'sleepy',
  'stiff',
  'concerned',
  // Only ever chosen on the device (poked too much); the server never sends it.
  'angry',
  'sad',
  'happy',
  // Things it gets up to on Home when left alone.
  'reading',
  'stretching',
  // Asleep at night, tucked in. One drawing for every stage.
  'bed',
  // In a session: giving a tip, cheering, and resting between sets.
  'coach',
  'cheer',
  'rest',
] as const;

export type PetMood = (typeof PET_MOODS)[number];
export type PetStage = 1 | 2 | 3 | 4 | 5;

type PetPoseKey = `s${PetStage}_${PetMood}`;

const PET_IMAGES: Partial<Record<PetPoseKey, ImageSourcePropType>> = {
  s1_idle: require('../assets/pet/s1_idle.png'),
  s1_ready: require('../assets/pet/s1_ready.png'),
  s1_celebrating: require('../assets/pet/s1_celebrating.png'),
  s1_stiff: require('../assets/pet/s1_stiff.png'),
  s1_concerned: require('../assets/pet/s1_concerned.png'),

  s2_idle: require('../assets/pet/s2_idle.png'),
  s2_ready: require('../assets/pet/s2_ready.png'),
  s2_celebrating: require('../assets/pet/s2_celebrating.png'),
  s2_sleepy: require('../assets/pet/s2_sleepy.png'),
  s2_concerned: require('../assets/pet/s2_concerned.png'),
  s2_angry: require('../assets/pet/s2_angry.png'),
  s2_sad: require('../assets/pet/s2_sad.png'),
  s2_happy: require('../assets/pet/s2_happy.png'),
  s2_reading: require('../assets/pet/s2_reading.png'),
  s2_stretching: require('../assets/pet/s2_stretching.png'),
  s2_bed: require('../assets/pet/bed.png'),
  s2_coach: require('../assets/pet/s2_coach.png'),
  s2_cheer: require('../assets/pet/s2_cheer.png'),
  s2_rest: require('../assets/pet/s2_rest.png'),

  s3_idle: require('../assets/pet/s3_idle.png'),
  s3_ready: require('../assets/pet/s3_ready.png'),
  s3_celebrating: require('../assets/pet/s3_celebrating.png'),
  s3_proud: require('../assets/pet/s3_proud.png'),
  s3_sleepy: require('../assets/pet/s3_sleepy.png'),
  s3_stiff: require('../assets/pet/s3_stiff.png'),
  s3_concerned: require('../assets/pet/s3_concerned.png'),
  s3_angry: require('../assets/pet/s3_angry.png'),
  s3_sad: require('../assets/pet/s3_sad.png'),
  s3_happy: require('../assets/pet/s3_happy.png'),
  s3_reading: require('../assets/pet/s3_reading.png'),
  s3_stretching: require('../assets/pet/s3_stretching.png'),
  s3_bed: require('../assets/pet/bed.png'),
  s3_coach: require('../assets/pet/s3_coach.png'),
  s3_cheer: require('../assets/pet/s3_cheer.png'),
  s3_rest: require('../assets/pet/s3_rest.png'),

  s4_idle: require('../assets/pet/s4_idle.png'),
  s4_ready: require('../assets/pet/s4_ready.png'),
  s4_celebrating: require('../assets/pet/s4_celebrating.png'),
  s4_proud: require('../assets/pet/s4_proud.png'),
  s4_sleepy: require('../assets/pet/s4_sleepy.png'),
  s4_stiff: require('../assets/pet/s4_stiff.png'),
  s4_concerned: require('../assets/pet/s4_concerned.png'),
  s4_angry: require('../assets/pet/s4_angry.png'),
  s4_sad: require('../assets/pet/s4_sad.png'),
  s4_happy: require('../assets/pet/s4_happy.png'),
  s4_reading: require('../assets/pet/s4_reading.png'),
  s4_stretching: require('../assets/pet/s4_stretching.png'),
  s4_bed: require('../assets/pet/bed.png'),
  s4_coach: require('../assets/pet/s4_coach.png'),
  s4_cheer: require('../assets/pet/s4_cheer.png'),
  s4_rest: require('../assets/pet/s4_rest.png'),

  s5_idle: require('../assets/pet/s5_idle.png'),
  s5_ready: require('../assets/pet/s5_ready.png'),
  s5_celebrating: require('../assets/pet/s5_celebrating.png'),
  s5_proud: require('../assets/pet/s5_proud.png'),
  s5_sleepy: require('../assets/pet/s5_sleepy.png'),
  s5_stiff: require('../assets/pet/s5_stiff.png'),
  s5_concerned: require('../assets/pet/s5_concerned.png'),
  s5_angry: require('../assets/pet/s5_angry.png'),
  s5_sad: require('../assets/pet/s5_sad.png'),
  s5_happy: require('../assets/pet/s5_happy.png'),
  s5_reading: require('../assets/pet/s5_reading.png'),
  s5_stretching: require('../assets/pet/s5_stretching.png'),
  s5_bed: require('../assets/pet/bed.png'),
  s5_coach: require('../assets/pet/s5_coach.png'),
  s5_cheer: require('../assets/pet/s5_cheer.png'),
  s5_rest: require('../assets/pet/s5_rest.png'),
};

/** Poses the early stages were never drawn in. */
const POSE_FALLBACKS: Partial<Record<PetStage, Partial<Record<PetMood, PetMood>>>> = {
  1: {
    proud: 'celebrating',
    sleepy: 'idle',
    angry: 'stiff',
    sad: 'concerned',
    happy: 'celebrating',
    reading: 'idle',
    stretching: 'idle',
    bed: 'idle',
    coach: 'ready',
    cheer: 'celebrating',
    rest: 'idle',
  },
  2: { proud: 'celebrating', stiff: 'sleepy' },
};

/** Fraction of its box each stage fills, so the pet visibly grows. */
export const PET_STAGE_SCALE: Record<PetStage, number> = {
  1: 0.72,
  2: 0.8,
  3: 0.88,
  4: 0.94,
  5: 1,
};

/** Each pose was scaled to fill its own canvas; these bring them back in line. */
export const PET_POSE_SCALE: Partial<Record<PetPoseKey, number>> = {
  s3_sleepy: 0.95,
  s4_sleepy: 0.82,
  s5_sleepy: 0.82,
  s3_celebrating: 1.06,
  s4_celebrating: 1.06,
  s5_celebrating: 1.06,
  s2_sad: 0.9,
  s3_sad: 0.9,
  s4_sad: 0.88,
  s5_sad: 0.9,
  s4_reading: 0.9,
  s5_reading: 0.86,
  s4_stretching: 1.06,
  s5_stretching: 1.0,
  s2_stretching: 1.04,
  // The bed is the same size whatever the stage.
  s2_bed: 0.95 / 0.8,
  s3_bed: 0.95 / 0.88,
  s4_bed: 0.95 / 0.94,
  s5_bed: 0.95,
};

/** The mood actually drawn for a stage, after fallbacks. */
export function displayedPetMood(stage: PetStage, mood: PetMood): PetMood {
  return POSE_FALLBACKS[stage]?.[mood] ?? mood;
}

export function petImage(stage: PetStage, mood: PetMood): ImageSourcePropType {
  const key: PetPoseKey = `s${stage}_${displayedPetMood(stage, mood)}`;
  return PET_IMAGES[key] ?? PET_IMAGES[`s${stage}_idle`] ?? require('../assets/pet/s1_idle.png');
}

export function petScale(stage: PetStage, mood: PetMood): number {
  const key: PetPoseKey = `s${stage}_${displayedPetMood(stage, mood)}`;
  return PET_STAGE_SCALE[stage] * (PET_POSE_SCALE[key] ?? 1);
}

