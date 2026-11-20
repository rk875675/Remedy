import { SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { GOAL_ILLUSTRATIONS } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import type { MainGoal } from '../../types/database';

const COPY = {
  ask: 'What do you want most?',
} as const;

const OPTIONS: ReadonlyArray<SelectOption<MainGoal>> = [
  {
    value: 'reduce_pain',
    image: GOAL_ILLUSTRATIONS.reduce_pain,
    label: 'Less pain, day to day',
    reaction: { line: 'Relief first. Then we make it last.', mood: 'ready' },
  },
  {
    value: 'mobility',
    image: GOAL_ILLUSTRATIONS.mobility,
    label: 'Move freely again',
    reaction: { line: 'Looser first, then stronger.', mood: 'ready' },
  },
  {
    value: 'return_to_exercise',
    image: GOAL_ILLUSTRATIONS.return_to_exercise,
    label: 'Get back to training',
    reaction: { line: 'Real loading, step by step.', mood: 'celebrating' },
  },
  {
    value: 'sleep',
    image: GOAL_ILLUSTRATIONS.sleep,
    label: 'Sleep without waking up sore',
    reaction: { line: 'Calmer evenings. Better mornings.', mood: 'celebrating' },
  },
];

function isGoal(value: string): value is MainGoal {
  return (
    value === 'reduce_pain' ||
    value === 'return_to_exercise' ||
    value === 'sleep' ||
    value === 'mobility'
  );
}

export default function GoalScreen() {
  const { answers, setAnswer } = useOnboarding();
  const selected = (answers.main_goal ?? []).filter(isGoal);

  return (
    <SelectQuestion
      testID="goal"
      step="goal"
      ask={COPY.ask}
      askMood="notes"
      mode="multi"
      options={OPTIONS}
      selected={selected}
      onChange={(next) => setAnswer('main_goal', next)}
      analyticsValue={(value) => value}
      contentStyle={obCenterContent}
    />
  );
}
