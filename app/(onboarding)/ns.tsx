import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  HlClay,
  ObFooter,
  ObScreen,
  PrimaryButton,
  RevealText,
  QuickDeck,
  type QuickCard,
  ob,
  obType,
} from '../../components/onboarding/kit';
import { Pet } from '../../components/pet/Pet';
import { useOnboarding } from '../../context/OnboardingContext';
import { NS_LEVEL, NS_PREDICTABLE, type Intake } from '../../lib/intake';
import { useObStep } from '../../lib/onboardingFlow';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useOnboardingPet } from '../../lib/useOnboardingPet';
import { useReduceMotion } from '../../lib/useReduceMotion';

type NsKey = keyof Intake['ns'];
type NsPartial = Partial<Intake['ns']>;
type Phase = 'intro' | 'deck';

const NS_KEYS = ['predictable', 'small_triggers', 'stress', 'anticipation', 'avoidance'] as const satisfies readonly NsKey[];

const LEVEL_OPTIONS = [
  { value: 'no', label: 'Not really' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'yes', label: 'Yes' },
] as const;

const CARDS: QuickCard<NsKey>[] = [
  {
    key: 'predictable',
    prompt: 'Is it predictable from day to day?',
    options: [
      { value: 'yes', label: 'Pretty much' },
      { value: 'varies', label: 'It varies a bit' },
      { value: 'no', label: 'Not at all' },
    ],
  },
  {
    key: 'small_triggers',
    prompt: 'Can small things set it off?',
    options: [...LEVEL_OPTIONS],
  },
  {
    key: 'stress',
    prompt: 'Does it flare with stress or a bad night?',
    options: [...LEVEL_OPTIONS],
  },
  {
    key: 'anticipation',
    prompt: 'Can just expecting it bring it on?',
    options: [...LEVEL_OPTIONS],
  },
  {
    key: 'avoidance',
    prompt: 'Do you avoid certain movements because of it?',
    options: [...LEVEL_OPTIONS],
  },
];

const COPY = {
  titleLead: 'Is your ',
  titleMark: 'nervous system',
  titleTail: ' involved?',
  start: 'Start',
} as const;

const PET_SIZE = 252;

type SegmentTone = 'quiet' | 'middle' | 'up';

/**
 * Quiet answers are accent: "yes" on predictable, "no" on the other four.
 * The middle answer is warn. The turned-up answer (predictable "no", else "yes") is clay.
 */
function segmentTone(key: NsKey, value: string): SegmentTone {
  if (key === 'predictable') {
    if (value === 'yes') return 'quiet';
    if (value === 'varies') return 'middle';
    return 'up';
  }
  if (value === 'no') return 'quiet';
  if (value === 'sometimes') return 'middle';
  return 'up';
}

const TONE_COLOR: Record<SegmentTone, string> = {
  quiet: ob.color.accent,
  middle: ob.color.warn,
  up: ob.color.clay,
};

const TONE_WORD: Record<SegmentTone, string> = {
  quiet: 'quiet',
  middle: 'partly',
  up: 'turned up',
};

function isMember<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function hasNsAnswer(value: NsPartial): boolean {
  return (
    value.predictable !== undefined ||
    value.small_triggers !== undefined ||
    value.stress !== undefined ||
    value.anticipation !== undefined ||
    value.avoidance !== undefined
  );
}

function nsComplete(value: NsPartial): value is Intake['ns'] {
  return (
    value.predictable !== undefined &&
    value.small_triggers !== undefined &&
    value.stress !== undefined &&
    value.anticipation !== undefined &&
    value.avoidance !== undefined
  );
}

function applyAnswer(current: NsPartial, key: NsKey, value: string): NsPartial | null {
  if (key === 'predictable') {
    if (!isMember(NS_PREDICTABLE, value)) return null;
    return { ...current, predictable: value };
  }
  if (!isMember(NS_LEVEL, value)) return null;
  switch (key) {
    case 'small_triggers':
      return { ...current, small_triggers: value };
    case 'stress':
      return { ...current, stress: value };
    case 'anticipation':
      return { ...current, anticipation: value };
    case 'avoidance':
      return { ...current, avoidance: value };
    default:
      return null;
  }
}

function meterLabel(answers: NsPartial): string {
  const parts = NS_KEYS.map((key, index) => {
    const value = answers[key];
    if (value === undefined) return `${index + 1} unanswered`;
    return `${index + 1} ${TONE_WORD[segmentTone(key, value)]}`;
  });
  return `Alarm meter, ${parts.join(', ')}`;
}

