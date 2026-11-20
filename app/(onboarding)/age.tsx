import { SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { useOnboarding } from '../../context/OnboardingContext';
import { AGE_BAND, type Intake } from '../../lib/intake';

type AgeBand = (typeof AGE_BAND)[number];

const COPY = {
  ask: 'How old are you?',
} as const;

const OPTIONS: ReadonlyArray<SelectOption<AgeBand>> = [
  { value: 'u30', label: 'Under 30' },
  { value: '30_44', label: '30 to 44' },
  { value: '45_59', label: '45 to 59' },
  { value: '60_69', label: '60 to 69' },
  { value: '70p', label: '70 or older' },
];

function knownAge(value: Intake['age_band'] | undefined): AgeBand[] {
  if (value && (AGE_BAND as readonly string[]).includes(value)) return [value];
  return [];
}

export default function AgeScreen() {
  const { intake, setIntake, clearIntake } = useOnboarding();

  return (
    <SelectQuestion
      testID="age"
      step="age"
      ask={COPY.ask}
      askMood="thinking"
      options={OPTIONS}
      mode="single"
      selected={knownAge(intake.age_band)}
      onChange={(next) => {
        const value = next[0];
        if (value) setIntake('age_band', value);
        else clearIntake('age_band');
      }}
      contentStyle={obCenterContent}
    />
  );
}
