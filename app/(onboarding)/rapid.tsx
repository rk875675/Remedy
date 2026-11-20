import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Icon, ObScreen, QuickDeck, type QuickCard, ob, obType } from '../../components/onboarding/kit';
import { Pet } from '../../components/pet/Pet';
import { useOnboarding } from '../../context/OnboardingContext';
import { FLARE_SETTLE, LIMITATION, TREND } from '../../lib/intake';
import { trackOption, useObStep } from '../../lib/onboardingFlow';
import { useOnboardingPet } from '../../lib/useOnboardingPet';

type RapidKey = 'flare_settle' | 'trend' | 'limitation';

const CARDS: QuickCard<RapidKey>[] = [
  {
    key: 'flare_settle',
    prompt: 'After a flare-up, how long until it settles?',
    options: [
      { value: 'minutes', label: 'Minutes' },
      { value: 'hours', label: 'A few hours' },
      { value: 'day', label: 'By the next day' },
      { value: 'days', label: 'Days or longer' },
      { value: 'none', label: "It doesn't really flare" },
    ],
  },
  {
    key: 'trend',
    prompt: 'Which way is it heading?',
    options: [
      { value: 'better', label: 'Slowly better' },
      { value: 'same', label: 'About the same' },
      { value: 'worse', label: 'Getting worse' },
      { value: 'up_down', label: 'Up and down' },
    ],
  },
  {
    key: 'limitation',
    prompt: 'How much does it get in your way?',
    options: [
      { value: 'none', label: "It doesn't" },
      { value: 'little', label: 'A little' },
      { value: 'some_days', label: 'Some days' },
      { value: 'most_days', label: 'Most days' },
      { value: 'a_lot', label: 'A lot, every day' },
    ],
  },
];

function isMember<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

const PET_SIZE = 64;

export default function RapidScreen() {
  const { chapter, progress, goNext } = useObStep('rapid');
  const { intake, setIntake } = useOnboarding();
  const { stage, name } = useOnboardingPet();
  const left = useRef(false);
  const petLabel = name?.trim() ? name.trim() : 'Your armadillo';

  useFocusEffect(
    useCallback(() => {
      left.current = false;
    }, []),
  );

  const answers = {
    flare_settle: intake.flare_settle,
    trend: intake.trend,
    limitation: intake.limitation,
  };

  function onAnswer(key: RapidKey, value: string) {
    if (key === 'flare_settle' && isMember(FLARE_SETTLE, value)) {
      setIntake('flare_settle', value);
      trackOption('rapid', `flare_${value}`);
      return;
    }
    if (key === 'trend' && isMember(TREND, value)) {
      setIntake('trend', value);
      trackOption('rapid', `trend_${value}`);
      return;
    }
    if (key === 'limitation' && isMember(LIMITATION, value)) {
      setIntake('limitation', value);
      trackOption('rapid', `limit_${value}`);
    }
  }

  function finish() {
    if (left.current) return;
    left.current = true;
    goNext(3);
  }

  const header = useCallback(() => {
    return (
      <View style={styles.headerRow}>
        <Pet stage={stage} mood="clipboard" size={PET_SIZE} accessibilityLabel={petLabel} />
        <View style={styles.kickerRow}>
          <Icon name="flash-outline" size={14} color={ob.color.clay} />
          <Text style={styles.kicker}>QUICK ROUND</Text>
        </View>
      </View>
    );
  }, [petLabel, stage]);

  return (
    <ObScreen testID="rapid" chapter={chapter} progress={progress} scroll={false} contentStyle={styles.fill}>
      <QuickDeck cards={CARDS} answers={answers} onAnswer={onAnswer} onDone={finish} header={header} />
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: ob.space.sm,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kicker: {
    ...obType.micro,
    color: ob.color.clay,
  },
});
