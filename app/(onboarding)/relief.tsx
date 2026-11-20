import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import {
  AskHeader,
  ChoiceCard,
  DirectionFigure,
  ObFooter,
  ObScreen,
  OptionList,
  OptionRow,
  PrimaryButton,
  ob,
  obCenterContent,
  obType,
  useTypedDelay,
} from '../../components/onboarding/kit';
import type { PetMood } from '../../constants/petImages';
import { useOnboarding } from '../../context/OnboardingContext';
import type { Intake } from '../../lib/intake';
import { trackOption, useObStep } from '../../lib/onboardingFlow';
import { useReduceMotion } from '../../lib/useReduceMotion';

type Relief = Intake['relief_direction'];

const COPY = {
  ask: 'Which feels better?',
  flexion: 'Curling up or bending forward',
  extension: 'Standing tall or arching back',
  neither: 'No real difference',
  continue: 'Continue',
} as const;

const REACTIONS: Record<Relief, { line: string; mood: PetMood }> = {
  flexion: { line: "Rounding helps. I'm a ball.", mood: 'celebrating' },
  extension: { line: 'Opening up. We start there.', mood: 'ready' },
  neither: { line: "No favourite. We'll balance it.", mood: 'ready' },
};

const RELIEF_TOKEN = {
  flexion: 'relief_flexion',
  extension: 'relief_extension',
  neither: 'relief_neither',
} as const satisfies Record<Relief, 'relief_flexion' | 'relief_extension' | 'relief_neither'>;

const CONTINUE_LOCK_MS = 600;
const REVEAL_CAP_MS = 900;
const FIGURE_SIZE = 128;
const NEITHER: ImageSourcePropType = require('../../assets/onboarding/illo-relief-neutral.png');

/**
 * The question stays in the layout so the cards do not jump when a reaction
 * takes the bubble. Same treatment as SelectQuestion.
 */
function QuestionCaption({ ask, shown }: { ask: string; shown: boolean }) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const next = shown ? 1 : 0;
    if (reduce !== false) {
      opacity.setValue(next);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: next,
      duration: ob.motion.fast,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [shown, reduce, opacity]);

  return (
    <Animated.Text
      numberOfLines={1}
      style={[styles.caption, { opacity }]}
      selectable={false}
      pointerEvents="none"
      accessibilityRole="header"
      accessible={shown}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'yes' : 'no-hide-descendants'}
    >
      {ask}
    </Animated.Text>
  );
}

export default function ReliefScreen() {
  const { chapter, progress, goNext } = useObStep('relief');
  const { intake, setIntake, clearIntake } = useOnboarding();
  const selected = intake.relief_direction;
  const reaction = selected === undefined ? null : REACTIONS[selected];
  const revealDelay = Math.min(useTypedDelay(COPY.ask), REVEAL_CAP_MS);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function choose(value: Relief) {
    if (selected === value) {
      clearIntake('relief_direction');
      trackOption('relief', RELIEF_TOKEN[value], { deselect: true });
      return;
    }
    setIntake('relief_direction', value);
    trackOption('relief', RELIEF_TOKEN[value]);
  }

  function handleContinue() {
    if (lock.current || selected === undefined) return;
    lock.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lock.current = false;
      timer.current = null;
    }, CONTINUE_LOCK_MS);
    goNext();
  }

  return (
    <ObScreen
      testID="relief"
      chapter={chapter}
      progress={progress}
      contentStyle={obCenterContent}
      footer={
        <ObFooter>
          <PrimaryButton
            testID="continue"
            label={COPY.continue}
            disabled={selected === undefined}
            onPress={handleContinue}
          />
        </ObFooter>
      }
    >
      <AskHeader line={reaction?.line ?? COPY.ask} mood={reaction?.mood ?? 'zen'} />
      <QuestionCaption ask={COPY.ask} shown={reaction !== null} />
      <OptionList delayMs={revealDelay} gap={16}>
        <View style={styles.pair}>
          <View style={styles.cell}>
            <ChoiceCard
              testID="relief-flexion"
              title={COPY.flexion}
              selected={selected === 'flexion'}
              onPress={() => choose('flexion')}
              art={<DirectionFigure pose="curl" size={FIGURE_SIZE} active={selected === 'flexion'} />}
            />
          </View>
          <View style={styles.cell}>
            <ChoiceCard
              testID="relief-extension"
              title={COPY.extension}
              selected={selected === 'extension'}
              onPress={() => choose('extension')}
              art={<DirectionFigure pose="arch" size={FIGURE_SIZE} active={selected === 'extension'} />}
            />
          </View>
        </View>
        <OptionRow
          testID="relief-neither"
          label={COPY.neither}
          image={NEITHER}
          mode="single"
          selected={selected === 'neither'}
          onPress={() => choose('neither')}
        />
      </OptionList>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  caption: {
    ...obType.caption,
    marginTop: 12,
    marginBottom: 8,
    height: 18,
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  cell: {
    flex: 1,
    alignSelf: 'stretch',
  },
});
