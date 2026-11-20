import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { petScale, type PetMood } from '../../../constants/petImages';
import { useOnboardingPet } from '../../../lib/useOnboardingPet';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Dust, DUST_EARTH, type DustHandle } from '../../pet/Dust';
import { Pet } from '../../pet/Pet';
import { ObFooter, ObScreen, PrimaryButton, ob } from '../kit';
import {
  buildChapterEntrance,
  createEntranceRig,
  entranceFeel,
  primeEntrance,
  restEntrance,
  type BubbleFeel,
} from './chapterEntrance';

type ChapterOpenProps = {
  chapter: 1 | 2 | 3 | 4;
  title: string;
  mood: PetMood;
  cta: string;
  onContinue: () => void;
};

const LOCK_MS = 600;
/** How much of the box a full squash takes off. Feet stay down. */
const SQUASH = 0.28;
/** Warm paper, lighter than the screen, so the bubble reads without going grey. */
const BUBBLE = '#FFF8F1';

const smooth = Easing.inOut(Easing.sin);

function timing(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: (t: number) => number,
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}

/** The line opens a different way on each chapter, once the pet has arrived. */
function openBubble(
  feel: BubbleFeel,
  bubble: Animated.Value,
  pop: Animated.Value,
  tilt: Animated.Value,
): Animated.CompositeAnimation {
  const fade = (speed: number, bounciness: number) =>
    Animated.spring(bubble, { toValue: 1, speed, bounciness, useNativeDriver: true });

  if (feel === 'careful') {
    return Animated.parallel([
      fade(16, 3),
      timing(pop, 1, 260, Easing.out(Easing.cubic)),
      Animated.sequence([timing(tilt, -0.28, 130, smooth), timing(tilt, 0, 140, smooth)]),
    ]);
  }
  if (feel === 'crisp') {
    return Animated.parallel([
      fade(18, 4),
      timing(pop, 1, 320, Easing.out(Easing.cubic)),
      Animated.sequence([
        timing(tilt, 0.4, 90, Easing.out(Easing.quad)),
        timing(tilt, 0, 140, smooth),
      ]),
    ]);
  }
  if (feel === 'idea') {
    return Animated.parallel([
      fade(15, 4),
      timing(pop, 1, 300, Easing.out(Easing.cubic)),
    ]);
  }
  return Animated.parallel([
    fade(18, 5),
    Animated.sequence([
      timing(pop, 1.16, 120, Easing.out(Easing.cubic)),
      timing(pop, 0.96, 70, Easing.inOut(Easing.quad)),
      Animated.spring(pop, { toValue: 1, speed: 22, bounciness: 4, useNativeDriver: true }),
    ]),
    Animated.sequence([
      timing(tilt, 0.45, 100, Easing.out(Easing.quad)),
      timing(tilt, -0.16, 90, smooth),
      Animated.spring(tilt, { toValue: 0, speed: 22, bounciness: 3, useNativeDriver: true }),
    ]),
  ]);
}

function idleAfter(kind: 'bob' | 'sway' | 'nod' | 'ponder', bob: Animated.Value, spin: Animated.Value) {
  if (kind === 'sway') {
    return Animated.parallel([
      Animated.loop(
        Animated.sequence([
          timing(spin, 5, 1700, smooth),
          timing(spin, -5, 1900, smooth),
          timing(spin, 0, 900, smooth),
        ]),
      ),
      Animated.loop(
        Animated.sequence([timing(bob, 1, 2200, smooth), timing(bob, 0, 2200, smooth)]),
      ),
    ]);
  }
  if (kind === 'nod') {
    return Animated.loop(
      Animated.sequence([
        timing(bob, 1, 260, Easing.out(Easing.quad)),
        timing(bob, 0, 200, Easing.in(Easing.quad)),
        Animated.delay(560),
      ]),
    );
  }
  if (kind === 'ponder') {
    return Animated.parallel([
      Animated.loop(
        Animated.sequence([
          timing(spin, -6, 1400, smooth),
          Animated.delay(280),
          timing(spin, 5, 1600, smooth),
          Animated.delay(260),
          timing(spin, 0, 900, smooth),
        ]),
      ),
      Animated.loop(
        Animated.sequence([timing(bob, 1, 2000, smooth), timing(bob, 0, 2000, smooth)]),
      ),
    ]);
  }
  return Animated.loop(
    Animated.sequence([timing(bob, 1, 980, smooth), timing(bob, 0, 980, smooth)]),
  );
}

