import type { ImageSourcePropType } from 'react-native';
import { SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { ACTIVITY_ILLUSTRATIONS } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';

const ACTIVITY = ['sedentary', 'light', 'active'] as const;
type ActivityValue = (typeof ACTIVITY)[number];

function activityArt(value: ActivityValue): ImageSourcePropType {
  const source = ACTIVITY_ILLUSTRATIONS[value];
  if (source === undefined) {
    throw new Error(`Missing activity illustration: ${value}`);
  }
  return source;
}

const COPY = {
  ask: 'How much do you move in a week?',
} as const;

const OPTIONS: ReadonlyArray<SelectOption<ActivityValue>> = [
  {
    value: 'sedentary',
    label: 'Mostly sitting',
    sub: 'Desk, car, couch',
    image: activityArt('sedentary'),
    reaction: { line: 'Lots of sitting. No judgement.', mood: 'ready' },
  },
  {
    value: 'light',
    label: 'Lightly active',
    sub: 'Walks, chores, on my feet some',
    image: activityArt('light'),
    reaction: { line: "A bit of moving. That's a good base.", mood: 'ready' },
  },
  {
    value: 'active',
    label: 'Very active',
    sub: 'Training or physical work most days',
    image: activityArt('active'),
    reaction: { line: 'Very active. Then we can build.', mood: 'celebrating' },
  },
];

function knownActivity(value: string | undefined): ActivityValue[] {
  if (value === 'sedentary' || value === 'light' || value === 'active') return [value];
  return [];
}

export default function ActivityScreen() {
  const { answers, setAnswer, clearAnswer } = useOnboarding();

  return (
    <SelectQuestion
      testID="activity"
      step="activity"
      ask={COPY.ask}
      askMood="ready"
      options={OPTIONS}
      mode="single"
      selected={knownActivity(answers.activity_level)}
      onChange={(next) => {
        const value = next[0];
        if (value) setAnswer('activity_level', value);
        else clearAnswer('activity_level');
      }}
      analyticsValue={(value) => value}
      contentStyle={obCenterContent}
    />
  );
}
