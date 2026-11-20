import { SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import { LEG_REACH } from '../../lib/intake';

const COPY = {
  ask: 'How far down does it go?',
  above: 'Buttock or thigh, above the knee',
  below: 'Below the knee',
  foot: 'All the way to the foot or toes',
  reactAbove: "Above the knee. I'll plan for that.",
  reactBelow: "Below the knee. I'll plan for that.",
  reactFoot: "Down to the foot. I'll plan for that.",
} as const;

type LegReach = (typeof LEG_REACH)[number];

const OPTIONS: readonly SelectOption<LegReach>[] = [
  {
    value: 'above_knee',
    label: COPY.above,
    image: OPTION_SCENES.thigh,
    reaction: { line: COPY.reactAbove, mood: 'concerned' },
  },
  {
    value: 'below_knee',
    label: COPY.below,
    image: OPTION_SCENES.shin,
    reaction: { line: COPY.reactBelow, mood: 'concerned' },
  },
  {
    value: 'foot',
    label: COPY.foot,
    image: OPTION_SCENES.foot,
    reaction: { line: COPY.reactFoot, mood: 'concerned' },
  },
];

export default function LegScreen() {
  const { intake, setIntake, clearIntake } = useOnboarding();
  const selected = intake.leg_reach ? [intake.leg_reach] : [];

  return (
    <SelectQuestion
      testID="leg"
      step="leg"
      ask={COPY.ask}
      askMood="concerned"
      options={OPTIONS}
      mode="single"
      selected={selected}
      onChange={(next) => {
        const value = next[0];
        if (value) setIntake('leg_reach', value);
        else clearIntake('leg_reach');
      }}
      contentStyle={obCenterContent}
    />
  );
}
