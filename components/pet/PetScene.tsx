import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import type { PetMood } from '../../constants/petImages';
import { PET_HOME_TRICK_LINES, fillPetLine } from '../../constants/petOnboardingLines';
import { hapticSelection } from '../../lib/haptics';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { Dust, DUST_PALE, easedTimeAt, type DustHandle } from './Dust';
import { Pet } from './Pet';

type PetSceneProps = {
  topInset: number;
  greeting: string;
  firstName: string | null;
  onPressFirstName?: () => void;
  pet: PetState | null;
  mood: PetMood;
  children?: React.ReactNode;
};

const TRACK_WIDTH = 180;

/** Home hero: forest-green panel with the pet on a soft hill and the day's action on the hill. */
export function PetScene({
  topInset,
  greeting,
  firstName,
  onPressFirstName,
  pet,
  mood,
  children,
}: PetSceneProps) {
  const { width, height } = useWindowDimensions();
  const petSize = Math.min(240, Math.max(170, Math.round(height * 0.27)));
  const petAreaHeight = topInset + 30 + petSize;
  // The hill is the top of a large circle. A wide box with a big corner radius
  // would not work: the radius is clamped to half the shorter side, leaving a flat band.
  const hillSize = width * 1.8;
  const petName = pet?.name ?? 'Your armadillo';

  // --- The pet is alive: it rolls in, fidgets, and does a roll when tapped. ---
  const reduceMotion = useReduceMotion();
  const hasPet = pet !== null;
  const [ready, setReady] = useState(false);
  const [curled, setCurled] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  const roll = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const mounted = useRef(true);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const lineIndex = useRef(Math.floor(Math.random() * PET_HOME_TRICK_LINES.length));
  const dust = useRef<DustHandle>(null);

  // Curled up, the pet is drawn at 0.72 of its box, sitting on the bottom edge.
  const rollTravel = width * 0.36;
  const petMotion = useMemo(() => {
    const ballRadius = petSize * 0.32;
    const pivot = petSize * 0.153; // the ball's centre, below the centre of the box
    const degrees = Math.round((rollTravel / ballRadius) * (180 / Math.PI));
    return {
      transform: [
        { translateX: roll.interpolate({ inputRange: [-1, 1], outputRange: [-rollTravel, rollTravel] }) },
        { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -petSize * 0.07] }) },
        { translateY: pivot },
        { rotate: roll.interpolate({ inputRange: [-1, 1], outputRange: [`-${degrees}deg`, `${degrees}deg`] }) },
        { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) },
        { translateY: -pivot },
      ],
    };
  }, [roll, hop, tilt, petSize, rollTravel]);
  const bubbleMotion = useMemo(
    () => ({
      opacity: bubble,
      transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
    }),
    [bubble],
  );

  function later(fn: () => void, ms: number) {
    timers.current.push(
      setTimeout(() => {
        if (mounted.current) fn();
      }, ms),
    );
  }

  function say() {
    lineIndex.current = (lineIndex.current + 1) % PET_HOME_TRICK_LINES.length;
    const next = PET_HOME_TRICK_LINES[lineIndex.current] ?? PET_HOME_TRICK_LINES[0];
    setSays(fillPetLine(next, { name: pet?.name ?? null }));
    bubble.setValue(0);
    Animated.spring(bubble, { toValue: 1, speed: 16, bounciness: 14, useNativeDriver: true }).start();
    later(() => {
      Animated.timing(bubble, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
        if (mounted.current) setSays(null);
      });
    }, 2800);
  }

  /** Curl up, roll out to the right, across to the left, and back to the middle. */
  function doRoll(speak: boolean) {
    if (busy.current) return;
    if (reduceMotion !== false) {
      if (speak) say();
      return;
    }
    busy.current = true;
    setCurled(true);
    // A puff of dust each time the ball passes one of these spots (in units of the travel).
    const ease = Easing.inOut(Easing.cubic);
    const at = (start: number, ms: number, from: number, to: number, spot: number) => ({
      x: spot * rollTravel,
      delay: start + ms * easedTimeAt(ease, (spot - from) / (to - from)),
      size: 13,
    });
    dust.current?.play([
      at(240, 520, 0, 1, 0.3),
      at(240, 520, 0, 1, 0.7),
      at(760, 900, 1, -1, 0.45),
      at(760, 900, 1, -1, -0.1),
      at(760, 900, 1, -1, -0.6),
      at(1660, 560, -1, 0, -0.65),
      at(1660, 560, -1, 0, -0.25),
    ]);
    const leg = (toValue: number, duration: number) =>
      Animated.timing(roll, {
        toValue,
        duration,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      });
    later(() => {
      const anim = Animated.sequence([leg(1, 520), leg(-1, 900), leg(0, 560)]);
      running.current = anim;
      anim.start(({ finished }) => {
        running.current = null;
        if (!mounted.current) return;
        roll.setValue(0);
        setCurled(false);
        busy.current = false;
        if (finished && speak) say();
      });
    }, 240);
  }

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach(clearTimeout);
      running.current?.stop();
    };
  }, []);

  // First appearance: it rolls in from off the left edge and uncurls.
  useEffect(() => {
    if (!hasPet || ready || reduceMotion === null) return;
    if (reduceMotion) {
      setReady(true);
      return;
    }
    busy.current = true;
    roll.setValue(-1.75);
    setCurled(true);
    setReady(true);
    dust.current?.play(
      [-1.05, -0.7, -0.4, -0.15].map((spot) => ({
        x: spot * rollTravel,
        delay: 1000 * easedTimeAt(Easing.out(Easing.cubic), (spot + 1.75) / 1.75) + 40,
        size: 13,
      })),
    );
    const anim = Animated.timing(roll, {
      toValue: 0,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    running.current = anim;
    anim.start(() => {
      running.current = null;
      if (!mounted.current) return;
      setCurled(false);
      busy.current = false;
    });
  }, [hasPet, ready, reduceMotion, roll]);

  // Left alone, it shifts about, and now and then goes for a roll on its own.
  useEffect(() => {
    if (!ready || reduceMotion !== false) return;
    let timer: ReturnType<typeof setTimeout>;
    let fidget: Animated.CompositeAnimation | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!busy.current) {
          const pick = Math.random();
          if (pick < 0.1) {
            doRoll(false);
          } else if (pick < 0.58) {
            fidget = Animated.sequence([
              Animated.timing(hop, { toValue: 1, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(hop, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]);
            fidget.start();
          } else {
            fidget = Animated.sequence([
              Animated.timing(tilt, { toValue: 1, duration: 220, useNativeDriver: true }),
              Animated.timing(tilt, { toValue: -1, duration: 320, useNativeDriver: true }),
              Animated.spring(tilt, { toValue: 0, speed: 12, bounciness: 10, useNativeDriver: true }),
            ]);
            fidget.start();
          }
        }
        schedule();
      }, 5500 + Math.random() * 5500);
    };
    schedule();
    return () => {
      clearTimeout(timer);
      fidget?.stop();
    };
    // doRoll only reads refs and stable animated values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reduceMotion]);

  return (
    <View style={styles.panel}>
      <View
        pointerEvents="none"
        style={[
          styles.hill,
          {
            width: hillSize,
            height: hillSize,
            borderRadius: hillSize / 2,
            left: (width - hillSize) / 2,
            top: petAreaHeight - petSize * 0.24,
          },
        ]}
      />

      <View style={{ height: petAreaHeight }} pointerEvents="box-none">
        {/* Dust kicked up on the hill; x is measured from the centre of the scene. */}
        <View pointerEvents="none" style={[styles.dustOrigin, { left: width / 2 }]}>
          <Dust ref={dust} color={DUST_PALE} />
        </View>
        {pet && ready ? (
          // Centred on the hill's crest. Only the ears reach the header's height, and
          // they sit near the centre, clear of the left-hand name column.
          <View pointerEvents="box-none" style={styles.petSlot}>
            <Animated.View style={petMotion}>
              <Pet
                stage={curled ? 1 : pet.stage}
                mood={curled ? 'ready' : mood}
                size={petSize}
                shadow={!curled}
                accessibilityLabel={petName}
                onPress={() => {
                  hapticSelection();
                  doRoll(true);
                }}
              />
            </Animated.View>
          </View>
        ) : null}
      </View>

      {pet ? (
        <View pointerEvents="none" style={styles.pillSlot}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{petGrowthCopy(pet)}</Text>
            {pet.stage < 5 ? (
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: TRACK_WIDTH * stageProgress(pet) }]} />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {children ? (
        <View style={styles.actions}>{children}</View>
      ) : (
        <View style={styles.noActions} />
      )}

      {/* After the pet so the text stays readable and tappable where they meet. */}
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>
            {greeting}
            {firstName ? ', ' : ''}
          </Text>
          {firstName ? (
            <TouchableOpacity
              onPress={onPressFirstName}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Edit name"
              style={styles.greetingHit}
            >
              <Text style={styles.greeting}>{firstName}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text
          // Long names shrink a little, then wrap once, rather than running under the pet.
          style={styles.petName}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {petName}
        </Text>
      </View>

      {says ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.says, { top: topInset + 16 }, bubbleMotion]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={says}
        >
          <Text style={styles.saysText}>{says}</Text>
          <View style={styles.saysTail} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SceneLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sceneLabel}>{children}</Text>;
}

export function SceneTitle({
  children,
  hasBody,
}: {
  children: React.ReactNode;
  hasBody?: boolean;
}) {
  return (
    <Text style={[styles.sceneTitle, hasBody ? styles.sceneTitleWithBody : null]} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function SceneBody({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sceneBody}>{children}</Text>;
}

export function SceneButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.sceneButton}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Text style={styles.sceneButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SceneLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Text style={styles.sceneLink}>{label}</Text>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  panel: {
    width: '100%',
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  hill: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  // Kept to the left so the name sits beside the pet, not across it.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 20,
    maxWidth: '48%',
    overflow: 'hidden',
  },
  greetingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  greeting: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  greetingHit: {
    maxWidth: '100%',
  },
  petName: {
    ...type.title,
    color: '#FFFFFF',
    marginTop: 2,
  },
  petSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pillSlot: {
    marginTop: 10,
    alignItems: 'center',
  },
  dustOrigin: {
    position: 'absolute',
    bottom: 2,
    width: 1,
    height: 24,
  },
  // What the pet says after its roll: top right, pointing down at it.
  says: {
    position: 'absolute',
    right: 14,
    maxWidth: '44%',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  saysText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saysTail: {
    position: 'absolute',
    left: 18,
    bottom: -7,
    width: 12,
    height: 12,
    backgroundColor: colors.surface,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  pill: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  track: {
    width: TRACK_WIDTH,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: 6,
    overflow: 'hidden',
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  noActions: {
    paddingBottom: 16,
  },
  sceneLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#FFFFFF',
    opacity: 0.7,
    marginBottom: 6,
  },
  sceneTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 30,
    color: '#FFFFFF',
    marginBottom: 14,
  },
  sceneTitleWithBody: {
    marginBottom: 6,
  },
  sceneBody: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 14,
  },
  sceneButton: {
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  sceneLink: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    paddingVertical: 10,
  },
});
