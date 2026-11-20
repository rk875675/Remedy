import type { PetMood } from '../../constants/petImages';
import { SelectQuestion, type SelectOption } from '../../components/onboarding/kit';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import { MOVEMENT_FEEL, type Intake } from '../../lib/intake';

type Movement = (typeof MOVEMENT_FEEL)[number];

const COPY = {
  ask: 'How does moving feel?',
} as const;

const OPTIONS: ReadonlyArray<SelectOption<Movement>> = [
  { value: 'stiff', label: 'Stiff', image: OPTION_SCENES.stiff },
  { value: 'weak', label: 'Weak', image: OPTION_SCENES.weak },
  { value: 'unstable', label: 'Wobbly or unstable', image: OPTION_SCENES.wobble },
  { value: 'uneven', label: 'Uneven, one side works harder', image: OPTION_SCENES.uneven },
  { value: 'unsafe', label: 'Unsafe, like it could go any second', image: OPTION_SCENES.unsafe },
];

const REACTIONS: Record<Exclude<Movement, 'guarded'>, { line: string; mood: PetMood }> = {
  unsafe: {
    line: 'That feeling is real.',
    mood: 'concerned',
  },
  weak: { line: 'Weak is the most fixable one.', mood: 'ready' },
  stiff: { line: 'Stiff. Join the club.', mood: 'stiff' },
  unstable: { line: 'Wobbly. We go steady.', mood: 'ready' },
  uneven: { line: 'One side is working harder.', mood: 'ready' },
};

export default function MovementScreen() {
  const { intake, setIntake } = useOnboarding();
  const selected = intake.movement_feel ?? [];

  function persist(next: Intake['movement_feel']) {
    setIntake('movement_feel', next);
  }

  return (
    <SelectQuestion
      step="movement"
      testID="movement"
      ask={COPY.ask}
      askMood="stiff"
      options={OPTIONS}
      mode="multi"
      allowNone
      selected={selected}
      onChange={persist}
      onContinue={persist}
      reactionFor={(current, anchor) => {
        const pick =
          anchor !== null && anchor !== 'guarded' && current.includes(anchor)
            ? anchor
            : [...current].reverse().find((value) => value !== 'guarded');
        return pick ? REACTIONS[pick] : null;
      }}
      analyticsPrefix="movement"
    />
  );
}
