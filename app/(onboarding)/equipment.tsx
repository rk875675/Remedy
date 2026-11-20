import { SelectQuestion, obCenterContent, type SelectOption } from '../../components/onboarding/kit';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';

const EQUIPMENT = ['gym', 'bands_dumbbells', 'open_space'] as const;
type EquipmentValue = (typeof EQUIPMENT)[number];

const COPY = {
  ask: 'What can you train with?',
} as const;

const OPTIONS: ReadonlyArray<SelectOption<EquipmentValue>> = [
  {
    value: 'gym',
    label: 'Full gym',
    sub: 'Machines, free weights, cables',
    image: OPTION_SCENES.gym,
    badge: 'Most room to grow',
    reaction: { line: 'A whole gym. Fancy.', mood: 'celebrating' },
  },
  {
    value: 'bands_dumbbells',
    label: 'Bands or dumbbells',
    sub: 'At home',
    image: OPTION_SCENES.band,
    reaction: { line: "That's plenty to work with.", mood: 'ready' },
  },
  {
    value: 'open_space',
    label: 'Just floor space',
    sub: 'Bodyweight only',
    image: OPTION_SCENES.mat,
    reaction: { line: 'Floor space is all we need to start.', mood: 'ready' },
  },
];

function knownEquipment(value: string | null | undefined): EquipmentValue[] {
  if (value === 'gym' || value === 'bands_dumbbells' || value === 'open_space') return [value];
  return [];
}

export default function EquipmentScreen() {
  const { answers, setAnswer, clearAnswer } = useOnboarding();

  return (
    <SelectQuestion
      testID="equipment"
      step="equipment"
      ask={COPY.ask}
      askMood="lifting"
      options={OPTIONS}
      mode="single"
      selected={knownEquipment(answers.equipment)}
      onChange={(next) => {
        const value = next[0];
        if (value) setAnswer('equipment', value);
        else clearAnswer('equipment');
      }}
      analyticsValue={(value) => value}
      contentStyle={obCenterContent}
    />
  );
}
