import { SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import { DURATION_DETAIL, durationBucketFor } from '../../lib/intake';

const COPY = {
  ask: 'How long has this been going on?',
  lt2w: 'Less than 2 weeks',
  mid: '2 weeks to 3 months',
  year: '3 to 12 months',
  years: '1 to 5 years',
  long: 'More than 5 years',
  reactFresh: 'Fresh. We go gently.',
  reactEarly: 'Still early. Good time to act.',
  reactMonths: "Months of this. That's enough.",
  reactYears: "Years. You've been patient enough.",
  reactAges: 'That long? Then we take this seriously.',
} as const;

type DurationDetail = (typeof DURATION_DETAIL)[number];

const OPTIONS: readonly SelectOption<DurationDetail>[] = [
  { value: 'lt_2w', label: COPY.lt2w, image: OPTION_SCENES.fresh, reaction: { line: COPY.reactFresh, mood: 'ready' } },
  { value: '2w_3m', label: COPY.mid, image: OPTION_SCENES.early, reaction: { line: COPY.reactEarly, mood: 'ready' } },
  {
    value: '3_12m',
    label: COPY.year,
    image: OPTION_SCENES.months,
    reaction: { line: COPY.reactMonths, mood: 'concerned' },
  },
  { value: '1_5y', label: COPY.years, image: OPTION_SCENES.years, reaction: { line: COPY.reactYears, mood: 'concerned' } },
  {
    value: '5y_plus',
    label: COPY.long,
    image: OPTION_SCENES.ages,
    reaction: { line: COPY.reactAges, mood: 'concerned' },
  },
];

export default function DurationScreen() {
  const { intake, setIntake, clearIntake, setAnswer, clearAnswer } = useOnboarding();
  const selected = intake.duration_detail === undefined ? [] : [intake.duration_detail];

  return (
    <SelectQuestion
      testID="duration"
      step="duration"
      ask={COPY.ask}
      askMood="thinking"
      options={OPTIONS}
      mode="single"
      selected={selected}
      analyticsValue={(value) => durationBucketFor(value)}
      onChange={(next) => {
        const value = next[0];
        if (!value) {
          clearIntake('duration_detail');
          clearAnswer('pain_duration');
          return;
        }
        setIntake('duration_detail', value);
        setAnswer('pain_duration', durationBucketFor(value));
      }}
      contentStyle={obCenterContent}
    />
  );
}
