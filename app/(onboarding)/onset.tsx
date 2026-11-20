import { SelectQuestion, type SelectOption } from '../../components/onboarding/kit';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import { ONSET } from '../../lib/intake';

const COPY = {
  ask: 'How did it start?',
  injury: 'An injury or accident',
  lifting: 'Lifting or one wrong move',
  surgery: 'After surgery',
  pregnancy: 'During or after pregnancy',
  gradual: 'It built up over time',
  sudden: 'It just appeared one day',
  unsure: "I'm not sure",
  reactInjury: 'An injury. Ouch. Noted.',
  reactLift: 'One wrong move. Noted.',
  reactSurgery: "Okay. We'll be careful with that.",
  reactPregnancy: 'Makes sense. Bodies change a lot.',
  reactGradual: 'It built up. The usual story.',
  reactSudden: 'Showed up one day. Noted.',
  reactUnsure: "No clear start. That's common.",
} as const;

type Onset = (typeof ONSET)[number];

const OPTIONS: readonly SelectOption<Onset>[] = [
  { value: 'injury', label: COPY.injury, image: OPTION_SCENES.injury, reaction: { line: COPY.reactInjury, mood: 'concerned' } },
  { value: 'lifting', label: COPY.lifting, image: OPTION_SCENES.lift, reaction: { line: COPY.reactLift, mood: 'concerned' } },
  {
    value: 'surgery',
    label: COPY.surgery,
    image: OPTION_SCENES.surgery,
    reaction: { line: COPY.reactSurgery, mood: 'concerned' },
  },
  {
    value: 'pregnancy',
    label: COPY.pregnancy,
    image: OPTION_SCENES.pregnant,
    reaction: { line: COPY.reactPregnancy, mood: 'ready' },
  },
  {
    value: 'gradual',
    label: COPY.gradual,
    image: OPTION_SCENES.gradual,
    reaction: { line: COPY.reactGradual, mood: 'ready' },
  },
  { value: 'sudden', label: COPY.sudden, image: OPTION_SCENES.sudden, reaction: { line: COPY.reactSudden, mood: 'ready' } },
  {
    value: 'unsure',
    label: COPY.unsure,
    image: OPTION_SCENES.shrug,
    reaction: { line: COPY.reactUnsure, mood: 'ready' },
  },
];

export default function OnsetScreen() {
  const { intake, setIntake, clearIntake } = useOnboarding();
  const selected = intake.onset === undefined ? [] : [intake.onset];

  return (
    <SelectQuestion
      testID="onset"
      step="onset"
      ask={COPY.ask}
      askMood="inspect"
      options={OPTIONS}
      mode="single"
      selected={selected}
      analyticsPrefix="onset"
      onChange={(next) => {
        const value = next[0];
        if (value) setIntake('onset', value);
        else clearIntake('onset');
      }}
    />
  );
}
