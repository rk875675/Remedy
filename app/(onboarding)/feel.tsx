import { NoteCard, SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { PAIN_TYPE_IMAGES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import type { PainType } from '../../types/database';

const COPY = {
  ask: 'What does it feel like?',
  stiff: 'Stiff and tight',
  ache: 'A dull ache',
  sharp: 'Sharp or catching',
  nerve: 'Travels, tingles or goes numb',
  reactStiff: 'Stiff. Look at me. I get it.',
  reactAche: 'The dull, always-there kind. Understood.',
  reactSharp: 'Sharp. Then we go carefully.',
  reactNerve: 'Travels or tingles. Then we go gently.',
  warn: 'If this started in the last two weeks, check with a doctor if it gets worse. You can keep going.',
} as const;

const OPTIONS: readonly SelectOption<PainType>[] = [
  {
    value: 'stiffness',
    label: COPY.stiff,
    image: PAIN_TYPE_IMAGES.stiffness,
    reaction: { line: COPY.reactStiff, mood: 'stiff' },
  },
  {
    value: 'ache',
    label: COPY.ache,
    image: PAIN_TYPE_IMAGES.ache,
    reaction: { line: COPY.reactAche, mood: 'concerned' },
  },
  {
    value: 'sharp',
    label: COPY.sharp,
    image: PAIN_TYPE_IMAGES.sharp,
    reaction: { line: COPY.reactSharp, mood: 'concerned' },
  },
  {
    value: 'nerve',
    label: COPY.nerve,
    image: PAIN_TYPE_IMAGES.nerve,
    reaction: { line: COPY.reactNerve, mood: 'concerned' },
  },
];

export default function FeelScreen() {
  const { answers, setAnswer, intake } = useOnboarding();
  const selected = answers.pain_type ?? [];
  const showWarn =
    intake.duration_detail === 'lt_2w' && (selected.includes('sharp') || selected.includes('nerve'));

  return (
    <SelectQuestion
      testID="feel"
      step="feel"
      ask={COPY.ask}
      askMood="stiff"
      options={OPTIONS}
      mode="multi"
      selected={selected}
      analyticsValue={(value) => value}
      onChange={(next) => setAnswer('pain_type', next)}
      contentStyle={obCenterContent}
      belowOptions={
        showWarn ? <NoteCard tone="warn" text={COPY.warn} /> : undefined
      }
    />
  );
}
