import type { ImageSourcePropType } from 'react-native';

export const PET_MOODS = [
  'idle',
  'ready',
  'celebrating',
  'proud',
  'sleepy',
  'stiff',
  'concerned',
] as const;

export type PetMood = (typeof PET_MOODS)[number];
export type PetStage = 1 | 2 | 3 | 4 | 5;

type PetPoseKey = `s${PetStage}_${PetMood}`;

const PET_IMAGES: Partial<Record<PetPoseKey, ImageSourcePropType>> = {
  s1_idle: require('../assets/pet/s1_idle.png'),
  s1_ready: require('../assets/pet/s1_ready.png'),
  s1_celebrating: require('../assets/pet/s1_celebrating.png'),

  s2_idle: require('../assets/pet/s2_idle.png'),
  s2_ready: require('../assets/pet/s2_ready.png'),
  s2_celebrating: require('../assets/pet/s2_celebrating.png'),
  s2_sleepy: require('../assets/pet/s2_sleepy.png'),
  s2_concerned: require('../assets/pet/s2_concerned.png'),

  s3_idle: require('../assets/pet/s3_idle.png'),
  s3_ready: require('../assets/pet/s3_ready.png'),
  s3_celebrating: require('../assets/pet/s3_celebrating.png'),
  s3_proud: require('../assets/pet/s3_proud.png'),
  s3_sleepy: require('../assets/pet/s3_sleepy.png'),
  s3_stiff: require('../assets/pet/s3_stiff.png'),
  s3_concerned: require('../assets/pet/s3_concerned.png'),

  s4_idle: require('../assets/pet/s4_idle.png'),
  s4_ready: require('../assets/pet/s4_ready.png'),
  s4_celebrating: require('../assets/pet/s4_celebrating.png'),
  s4_proud: require('../assets/pet/s4_proud.png'),
  s4_sleepy: require('../assets/pet/s4_sleepy.png'),
  s4_stiff: require('../assets/pet/s4_stiff.png'),
  s4_concerned: require('../assets/pet/s4_concerned.png'),

  s5_idle: require('../assets/pet/s5_idle.png'),
  s5_ready: require('../assets/pet/s5_ready.png'),
  s5_celebrating: require('../assets/pet/s5_celebrating.png'),
  s5_proud: require('../assets/pet/s5_proud.png'),
  s5_sleepy: require('../assets/pet/s5_sleepy.png'),
  s5_stiff: require('../assets/pet/s5_stiff.png'),
  s5_concerned: require('../assets/pet/s5_concerned.png'),
};

/** Poses the early stages were never drawn in. */
const POSE_FALLBACKS: Partial<Record<PetStage, Partial<Record<PetMood, PetMood>>>> = {
  1: { proud: 'celebrating', sleepy: 'idle', stiff: 'idle', concerned: 'ready' },
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
