import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { PetMood } from '../../constants/petImages';
import {
  AskHeader,
  BackMap,
  Icon,
  ObFooter,
  ObScreen,
  PrimaryButton,
  ob,
  obType,
} from '../../components/onboarding/kit';
import { useOnboarding } from '../../context/OnboardingContext';
import { hapticSelection } from '../../lib/haptics';
import { trackOption, useObStep } from '../../lib/onboardingFlow';
import { useReduceMotion } from '../../lib/useReduceMotion';

const COPY = {
  ask: 'Where does it hurt?',
  allOver: 'All over',
  continue: 'Continue',
  upper: 'Upper back and shoulders. Got it.',
  lower: 'Low back. The classic.',
  both: "The whole thing. We'll rotate.",
} as const;

type PainLocation = 'upper' | 'lower' | 'all';

type Zones = {
  upper: boolean;
  lower: boolean;
};

const REACTIONS: Record<PainLocation, { line: string; mood: PetMood }> = {
  upper: { line: COPY.upper, mood: 'concerned' },
  lower: { line: COPY.lower, mood: 'concerned' },
  all: { line: COPY.both, mood: 'concerned' },
};

function zonesFor(location: PainLocation | undefined): Zones {
  if (location === 'all') return { upper: true, lower: true };
  if (location === 'upper') return { upper: true, lower: false };
  if (location === 'lower') return { upper: false, lower: true };
  return { upper: false, lower: false };
}

function locationFor(zones: Zones): PainLocation | null {
  if (zones.upper && zones.lower) return 'all';
  if (zones.upper) return 'upper';
  if (zones.lower) return 'lower';
  return null;
}

/**
 * Upper bound for the map. BackMap shrinks to keep the chips off the figure,
 * so a short phone still gets the largest back that fits above Continue.
 */
function mapHeightFor(windowHeight: number): number {
  if (windowHeight <= 700) return 320;
  if (windowHeight < 820) return 360;
  return 420;
}

/** Stroke sits inside the chrome, same as OptionRow, so padding adds it back. */
const CHOICE_STROKE = 1.5;
const CHECK_INK = '#FFFFFF';

function AllOverChoice({ selected, onPress }: { selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID="all-over"
      accessibilityRole="checkbox"
      accessibilityLabel={COPY.allOver}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.choiceChrome]} />
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.choiceWash]} /> : null}
      <View style={styles.choiceRow}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{COPY.allOver}</Text>
        <View style={styles.checkSlot}>
          {selected ? (
            <View style={styles.checkOn}>
              <Icon name="checkmark" size={14} color={CHECK_INK} />
            </View>
          ) : (
            <View style={styles.checkOff} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function QuestionCaption({ ask, shown }: { ask: string; shown: boolean }) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(shown ? 1 : 0)).current;

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

export default function LocationScreen() {
  const { chapter, progress, goNext } = useObStep('location');
  const { answers, setAnswer, clearAnswer } = useOnboarding();
  const { height: windowHeight } = useWindowDimensions();
  const stored = answers.pain_location;
  const [zones, setZones] = useState<Zones>(() => zonesFor(stored));
  const [reacting, setReacting] = useState(
    () => stored === 'upper' || stored === 'lower' || stored === 'all',
  );
  const dirty = useRef(false);
  const lock = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setZones(zonesFor(answers.pain_location));
  }, [answers.pain_location]);

  const place = locationFor(zones);
  const reaction = reacting && place !== null ? REACTIONS[place] : null;

  function commit(next: Zones) {
    const previous = locationFor(zones);
    const nextValue = locationFor(next);
    dirty.current = true;
    setReacting(true);
    setZones(next);
    if (previous === nextValue) return;
    if (nextValue !== null) {
      setAnswer('pain_location', nextValue);
      trackOption('location', nextValue, { deselect: false });
      return;
    }
    clearAnswer('pain_location');
    if (previous !== null) trackOption('location', previous, { deselect: true });
  }

  function handleContinue() {
    if (place === null || lock.current) return;
    lock.current = true;
    setAnswer('pain_location', place);
    goNext();
  }

  return (
    <ObScreen
      testID="location"
      chapter={chapter}
      progress={progress}
      contentStyle={styles.screen}
      footer={
        <ObFooter>
          <PrimaryButton
            testID="continue"
            label={COPY.continue}
            disabled={place === null}
            onPress={handleContinue}
          />
        </ObFooter>
      }
    >
      <AskHeader line={reaction?.line ?? COPY.ask} mood={reaction?.mood ?? 'inspect'} />
      <QuestionCaption ask={COPY.ask} shown={reaction !== null} />
      <View style={styles.mapBlock}>
        <BackMap
          upper={zones.upper}
          lower={zones.lower}
          onToggle={(zone) => commit({ ...zones, [zone]: !zones[zone] })}
          height={mapHeightFor(windowHeight)}
        />
        <AllOverChoice
          selected={place === 'all'}
          onPress={() => {
            hapticSelection();
            if (zones.upper && zones.lower) commit({ upper: false, lower: false });
            else commit({ upper: true, lower: true });
          }}
        />
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  mapBlock: {
    marginTop: ob.space.md,
    gap: ob.space.md,
  },
  caption: {
    ...obType.caption,
    marginTop: 12,
    marginBottom: 8,
    height: 18,
  },
  choice: {
    borderRadius: ob.radius.row,
    overflow: 'hidden',
  },
  choiceChrome: {
    backgroundColor: ob.color.surface,
    borderRadius: ob.radius.row,
    borderWidth: CHOICE_STROKE,
    borderColor: ob.color.line,
  },
  choiceWash: {
    backgroundColor: ob.color.accentSoft,
    borderRadius: ob.radius.row,
    borderWidth: CHOICE_STROKE,
    borderColor: ob.color.accent,
  },
  choicePressed: {
    opacity: 0.72,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12 + CHOICE_STROKE,
    paddingHorizontal: 14 + CHOICE_STROKE,
    minHeight: ob.size.rowMin,
  },
  choiceLabel: {
    ...obType.rowLabel,
    flex: 1,
  },
  choiceLabelOn: {
    color: ob.color.accentDeep,
  },
  checkSlot: {
    width: ob.size.check,
    height: ob.size.check,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOff: {
    width: ob.size.check,
    height: ob.size.check,
    borderRadius: ob.size.check / 2,
    borderWidth: CHOICE_STROKE,
    borderColor: ob.color.line,
    backgroundColor: ob.color.surface,
  },
  checkOn: {
    width: ob.size.check,
    height: ob.size.check,
    borderRadius: ob.size.check / 2,
    backgroundColor: ob.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
