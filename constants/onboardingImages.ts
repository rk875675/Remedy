import type { ImageSourcePropType } from 'react-native';
import type { OnboardingAnswers, MainGoal, PainTrigger, PainType } from '../types/database';
import type { RecognizeKey } from './mindset';

export const LOCATION_IMAGES: Record<OnboardingAnswers['pain_location'], ImageSourcePropType> = {
  upper: require('../assets/onboarding/location-upper.jpg'),
  lower: require('../assets/onboarding/location-lower.jpg'),
  all: require('../assets/onboarding/location-all.jpg'),
};

export const PAIN_TYPE_IMAGES: Record<PainType, ImageSourcePropType> = {
  stiffness: require('../assets/onboarding/type-stiffness.jpg'),
  ache: require('../assets/onboarding/type-ache.jpg'),
  sharp: require('../assets/onboarding/type-sharp.jpg'),
  nerve: require('../assets/onboarding/type-nerve.jpg'),
};

export const ACTIVITY_ILLUSTRATIONS: Partial<
  Record<OnboardingAnswers['activity_level'], ImageSourcePropType>
> = {
  sedentary: require('../assets/onboarding/illo-activity-sedentary.jpg'),
  light: require('../assets/onboarding/illo-activity-light.jpg'),
  active: require('../assets/onboarding/illo-activity-active.jpg'),
};

export const TRIGGER_ILLUSTRATIONS: Partial<Record<PainTrigger, ImageSourcePropType>> = {
  sitting: require('../assets/onboarding/illo-trigger-sitting.jpg'),
  bending: require('../assets/onboarding/illo-trigger-bending.jpg'),
  standing: require('../assets/onboarding/illo-trigger-standing.jpg'),
  morning: require('../assets/onboarding/illo-trigger-morning.jpg'),
};

export const GOAL_ILLUSTRATIONS: Record<MainGoal, ImageSourcePropType> = {
  reduce_pain: require('../assets/onboarding/illo-goal-pain.jpg'),
  return_to_exercise: require('../assets/onboarding/illo-goal-exercise.jpg'),
  sleep: require('../assets/onboarding/illo-goal-sleep.jpg'),
  mobility: require('../assets/onboarding/illo-goal-mobility.jpg'),
};

export const RECOGNIZE_ILLUSTRATIONS_YES: Record<RecognizeKey, ImageSourcePropType> = {
  effort: require('../assets/onboarding/illo-recognize-effort.jpg'),
  return_loop: require('../assets/onboarding/illo-recognize-return.jpg'),
  flinch: require('../assets/onboarding/illo-recognize-flinch.jpg'),
  permanence: require('../assets/onboarding/illo-recognize-permanence.jpg'),
};

export const RECOGNIZE_ILLUSTRATIONS_NO: Record<RecognizeKey, ImageSourcePropType> = {
  effort: require('../assets/onboarding/illo-recognize-unsure.jpg'),
  return_loop: require('../assets/onboarding/illo-recognize-advice.jpg'),
  flinch: require('../assets/onboarding/illo-recognize-cost.jpg'),
  permanence: require('../assets/onboarding/illo-recognize-permanence.jpg'),
};

/** Flat scenes in the same style as the onboarding tiles. */
export const OPTION_SCENES = {
  gym: require('../assets/onboarding/opt-gym.jpg'),
  band: require('../assets/onboarding/opt-band.jpg'),
  mat: require('../assets/onboarding/opt-mat.jpg'),
  spot: require('../assets/onboarding/opt-spot.jpg'),
  side: require('../assets/onboarding/opt-side.jpg'),
  wander: require('../assets/onboarding/opt-wander.jpg'),
  downLeg: require('../assets/onboarding/opt-downleg.jpg'),
  shrug: require('../assets/onboarding/opt-shrug.jpg'),
  fresh: require('../assets/onboarding/opt-fresh.jpg'),
  early: require('../assets/onboarding/opt-early.jpg'),
  months: require('../assets/onboarding/opt-months.jpg'),
  years: require('../assets/onboarding/opt-years.jpg'),
  ages: require('../assets/onboarding/opt-ages.jpg'),
  injury: require('../assets/onboarding/opt-injury.jpg'),
  lift: require('../assets/onboarding/opt-lift.jpg'),
  surgery: require('../assets/onboarding/opt-surgery.jpg'),
  pregnant: require('../assets/onboarding/opt-pregnant.jpg'),
  gradual: require('../assets/onboarding/opt-gradual.jpg'),
  sudden: require('../assets/onboarding/opt-sudden.jpg'),
  stiff: require('../assets/onboarding/opt-stiff.jpg'),
  weak: require('../assets/onboarding/opt-weak.jpg'),
  wobble: require('../assets/onboarding/opt-wobble.jpg'),
  uneven: require('../assets/onboarding/opt-uneven.jpg'),
  unsafe: require('../assets/onboarding/opt-unsafe.jpg'),
  brace: require('../assets/onboarding/opt-brace.jpg'),
  rest: require('../assets/onboarding/opt-rest.jpg'),
  nerve: require('../assets/onboarding/type-nerve.jpg'),
  disc: require('../assets/onboarding/opt-disc.jpg'),
  narrow: require('../assets/onboarding/opt-narrow.jpg'),
  curve: require('../assets/onboarding/opt-curve.jpg'),
  fibro: require('../assets/onboarding/opt-fibro.jpg'),
  bone: require('../assets/onboarding/opt-bone.jpg'),
  postpartum: require('../assets/onboarding/opt-postpartum.jpg'),
  thigh: require('../assets/onboarding/opt-thigh.jpg'),
  shin: require('../assets/onboarding/opt-shin.jpg'),
  foot: require('../assets/onboarding/opt-foot.jpg'),
  walk: require('../assets/onboarding/opt-walk.jpg'),
  stairs: require('../assets/onboarding/opt-stairs.jpg'),
  twist: require('../assets/onboarding/opt-twist.jpg'),
  reach: require('../assets/onboarding/opt-reach.jpg'),
  sleep: require('../assets/onboarding/opt-sleep.jpg'),
  exercise: require('../assets/onboarding/opt-exercise.jpg'),
} as const;

export function recognizeIllustrationsFor(
  triedBefore: string | null | undefined,
): Record<RecognizeKey, ImageSourcePropType> {
  return triedBefore === 'no' ? RECOGNIZE_ILLUSTRATIONS_NO : RECOGNIZE_ILLUSTRATIONS_YES;
}