function NsMeter({ answers }: { answers: NsPartial }) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={meterLabel(answers)}
      style={styles.meter}
    >
      {NS_KEYS.map((key) => {
        const value = answers[key];
        const filled = value !== undefined;
        return (
          <View
            key={key}
            style={[
              styles.segment,
              { backgroundColor: filled ? TONE_COLOR[segmentTone(key, value)] : '#D3C4B0' },
            ]}
          />
        );
      })}
    </View>
  );
}

function IntroPet() {
  const { stage, name } = useOnboardingPet();
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const label = name && name.trim() ? name.trim() : 'Your armadillo';

  useEffect(() => {
    if (!ready || reduce === null) return;
    if (reduce) {
      scale.setValue(1);
      opacity.setValue(1);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: ob.motion.spring.tension,
          friction: ob.motion.spring.friction,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ready, reduce, scale, opacity]);

  return (
    <View style={styles.petSeat}>
      <View pointerEvents="none" style={styles.ground} />
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Pet stage={stage} mood="alarm" size={PET_SIZE} accessibilityLabel={label} />
      </Animated.View>
    </View>
  );
}

function Intro() {
  return (
    <View style={styles.intro}>
      <IntroPet />
      <RevealText style={styles.title}>
        {COPY.titleLead}
        <HlClay>{COPY.titleMark}</HlClay>
        {COPY.titleTail}
      </RevealText>
    </View>
  );
}

function Deck({
  answers,
  onAnswer,
  onDone,
}: {
  answers: NsPartial;
  onAnswer: (key: NsKey, value: string) => void;
  onDone: () => void;
}) {
  const header = useCallback((_index: number, _total: number): ReactNode => {
    return <NsMeter answers={answers} />;
  }, [answers]);

  return (
    <View style={styles.deck}>
      <QuickDeck cards={CARDS} answers={answers} onAnswer={onAnswer} onDone={onDone} header={header} />
    </View>
  );
}

export default function NsScreen() {
  const { chapter, progress, goNext } = useObStep('ns');
  const { intake, progress: saved, setIntake, setLocalAnswer } = useOnboarding();
  const restored = intake.ns ?? saved?.ns_draft ?? {};
  const [phase, setPhase] = useState<Phase>(hasNsAnswer(restored) ? 'deck' : 'intro');
  const [ns, setNs] = useState<NsPartial>(restored);
  const nsRef = useRef<NsPartial>(restored);
  const adopted = useRef(hasNsAnswer(restored));
  const left = useRef(false);

  useEffect(() => {
    if (adopted.current) return;
    const next = intake.ns ?? saved?.ns_draft;
    if (!next || !hasNsAnswer(next)) return;
    adopted.current = true;
    nsRef.current = next;
    setNs(next);
    setPhase('deck');
  }, [intake.ns, saved?.ns_draft]);

  useFocusEffect(
    useCallback(() => {
      left.current = false;
    }, []),
  );

  const backToIntro = useCallback(() => {
    setPhase('intro');
  }, []);

  function onAnswer(key: NsKey, value: string) {
    const next = applyAnswer(nsRef.current, key, value);
    if (next === null) return;
    nsRef.current = next;
    setNs(next);
    setLocalAnswer('ns_draft', next);
    if (nsComplete(next)) setIntake('ns', next);
  }

  function finish() {
    if (left.current) return;
    const current = nsRef.current;
    if (nsComplete(current)) setIntake('ns', current);
    left.current = true;
    goNext(5);
  }

  return (
    <ObScreen
      testID="ns"
      chapter={chapter}
      progress={progress}
      scroll={phase === 'intro'}
      onBack={phase === 'deck' ? backToIntro : undefined}
      contentStyle={phase === 'deck' ? styles.deckFill : styles.introFill}
      footer={
        phase === 'intro' ? (
          <ObFooter>
            <PrimaryButton testID="ns-start" label={COPY.start} onPress={() => setPhase('deck')} />
          </ObFooter>
        ) : undefined
      }
    >
      {phase === 'intro' ? <Intro /> : <Deck answers={ns} onAnswer={onAnswer} onDone={finish} />}
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  introFill: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: ob.space.md,
  },
  intro: {
    alignItems: 'center',
    gap: ob.space.md,
  },
  petSeat: {
    width: 300,
    height: 272,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  ground: {
    position: 'absolute',
    bottom: 8,
    width: 176,
    height: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(28, 28, 30, 0.08)',
  },
  title: {
    ...obType.display,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -0.8,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  deckFill: {
    flex: 1,
  },
  deck: {
    flex: 1,
  },
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ob.size.progressGap,
    marginBottom: ob.space.sm,
  },
  segment: {
    flex: 1,
    height: 12,
    borderRadius: 6,
  },
});
