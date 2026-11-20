import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, SelectQuestion, type SelectOption, ob, obType } from '../../components/onboarding/kit';
import { OPTION_SCENES } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import { CONDITIONS, type Intake } from '../../lib/intake';

type Condition = (typeof CONDITIONS)[number];
type Page = 'main' | 'more';

const COPY = {
  ask: 'Anything else I should know about?',
  more: 'And any of these?',
  none: 'None of these',
  reaction: "Thanks. I'll plan around it.",
  privacy: 'Only used to shape your plan.',
} as const;

const MAIN = ['sciatica', 'herniated_disc', 'arthritis', 'stenosis', 'scoliosis'] as const satisfies readonly Condition[];
const MORE = ['fibromyalgia', 'osteoporosis', 'post_surgery', 'postpartum', 'pregnant'] as const satisfies readonly Condition[];
const PAGES = { main: MAIN, more: MORE } as const;

type PageValue = (typeof MAIN)[number] | (typeof MORE)[number];
// A new condition has to be placed on one of the two pages.
const coversAll: [Exclude<Condition, PageValue>] extends [never] ? true : never = true;
void coversAll;

const OPTIONS: ReadonlyArray<SelectOption<Condition>> = [
  { value: 'sciatica', label: 'Sciatica', image: OPTION_SCENES.nerve },
  { value: 'herniated_disc', label: 'Herniated or bulging disc', image: OPTION_SCENES.disc },
  { value: 'arthritis', label: 'Arthritis', image: OPTION_SCENES.stiff },
  { value: 'stenosis', label: 'Spinal stenosis', image: OPTION_SCENES.narrow },
  { value: 'scoliosis', label: 'Scoliosis', image: OPTION_SCENES.curve },
  { value: 'fibromyalgia', label: 'Fibromyalgia', image: OPTION_SCENES.fibro },
  { value: 'osteoporosis', label: 'Osteoporosis', image: OPTION_SCENES.bone },
  { value: 'post_surgery', label: 'Back surgery', image: OPTION_SCENES.surgery },
  { value: 'postpartum', label: 'Gave birth in the last year', image: OPTION_SCENES.postpartum },
  { value: 'pregnant', label: 'Currently pregnant', image: OPTION_SCENES.pregnant },
];

function knownConditions(value: Intake['conditions'] | undefined): Condition[] {
  if (!value) return [];
  const allowed = new Set<string>(CONDITIONS);
  return value.filter((item): item is Condition => allowed.has(item));
}

function pageOf(value: Condition): Page {
  return (PAGES.more as readonly string[]).includes(value) ? 'more' : 'main';
}

function replacePage(selected: readonly Condition[], page: Page, next: readonly Condition[]): Condition[] {
  return [...selected.filter((value) => pageOf(value) !== page), ...next];
}

function PrivacyLine() {
  return (
    <View style={styles.privacy}>
      <Icon name="lock-closed-outline" size={14} color={ob.color.hint} />
      <Text style={styles.privacyText}>{COPY.privacy}</Text>
    </View>
  );
}

export default function ConditionsScreen() {
  const { intake, progress, setIntake, setLocalAnswer } = useOnboarding();
  const [page, setPage] = useState<Page>(progress?.conditions_more ? 'more' : 'main');
  const selected = knownConditions(intake.conditions);
  const visible = selected.filter((value) => pageOf(value) === page);
  const options = OPTIONS.filter((option) => pageOf(option.value) === page);

  function save(pageName: Page, next: readonly Condition[]) {
    setIntake('conditions', replacePage(selected, pageName, next));
  }

  return (
    <SelectQuestion
      key={page}
      testID={page === 'main' ? 'conditions' : 'conditions_more'}
      step="conditions"
      ask={page === 'main' ? COPY.ask : COPY.more}
      askMood="doctor"
      options={options}
      mode="multi"
      allowNone
      noneLabel={COPY.none}
      advance={page === 'more'}
      answerCount={selected.length}
      onBack={
        page === 'more'
          ? () => {
              setLocalAnswer('conditions_more', false);
              setPage('main');
            }
          : undefined
      }
      selected={visible}
      onChange={(next) => save(page, next)}
      onContinue={(current) => {
        save(page, current);
        if (page === 'main') {
          setLocalAnswer('conditions_more', true);
          setPage('more');
        }
      }}
      reactionFor={(next) =>
        next.length > 0 ? { line: COPY.reaction, mood: 'ready' } : null
      }
      belowOptions={<PrivacyLine />}
    />
  );
}

const styles = StyleSheet.create({
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  privacyText: {
    ...obType.caption,
    color: ob.color.hint,
    flex: 1,
  },
});
