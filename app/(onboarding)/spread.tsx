import { SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import { SPREAD } from '../../lib/intake';

const COPY = {
  ask: 'Does it stay in one place?',
  oneSpot: 'Yes, the same spot',
  oneSide: 'Mostly one side',
  moves: 'It moves around',
  leg: 'It travels into my hip or leg',
  unsure: "I'm not sure",
  reactSpot: 'One spot. Easier to aim at.',
  reactSide: 'One side is complaining.',
  reactMoves: 'A moving target. Noted.',
  reactLeg: "Travelling pain. I'll ask more.",
  reactUnsure: 'Not sure is a fine answer.',
} as const;

type Spread = (typeof SPREAD)[number];

const OPTIONS: readonly SelectOption<Spread>[] = [
  { value: 'one_spot', label: COPY.oneSpot, image: OPTION_SCENES.spot, reaction: { line: COPY.reactSpot } },
  { value: 'one_side', label: COPY.oneSide, image: OPTION_SCENES.side, reaction: { line: COPY.reactSide } },
  { value: 'moves', label: COPY.moves, image: OPTION_SCENES.wander, reaction: { line: COPY.reactMoves } },
  { value: 'leg', label: COPY.leg, image: OPTION_SCENES.downLeg, reaction: { line: COPY.reactLeg } },
  { value: 'unsure', label: COPY.unsure, image: OPTION_SCENES.shrug, reaction: { line: COPY.reactUnsure } },
];

export default function SpreadScreen() {
  const { intake, setIntake, clearIntake } = useOnboarding();
  const selected = intake.spread === undefined ? [] : [intake.spread];

  return (
    <SelectQuestion
      testID="spread"
      step="spread"
      ask={COPY.ask}
      askMood="inspect"
      options={OPTIONS}
      mode="single"
      selected={selected}
      analyticsPrefix="spread"
      onChange={(next) => {
        const value = next[0];
        if (value) setIntake('spread', value);
        else clearIntake('spread');
      }}
      contentStyle={obCenterContent}
    />
  );
}
