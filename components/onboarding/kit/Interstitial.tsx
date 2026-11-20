import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ObFooter } from './ObFooter';
import { ObScreen } from './ObScreen';
import { PrimaryButton } from './PrimaryButton';
import { RevealText } from './RevealText';
import { ob, obType } from './tokens';

export type InterstitialProps = {
  chapter?: 1 | 2 | 3 | 4 | null;
  progress?: number;
  eyebrow?: string;
  /** Wrap words in `Hl` or `HlClay` to recolor them. */
  title: React.ReactNode;
  body?: string;
  hero?: React.ReactNode;
  /** Default `top`. `below` puts the hero under the title. */
  heroPosition?: 'top' | 'below';
  children?: React.ReactNode;
  /** Default "Continue". */
  cta?: string;
  onContinue: () => void;
  /** Default `center`. */
  align?: 'center' | 'left';
  /** Passed to the screen body. Short beats use `obCenterContent`. */
  contentStyle?: StyleProp<ViewStyle>;
};

type HighlightProps = { children: React.ReactNode };

export function Hl({ children }: HighlightProps) {
  return <Text style={styles.hl}>{children}</Text>;
}

export function HlClay({ children }: HighlightProps) {
  return <Text style={styles.hlClay}>{children}</Text>;
}

const RISE = 12;
const STEP_MS = 90;

function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const anim = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;

  useEffect(() => {
    if (!ready || reduce === null) return;
    if (reduce) {
      anim.setValue(1);
      return;
    }
    const motion = Animated.timing(anim, {
      toValue: 1,
      duration: ob.motion.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start();
    return () => motion.stop();
  }, [ready, reduce, delay, anim]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [RISE, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function Interstitial({
  chapter,
  progress,
  eyebrow,
  title,
  body,
  hero,
  heroPosition = 'top',
  children,
  cta = 'Continue',
  onContinue,
  align = 'center',
  contentStyle,
}: InterstitialProps) {
  const centered = align === 'center';
  const alignText = { textAlign: centered ? ('center' as const) : ('left' as const) };
  let order = 0;
  const nextDelay = () => {
    const delay = order * STEP_MS;
    order += 1;
    return delay;
  };

  const titleBlock = (
    <View style={styles.titleBlock}>
      {eyebrow ? <Text style={[obType.micro, alignText]}>{eyebrow}</Text> : null}
      <RevealText style={[obType.display, styles.title, alignText]}>{title}</RevealText>
    </View>
  );

  const heroBlock = hero ? (
    <View style={[styles.hero, centered ? styles.heroCenter : styles.heroLeft]}>{hero}</View>
  ) : null;

  const blocks: React.ReactNode[] = [];
  if (heroBlock && heroPosition === 'top') {
    blocks.push(
      <Rise key="hero" delay={nextDelay()}>
        {heroBlock}
      </Rise>,
    );
  }
  blocks.push(
    <Rise key="title" delay={nextDelay()}>
      {titleBlock}
    </Rise>,
  );
  if (heroBlock && heroPosition === 'below') {
    blocks.push(
      <Rise key="hero" delay={nextDelay()}>
        {heroBlock}
      </Rise>,
    );
  }
  if (body) {
    blocks.push(
      <Rise key="body" delay={nextDelay()}>
        <Text style={[obType.body, styles.body, alignText, centered ? styles.bodyCenter : null]}>
          {body}
        </Text>
      </Rise>,
    );
  }
  if (children) {
    blocks.push(
      <Rise key="extra" delay={nextDelay()}>
        <View style={styles.extra}>{children}</View>
      </Rise>,
    );
  }

  return (
    <ObScreen
      chapter={chapter}
      progress={progress}
      contentStyle={contentStyle}
      footer={
        <ObFooter>
          <PrimaryButton label={cta} onPress={onContinue} />
        </ObFooter>
      }
    >
      <View style={styles.column}>{blocks}</View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: 12,
    alignItems: 'stretch',
  },
  titleBlock: {
    gap: 12,
    alignSelf: 'stretch',
    marginTop: 36,
  },
  title: {
    alignSelf: 'stretch',
  },
  body: {
    maxWidth: 320,
  },
  bodyCenter: {
    alignSelf: 'center',
  },
  hero: {
    alignSelf: 'stretch',
  },
  heroCenter: {
    alignItems: 'center',
  },
  heroLeft: {
    alignItems: 'flex-start',
  },
  extra: {
    alignSelf: 'stretch',
    gap: ob.space.row,
  },
  hl: {
    color: ob.color.accent,
  },
  hlClay: {
    color: ob.color.clay,
  },
});
