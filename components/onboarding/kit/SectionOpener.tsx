import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { PetMood } from '../../../constants/petImages';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useOnboardingPet } from '../../../lib/useOnboardingPet';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Pet } from '../../pet/Pet';
import { PetBubble } from '../../pet/PetSays';
import { ObFooter } from './ObFooter';
import { ObScreen } from './ObScreen';
import { PrimaryButton } from './PrimaryButton';
import * as rich from './rich';
import { ob, obType } from './tokens';

export type SectionOpenerProps = {
  line: string;
  mood: PetMood;
  /** Default "Let's go". */
  cta?: string;
  onContinue: () => void;
  chapter: 1 | 2 | 3 | 4;
  /** Small label above the bubble, for example "PART 2 OF 4". */
  kicker?: string;
};

type SparklesProps = { size: number };

function sparklesFrom(mod: object): React.ComponentType<SparklesProps> | null {
  const value = (mod as { Sparkles?: unknown }).Sparkles;
  if (typeof value === 'function') return value as React.ComponentType<SparklesProps>;
  if (typeof value === 'object' && value !== null && '$$typeof' in value) {
    return value as React.ComponentType<SparklesProps>;
  }
  return null;
}

function SparkleField({ size }: { size: number }) {
  const Comp = sparklesFrom(rich);
  if (!Comp) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Comp size={size} />
    </View>
  );
}

/**
 * Chapter title. The hero pet pops in just after the screen finishes pushing.
 * PetBubble types the line. It does not accept a text style, so the bubble
 * keeps PetSays' own type.
 */
export function SectionOpener({
  line,
  mood,
  cta = "Let's go",
  onContinue,
  chapter,
  kicker,
}: SectionOpenerProps) {
  const { stage, name } = useOnboardingPet();
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const scale = useRef(new Animated.Value(0.86)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(reduce === true ? 0 : 18)).current;
  const label = name && name.trim() ? name.trim() : 'Your armadillo';

  useEffect(() => {
    if (!ready || reduce === null) return;
    if (reduce) {
      scale.setValue(1);
      opacity.setValue(1);
      rise.setValue(0);
      return;
    }
    rise.setValue(18);
    const anim = Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: ob.motion.spring.tension,
          friction: ob.motion.spring.friction,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(rise, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ready, reduce, scale, opacity, rise]);

  return (
    <ObScreen
      chapter={chapter}
      progress={0}
      contentStyle={styles.openerContent}
      footer={
        <ObFooter>
          <PrimaryButton label={cta} onPress={onContinue} />
        </ObFooter>
      }
    >
      <View style={styles.stack}>
        <View style={styles.copy}>
          {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
          <View style={styles.bubble}>
            <PetBubble line={line} />
          </View>
        </View>
        <View style={styles.hero}>
          <SparkleField size={ob.size.petHero} />
          <View pointerEvents="none" style={styles.ground} />
          <Animated.View style={{ opacity, transform: [{ translateY: rise }, { scale }] }}>
            <Pet stage={stage} mood={mood} size={ob.size.petHero} accessibilityLabel={label} />
          </Animated.View>
        </View>
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  openerContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
    gap: ob.space.xl,
  },
  copy: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: ob.space.sm,
  },
  kicker: {
    ...obType.micro,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  bubble: {
    alignSelf: 'stretch',
  },
  hero: {
    width: ob.size.petHero + 48,
    height: ob.size.petHero + 16,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  ground: {
    position: 'absolute',
    bottom: 10,
    width: ob.size.petHero * 0.72,
    height: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(28, 28, 30, 0.08)',
  },
});
