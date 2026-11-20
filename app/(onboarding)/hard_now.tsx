import { useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { SelectQuestion, type SelectOption } from '../../components/onboarding/kit';
import { OPTION_SCENES, TRIGGER_ILLUSTRATIONS } from '../../constants/onboardingImages';
import { useOnboarding } from '../../context/OnboardingContext';
import { HARD_NOW, deriveLegacyTriggers } from '../../lib/intake';

const COPY = {
  ask: "What's hard right now?",
  more: 'Anything else?',
  none: 'None of these',
} as const;

type HardNow = (typeof HARD_NOW)[number];
type Page = 'main' | 'more';

const MAIN = ['bed', 'bending', 'sitting', 'standing', 'walking'] as const satisfies readonly HardNow[];
const MORE = ['stairs', 'twisting', 'overhead', 'sleep', 'exercise'] as const satisfies readonly HardNow[];
const PAGES = { main: MAIN, more: MORE } as const;

type PageValue = (typeof MAIN)[number] | (typeof MORE)[number];
// A new hard_now value has to be placed on one of the two pages.
const coversAll: [Exclude<HardNow, PageValue>] extends [never] ? true : never = true;
void coversAll;

function triggerArt(key: 'morning' | 'bending' | 'sitting' | 'standing'): ImageSourcePropType {
  const source = TRIGGER_ILLUSTRATIONS[key];
  if (source === undefined) {
    throw new Error(`Missing trigger illustration: ${key}`);
  }
  return source;
}

const OPTIONS: ReadonlyArray<SelectOption<HardNow>> = [
  {
    value: 'bed',
    label: 'Getting out of bed',
    image: triggerArt('morning'),
    reaction: {
      line: 'Getting up should not be a sport.',
      mood: 'stiff',
    },
  },
  {
    value: 'bending',
    label: 'Bending or lifting',
    image: triggerArt('bending'),
    reaction: {
      line: 'Bending down is a mean ask.',
      mood: 'concerned',
    },
  },
  {
    value: 'sitting',
    label: 'Sitting for long',
    image: triggerArt('sitting'),
    reaction: {
      line: 'Long sits make me cranky too.',
      mood: 'stiff',
    },
  },
  {
    value: 'standing',
    label: 'Standing for long',
    image: triggerArt('standing'),
    reaction: {
      line: 'Standing still is sneakily hard.',
      mood: 'concerned',
    },
  },
  {
    value: 'walking',
    label: 'Walking far',
    image: OPTION_SCENES.walk,
    reaction: {
      line: 'A long walk is a debate.',
      mood: 'concerned',
    },
  },
  {
    value: 'stairs',
    label: 'Stairs',
    image: OPTION_SCENES.stairs,
    reaction: {
      line: 'Stairs are a tiny mountain.',
      mood: 'stiff',
    },
  },
  {
    value: 'twisting',
    label: 'Twisting or turning',
    image: OPTION_SCENES.twist,
    reaction: {
      line: 'A turn that talks back is rude.',
      mood: 'stiff',
    },
  },
  {
    value: 'overhead',
    label: 'Reaching overhead',
    image: OPTION_SCENES.reach,
    reaction: {
      line: 'The top shelf is showing off.',
      mood: 'ready',
    },
  },
  {
    value: 'sleep',
    label: 'Sleeping through the night',
    image: OPTION_SCENES.sleep,
    reaction: {
      line: 'Sleep should be free.',
      mood: 'concerned',
    },
  },
  {
    value: 'exercise',
    label: 'Working out or sport',
    image: OPTION_SCENES.exercise,
    reaction: {
      line: 'You still want to train. Respect.',
      mood: 'ready',
    },
  },
];

function isHardNow(value: string): value is HardNow {
  return (HARD_NOW as readonly string[]).includes(value);
}

function pageOf(value: HardNow): Page {
  return (PAGES.more as readonly string[]).includes(value) ? 'more' : 'main';
}

function replacePage(selected: readonly HardNow[], page: Page, next: readonly HardNow[]): HardNow[] {
  return [...selected.filter((value) => pageOf(value) !== page), ...next];
}

export default function HardNowScreen() {
  const { intake, progress, setIntake, setAnswer, setLocalAnswer } = useOnboarding();
  const [page, setPage] = useState<Page>(progress?.hard_now_more ? 'more' : 'main');
  const selected = (intake.hard_now ?? []).filter(isHardNow);
  const visible = selected.filter((value) => pageOf(value) === page);
  const options = OPTIONS.filter((option) => pageOf(option.value) === page);

  function save(pageName: Page, next: readonly HardNow[], derive: boolean) {
    const merged = replacePage(selected, pageName, next);
    setIntake('hard_now', merged);
    if (derive) setAnswer('pain_trigger', deriveLegacyTriggers(merged));
  }

  return (
    <SelectQuestion
      key={page}
      testID={page === 'main' ? 'hard_now' : 'hard_now_more'}
      step="hard_now"
      ask={page === 'main' ? COPY.ask : COPY.more}
      askMood="inspect"
      mode="multi"
      allowNone
      noneLabel={COPY.none}
      advance={page === 'more'}
      answerCount={selected.length}
      onBack={
        page === 'more'
          ? () => {
              setLocalAnswer('hard_now_more', false);
              setPage('main');
            }
          : undefined
      }
      options={options}
      selected={visible}
      onChange={(next) => save(page, next, false)}
      analyticsPrefix="hard"
      onContinue={(current) => {
        if (page === 'main') {
          save('main', current, false);
          setLocalAnswer('hard_now_more', true);
          setPage('more');
          return;
        }
        save('more', current, true);
      }}
    />
  );
}
