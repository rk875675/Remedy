import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MeetHatch } from '../../components/onboarding/coldopen/MeetHatch';
import { GroundShadow, MeadowStage } from '../../components/onboarding/coldopen/MeadowStage';
import { ObFooter, ObScreen, PrimaryButton, RevealText, ob } from '../../components/onboarding/kit';
import { useObStep } from '../../lib/onboardingFlow';
import { useReduceMotion } from '../../lib/useReduceMotion';

const COPY = {
  asleep: "Someone's curled up in here.",
  awake: 'Meet your armadillo.',
  open: 'Open',
  continue: 'Continue',
} as const;

/** Hill drawn on behind the pinned footer. */
const BELOW = 260;
/** How far the heading sits below the back button. */
const HEADING_DROP = 108;

/** Fades and rises in once on mount. Re-key it to play again. */
function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const anim = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      anim.setValue(1);
      return;
    }
    const motion = Animated.timing(anim, {
      toValue: 1,
      duration: ob.motion.slow,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    motion.start();
    return () => motion.stop();
  }, [anim, delay, reduce]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const ZS = [
  { size: 15, delay: 0 },
  { size: 19, delay: 800 },
  { size: 24, delay: 1600 },
];

/** Zs floating up off the sleeping ball. */
function Snore({ on }: { on: boolean }) {
  const reduce = useReduceMotion();
  const values = useRef(ZS.map(() => new Animated.Value(0))).current;
  const shown = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce !== false || !on) return;
    const loops = values.map((value, i) =>
      Animated.sequence([
        Animated.delay(ZS[i]?.delay ?? 0),
        Animated.loop(
          Animated.timing(value, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ),
      ]),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [on, reduce, values]);

  useEffect(() => {
    const anim = Animated.timing(shown, {
      toValue: on ? 1 : 0,
      duration: ob.motion.fast,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [on, shown]);

  return (
    <Animated.View pointerEvents="none" style={[styles.snore, { opacity: shown }]}>
      {ZS.map((z, i) => {
        const value = values[i];
        if (!value) return null;
        const still = reduce !== false;
        return (
          <Animated.Text
            key={z.size}
            style={[
              styles.z,
              {
                fontSize: z.size,
                left: i * 12,
                top: 30 - i * 16,
                opacity: still ? 0.8 : value.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                transform: still
                  ? []
                  : [
                      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [10, -30] }) },
                      { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
                      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.1] }) },
                    ],
              },
            ]}
          >
            z
          </Animated.Text>
        );
      })}
    </Animated.View>
  );
}

export default function MeetScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const { chapter, progress, goNext } = useObStep('meet');
  const reduce = useReduceMotion();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [opened, setOpened] = useState(false);
  const [grown, setGrown] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const left = useRef(false);

  const tight = windowHeight < 700;
  const petSize = tight ? 176 : 214;
  const groundY = Math.round(box.height * (tight ? 0.76 : 0.74));
  const instant = reduce !== false;

  useFocusEffect(
    useCallback(() => {
      left.current = false;
    }, []),
  );

  function handleOpen() {
    if (opened) return;
    setOpened(true);
    if (instant) {
      setShowTitle(true);
      setGrown(true);
    }
  }

  function handleContinue() {
    if (left.current || !grown) return;
    left.current = true;
    goNext();
  }

  return (
    <ObScreen
      testID="meet"
      chapter={chapter}
      progress={progress}
      background="plain"
      scroll={false}
      footerColor="transparent"
      contentStyle={styles.frame}
      footer={
        <ObFooter>
          <View style={styles.footerSlot}>
            {!opened ? (
              <PrimaryButton testID="open" label={COPY.open} variant="ink" onPress={handleOpen} />
            ) : grown ? (
              instant ? (
                <PrimaryButton testID="continue" label={COPY.continue} variant="ink" onPress={handleContinue} />
              ) : (
                <Rise delay={0}>
                  <PrimaryButton testID="continue" label={COPY.continue} variant="ink" onPress={handleContinue} />
                </Rise>
              )
            ) : null}
          </View>
        </ObFooter>
      }
    >
      <View
        style={styles.fill}
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          const height = Math.round(event.nativeEvent.layout.height);
          setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
        }}
      >
        {box.width > 0 && box.height > 0 ? (
          <>
            <MeadowStage width={box.width} height={box.height} groundY={groundY} below={BELOW} />
            <View
              style={[
                styles.crest,
                { top: groundY - petSize, left: (box.width - petSize) / 2, width: petSize, height: petSize },
              ]}
            >
              <GroundShadow width={petSize * 0.7} />
              <MeetHatch
                size={petSize}
                open={opened}
                instant={instant}
                onArrive={() => setShowTitle(true)}
                onDone={() => setGrown(true)}
              />
              <Snore on={!opened} />
            </View>
          </>
        ) : null}

        <View style={[styles.copy, { paddingTop: tight ? 72 : HEADING_DROP }]} pointerEvents="none">
          {!opened ? (
            <RevealText key="asleep" style={[styles.title, tight ? styles.titleTight : null]}>
              {COPY.asleep}
            </RevealText>
          ) : showTitle ? (
            <RevealText key="awake" style={[styles.title, tight ? styles.titleTight : null]}>
              {COPY.awake}
            </RevealText>
          ) : null}
        </View>
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  fill: {
    flex: 1,
  },
  copy: {
    paddingHorizontal: ob.space.screen,
  },
  title: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: -1.3,
    color: ob.color.ink,
    textAlign: 'center',
  },
  titleTight: {
    fontSize: 34,
    lineHeight: 38,
  },
  crest: {
    position: 'absolute',
  },
  snore: {
    position: 'absolute',
    right: -18,
    top: -26,
    width: 60,
    height: 60,
  },
  z: {
    position: 'absolute',
    fontWeight: '800',
    color: ob.color.accentDeep,
  },
  footerSlot: {
    minHeight: ob.size.button,
    justifyContent: 'center',
    marginBottom: 28,
  },
});
