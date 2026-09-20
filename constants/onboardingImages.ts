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

export function recognizeIllustrationsFor(
  triedBefore: string | null | undefined,
): Record<RecognizeKey, ImageSourcePropType> {
  return triedBefore === 'no' ? RECOGNIZE_ILLUSTRATIONS_NO : RECOGNIZE_ILLUSTRATIONS_YES;
}