/** Chapter break. Each chapter arrives differently, then the line opens. */
export function ChapterOpen({ chapter, title, mood, cta, onContinue }: ChapterOpenProps) {
  const { height, width } = useWindowDimensions();
  const { stage, name } = useOnboardingPet();
  const reduce = useReduceMotion();
  const tight = height < 700;
  const petSize = tight ? 260 : 312;
  const label = name && name.trim() ? name.trim() : 'Your armadillo';
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dust = useRef<DustHandle>(null);
  const feel = entranceFeel(chapter);
  const [pose, setPose] = useState<PetMood | null>(reduce === true ? mood : 'idle');

  const rigRef = useRef<ReturnType<typeof createEntranceRig> | null>(null);
  if (rigRef.current === null) rigRef.current = createEntranceRig();
  const rig = rigRef.current;
  const bubble = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const [bubbleBox, setBubbleBox] = useState(110);
  const tuck = Math.max(0, Math.round(petSize * (1 - petScale(stage, pose ?? mood)) - 4));

  const travel = Math.round(width / 2 + petSize * 0.55);
  const peek = Math.round(width / 2 - petSize * 0.16);
  const drop = Math.round(petSize * 1.05 + 36);
  const metrics = useMemo(
    () => ({ travel, peek, drop, petSize }),
    [travel, peek, drop, petSize],
  );

  const spinDeg = useMemo(
    () => rig.spin.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }),
    [rig.spin],
  );
  const footPin = useMemo(
    () =>
      rig.squash.interpolate({
        inputRange: [-1, 1],
        outputRange: [-(petSize * SQUASH) / 2, (petSize * SQUASH) / 2],
      }),
    [rig.squash, petSize],
  );
  const squashX = useMemo(
    () => rig.squash.interpolate({ inputRange: [-1, 1], outputRange: [1 - SQUASH * 0.8, 1 + SQUASH * 0.8] }),
    [rig.squash],
  );
  const squashY = useMemo(
    () => rig.squash.interpolate({ inputRange: [-1, 1], outputRange: [1 + SQUASH, 1 - SQUASH] }),
    [rig.squash],
  );
  const growPin = useMemo(
    () => rig.grow.interpolate({ inputRange: [0.5, 1], outputRange: [petSize * 0.25, 0], extrapolate: 'clamp' }),
    [rig.grow, petSize],
  );
  const bobAmp = chapter === 1 ? -12 : chapter === 3 ? -7 : chapter === 4 ? -5 : -3;
  const bobY = useMemo(
    () => bob.interpolate({ inputRange: [0, 1], outputRange: [0, bobAmp] }),
    [bob, bobAmp],
  );
  const bubbleY = useMemo(() => {
    if (feel.bubble === 'crisp') {
      return pop.interpolate({ inputRange: [0, 0.45, 0.72, 1], outputRange: [-22, 5, -2, 0], extrapolate: 'clamp' });
    }
    if (feel.bubble === 'careful') {
      return pop.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
    }
    if (feel.bubble === 'idea') {
      return pop.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
    }
    return pop.interpolate({
      inputRange: [0, 0.62, 0.84, 1, 1.28],
      outputRange: [18, -16, 6, 0, -8],
      extrapolate: 'clamp',
    });
  }, [feel.bubble, pop]);
  const popScaleX = useMemo(() => {
    if (feel.bubble === 'crisp') {
      return pop.interpolate({ inputRange: [0, 0.42, 0.7, 1], outputRange: [0.55, 1.14, 0.96, 1], extrapolate: 'clamp' });
    }
    if (feel.bubble === 'careful') {
      return pop.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });
    }
    if (feel.bubble === 'idea') {
      return pop.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0.2, 1.05, 1], extrapolate: 'clamp' });
    }
    return pop.interpolate({
      inputRange: [0, 0.62, 0.84, 1, 1.28],
      outputRange: [0.28, 1.24, 0.94, 1, 1.1],
      extrapolate: 'clamp',
    });
  }, [feel.bubble, pop]);
  const popScaleY = useMemo(() => {
    if (feel.bubble === 'crisp') {
      return pop.interpolate({ inputRange: [0, 0.42, 0.7, 1], outputRange: [0.55, 1.14, 0.96, 1], extrapolate: 'clamp' });
    }
    if (feel.bubble === 'careful') {
      return pop.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
    }
    if (feel.bubble === 'idea') {
      return pop.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0.16, 1.06, 1], extrapolate: 'clamp' });
    }
    return pop.interpolate({
      inputRange: [0, 0.62, 0.84, 1, 1.28],
      outputRange: [0.12, 0.78, 1.16, 1, 0.92],
      extrapolate: 'clamp',
    });
  }, [feel.bubble, pop]);
  const popTilt = useMemo(() => {
    if (feel.bubble === 'eager') {
      return pop.interpolate({
        inputRange: [0, 0.45, 0.75, 1, 1.28],
        outputRange: ['-10deg', '7deg', '-4deg', '0deg', '3deg'],
        extrapolate: 'clamp',
      });
    }
    if (feel.bubble === 'idea') {
      return pop.interpolate({ inputRange: [0, 0.55, 1], outputRange: ['-5deg', '2deg', '0deg'], extrapolate: 'clamp' });
    }
    return pop.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '0deg'] });
  }, [feel.bubble, pop]);
  const popOpacity = useMemo(() => {
    const fadeIn = feel.bubble === 'eager' || feel.bubble === 'crisp' ? 0.12 : 0.4;
    return pop.interpolate({ inputRange: [0, fadeIn, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  }, [feel.bubble, pop]);
  const tiltDeg = useMemo(
    () => tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }),
    [tilt],
  );
  const fromTail = useMemo(
    () => Animated.multiply(Animated.subtract(1, popScaleY), bubbleBox / 2),
    [popScaleY, bubbleBox],
  );
  const bubbleBob = useMemo(
    () => bob.interpolate({ inputRange: [0, 1], outputRange: [0, bobAmp * 0.4] }),
    [bob, bobAmp],
  );
  const bubbleTravel = useMemo(() => {
    // The crisp line drops into place. Pinning it to the tail would cancel that drop.
    if (feel.bubble === 'crisp') return Animated.add(bubbleY, bubbleBob);
    return Animated.add(Animated.add(bubbleY, fromTail), bubbleBob);
  }, [feel.bubble, bubbleY, fromTail, bubbleBob]);
  const buttonDrop = feel.bubble === 'crisp' ? -8 : feel.bubble === 'careful' ? 8 : feel.bubble === 'idea' ? 14 : 16;
  const buttonFrom = feel.bubble === 'careful' ? 0.985 : feel.bubble === 'idea' ? 0.96 : feel.bubble === 'crisp' ? 0.94 : 0.92;
  const enterY = useMemo(
    () => bubble.interpolate({ inputRange: [0, 1], outputRange: [buttonDrop, 0] }),
    [bubble, buttonDrop],
  );
  const buttonScale = useMemo(
    () => bubble.interpolate({ inputRange: [0, 1], outputRange: [buttonFrom, 1] }),
    [bubble, buttonFrom],
  );

  useLayoutEffect(() => {
    if (reduce === true) restEntrance(rig);
    else primeEntrance(rig, chapter, metrics);
  }, [reduce, chapter, rig, metrics]);

  useEffect(() => {
    if (reduce === null) return;
    let entrance: Animated.CompositeAnimation | null = null;
    let bubbleAnim: Animated.CompositeAnimation | null = null;
    let idleAnim: Animated.CompositeAnimation | null = null;
    let live = true;

    if (reduce) {
      setPose(mood);
      restEntrance(rig);
      bubble.setValue(1);
      pop.setValue(1);
      tilt.setValue(0);
      bob.setValue(0);
      return () => {
        live = false;
      };
    }

    setPose('idle');
    primeEntrance(rig, chapter, metrics);
    bubble.setValue(0);
    pop.setValue(0);
    tilt.setValue(0);
    bob.setValue(0);

    entrance = buildChapterEntrance(chapter, rig, metrics, {
      onPose: () => {
        if (live) setPose(mood);
      },
      onDust: (points) => dust.current?.play(points),
    });
    entrance.start(({ finished }) => {
      if (!finished || !live) return;
      bubbleAnim = openBubble(feel.bubble, bubble, pop, tilt);
      bubbleAnim.start(({ finished: opened }) => {
        if (!opened || !live) return;
        idleAnim = idleAfter(feel.idle, bob, rig.spin);
        idleAnim.start();
      });
    });

    return () => {
      live = false;
      entrance?.stop();
      bubbleAnim?.stop();
      idleAnim?.stop();
    };
  }, [reduce, chapter, mood, rig, metrics, feel.bubble, feel.idle, bubble, pop, tilt, bob]);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function handleContinue() {
    if (lock.current) return;
    lock.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lock.current = false;
      timer.current = null;
    }, LOCK_MS);
    onContinue();
  }

  return (
    <ObScreen
      chapter={chapter}
      progress={0}
      scroll={false}
      contentStyle={styles.content}
      footer={
        <ObFooter>
          <Animated.View
            style={{
              opacity: bubble,
              transform: [{ translateY: enterY }, { scale: buttonScale }],
            }}
          >
            <PrimaryButton label={cta} onPress={handleContinue} />
          </Animated.View>
        </ObFooter>
      }
    >
      <View style={styles.stage}>
        <View style={styles.group}>
          <Animated.View
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.height);
              setBubbleBox((current) => (current === next ? current : next));
            }}
            style={[
              styles.bubbleWrap,
              { marginBottom: -tuck },
              {
                opacity: popOpacity,
                transform: [
                  { translateY: bubbleTravel },
                  { rotate: popTilt },
                  { rotate: tiltDeg },
                  { scaleX: popScaleX },
                  { scaleY: popScaleY },
                ],
              },
            ]}
          >
            <View style={styles.bubble}>
              <Text accessibilityRole="header" style={[styles.bubbleText, tight ? styles.bubbleTextTight : null]}>
                {title}
              </Text>
            </View>
            <View style={styles.tail} />
          </Animated.View>
          <Animated.View
            style={{
              width: petSize,
              height: petSize,
              opacity: rig.opacity,
              transform: [
                { translateX: rig.shiftX },
                { translateY: rig.shiftY },
                { translateY: bobY },
                { rotate: spinDeg },
              ],
            }}
          >
            <Animated.View
              style={{
                width: petSize,
                height: petSize,
                transform: [{ translateY: growPin }, { scale: rig.grow }],
              }}
            >
              <Animated.View
                style={{
                  width: petSize,
                  height: petSize,
                  transform: [{ translateY: footPin }, { scaleX: squashX }, { scaleY: squashY }],
                }}
              >
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Dust ref={dust} color={DUST_EARTH} />
                </View>
                {pose ? <Pet stage={stage} mood={pose} size={petSize} accessibilityLabel={label} /> : null}
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    alignItems: 'center',
    gap: 0,
    marginTop: -8,
  },
  bubbleWrap: {
    alignItems: 'center',
    maxWidth: 340,
  },
  bubble: {
    backgroundColor: BUBBLE,
    borderRadius: 26,
    paddingHorizontal: 26,
    paddingVertical: 18,
    shadowColor: '#6A5344',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  bubbleText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: ob.color.ink,
    textAlign: 'center',
  },
  bubbleTextTight: {
    fontSize: 24,
    lineHeight: 30,
  },
  tail: {
    width: 18,
    height: 18,
    marginTop: -10,
    backgroundColor: BUBBLE,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
});
