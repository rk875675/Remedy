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
import { petScale, type PetMood, type PetStage } from '../../constants/petImages';
import { PET_HOME_TRICK_LINES, fillPetLine } from '../../constants/petOnboardingLines';
import { hapticSelection } from '../../lib/haptics';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { Dust, DUST_PALE, easedTimeAt, type DustHandle, type DustPoint } from './Dust';
import { Pet, PET_CURL_MS, PET_UNFURL_MS } from './Pet';
import {
  call,
  createPetBody,
  moveBigStretch,
  moveHop,
  moveJumpSpin,
  moveLand,
  moveLookAround,
  moveRock,
  moveWeightShift,
  moveWiggle,
  petBodyStyles,
  restBody,
} from './petMotion';

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
const ROLL_START = -1.75;
const ARRIVE_PAST = 12;
const ROLL_PAST = 8;
const POSE_GAP = 260;
// Pet plays frames when leaving or entering the ball (stage 2 and up); wait them out.
const curlGap = (stage: PetStage | undefined): number => (stage !== undefined && stage > 1 ? PET_CURL_MS : POSE_GAP);
const unfurlGap = (stage: PetStage | undefined): number =>
  stage !== undefined && stage > 1 ? PET_UNFURL_MS : POSE_GAP;
/** moveHop is on the ground after the crouch, the rise and the fall. */
const HOP_LAND_MS = 410;

type IdleName = 'look' | 'shift' | 'stretch' | 'hop';

function legPuffs(
  ease: (t: number) => number,
  duration: number,
  from: number,
  to: number,
  spots: number[],
  travel: number,
  size = 13,
): DustPoint[] {
  const span = to - from;
  if (span === 0) return [];
  return spots.map((spot) => ({
    x: spot * travel,
    delay: Math.round(duration * easedTimeAt(ease, (spot - from) / span)),
    size,
  }));
}

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

  // --- The pet is alive: it rolls in, fidgets, and does a trick when tapped. ---
  const reduceMotion = useReduceMotion();
  const hasPet = pet !== null;
  const [ready, setReady] = useState(false);
  const [curled, setCurled] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  const roll = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const body = useRef(createPetBody()).current;
  const busy = useRef(false);
  const mounted = useRef(true);
  const entered = useRef(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const lineIndex = useRef(Math.floor(Math.random() * PET_HOME_TRICK_LINES.length));
  const trickIndex = useRef(Math.floor(Math.random() * 3));
  const lastIdle = useRef<IdleName | null>(null);
  const shiftDir = useRef<1 | -1>(1);
  const dust = useRef<DustHandle>(null);

  // Curled up, the pet is drawn at 0.72 of its box, sitting on the bottom edge.
  const rollTravel = width * 0.36;
  const poseStage: PetStage = !pet || curled ? 1 : pet.stage;
  const poseMood: PetMood = !pet || curled ? 'ready' : mood;
  const drawn = petSize * petScale(poseStage, poseMood);
  // Built on the full box, not the pose's drawn size, so curling and uncurling
  // mid-trick never rebuilds these while a move is running.
  const bodyLook = useMemo(
    () => petBodyStyles(body, { height: petSize, hop: petSize * 0.14 }),
    [body, petSize],
  );
  const rollMotion = useMemo(() => {
    const ballRadius = petSize * 0.32;
    const span = 2;
    const distance = span * rollTravel;
    const degrees = (distance / ballRadius) * (180 / Math.PI);
    const translateX = roll.interpolate({
      inputRange: [-span, span],
      outputRange: [-distance, distance],
    });
    const rotate = roll.interpolate({
      inputRange: [-span, span],
      outputRange: [`-${degrees}deg`, `${degrees}deg`],
    });
    return { translateX, rotate };
  }, [roll, petSize, rollTravel]);
  const shadowMotion = useMemo(
    () => ({
      opacity: bodyLook.shadow.opacity,
      transform: [{ translateX: rollMotion.translateX }, ...bodyLook.shadow.transform],
    }),
    [bodyLook, rollMotion.translateX],
  );
  const bubbleMotion = useMemo(
    () => ({
      opacity: bubble,
      transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
    }),
    [bubble],
  );
  const shadowW = drawn * 0.55;
  const shadowH = Math.max(6, drawn * 0.07);

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
    if (sayTimer.current) clearTimeout(sayTimer.current);
    bubble.stopAnimation();
    bubble.setValue(0);
    Animated.spring(bubble, { toValue: 1, speed: 16, bounciness: 14, useNativeDriver: true }).start();
    sayTimer.current = setTimeout(() => {
      if (!mounted.current) return;
      Animated.timing(bubble, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished && mounted.current) setSays(null);
      });
    }, 2800);
    timers.current.push(sayTimer.current);
  }

  function playMove(anim: Animated.CompositeAnimation, onDone?: (finished: boolean) => void) {
    const prev = running.current;
    running.current = anim;
    prev?.stop();
    restBody(body);
    anim.start(({ finished }) => {
      if (running.current !== anim) return;
      running.current = null;
      if (!mounted.current) return;
      onDone?.(finished);
    });
  }

  function rollTo(toValue: number, duration: number, easing: (t: number) => number) {
    return Animated.timing(roll, { toValue, duration, easing, useNativeDriver: true });
  }

  function squashTo(toValue: number, duration: number) {
    return Animated.timing(body.squash, {
      toValue,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
  }

  /** Crouch, curl, roll to both walls, rock, uncurl, wiggle. `speak` adds the line. */
  function doRoll(speak: boolean) {
    if (busy.current) return;
    if (reduceMotion !== false) {
      if (speak) say();
      return;
    }
    if (rollTravel <= 0) return;
    busy.current = true;
    const rightEase = Easing.inOut(Easing.cubic);
    const backEase = Easing.out(Easing.cubic);
    const rightMs = 500;
    const leftMs = 860;
    const backMs = 620;
    const past = ROLL_PAST / rollTravel;
    playMove(
      Animated.sequence([
        squashTo(0.6, 90),
        Animated.delay(120),
        squashTo(0, 60),
        call(() => {
          if (mounted.current) setCurled(true);
        }),
        Animated.delay(curlGap(pet?.stage)),
        Animated.parallel([
          rollTo(1, rightMs, rightEase),
          call(() => {
            dust.current?.play([
              ...legPuffs(rightEase, rightMs, 0, 1, [0.32, 0.68], rollTravel),
              { x: rollTravel, delay: rightMs, size: 15 },
            ]);
          }),
        ]),
        moveLand(body, 0.75),
        Animated.parallel([
          rollTo(-1, leftMs, rightEase),
          call(() => {
            dust.current?.play([
              ...legPuffs(rightEase, leftMs, 1, -1, [0.4, -0.15, -0.6], rollTravel),
              { x: -rollTravel, delay: leftMs, size: 15 },
            ]);
          }),
        ]),
        moveLand(body, 0.75),
        Animated.parallel([
          rollTo(past, backMs, backEase),
          call(() => {
            dust.current?.play(legPuffs(backEase, backMs, -1, past, [-0.62, -0.2], rollTravel));
          }),
        ]),
        rollTo(0, 170, Easing.inOut(Easing.quad)),
        moveRock(body, 1),
        call(() => {
          if (mounted.current) setCurled(false);
        }),
        Animated.delay(unfurlGap(pet?.stage)),
        moveWiggle(body),
      ]),
      (finished) => {
        busy.current = false;
        if (finished && speak) say();
      },
    );
  }

  function doJump() {
    if (busy.current) return;
    if (reduceMotion !== false) {
      if (reduceMotion === true) say();
      return;
    }
    busy.current = true;
    playMove(
      moveJumpSpin(body, () => {
        dust.current?.play([
          { x: -14, delay: 0, size: 15 },
          { x: 12, delay: 40, size: 12 },
        ]);
      }),
      (finished) => {
        busy.current = false;
        if (finished) say();
      },
    );
  }

  function doStretch() {
    if (busy.current) return;
    if (reduceMotion !== false) {
      if (reduceMotion === true) say();
      return;
    }
    busy.current = true;
    playMove(Animated.sequence([moveBigStretch(body), moveWiggle(body)]), (finished) => {
      busy.current = false;
      if (finished) say();
    });
  }

  function nextIdle(): Animated.CompositeAnimation {
    const options: IdleName[] = ['look', 'shift', 'stretch', 'hop'];
    let pick = options[Math.floor(Math.random() * options.length)] ?? 'look';
    if (pick === lastIdle.current) {
      pick = options[(options.indexOf(pick) + 1) % options.length] ?? 'hop';
    }
    lastIdle.current = pick;
    if (pick === 'look') return moveLookAround(body);
    if (pick === 'shift') {
      const dir = shiftDir.current;
      shiftDir.current = dir === 1 ? -1 : 1;
      return moveWeightShift(body, dir);
    }
    if (pick === 'stretch') return moveBigStretch(body);
    return moveHop(body, 0.6);
  }

  const actions = useRef({
    roll: (_speak: boolean) => {},
    idle: (): Animated.CompositeAnimation => moveLookAround(body),
    play: (_anim: Animated.CompositeAnimation) => {},
  });
  actions.current = { roll: doRoll, idle: nextIdle, play: playMove };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const current = running.current;
      running.current = null;
      current?.stop();
      bubble.stopAnimation();
    };
  }, [bubble]);

  // First appearance: mount the curled ball, then roll it in on the next commit
  // so the interpolations are already on a native view.
  useEffect(() => {
    if (!hasPet || reduceMotion === null) return;
    if (reduceMotion) {
      if (!entered.current && running.current === null) {
        // Reduce Motion arrived after the curled start pose was set: show the pet at rest.
        roll.setValue(0);
        setCurled(false);
        busy.current = false;
      }
      if (!ready) setReady(true);
      return;
    }
    if (!ready) {
      if (rollTravel <= 0) return;
      busy.current = true;
      roll.setValue(ROLL_START);
      setCurled(true);
      setReady(true);
      return;
    }
    if (entered.current) return;
    if (rollTravel <= 0) {
      busy.current = false;
      return;
    }
    entered.current = true;
    const past = ARRIVE_PAST / rollTravel;
    const ease = Easing.out(Easing.cubic);
    const rollMs = 880;
    dust.current?.play(
      legPuffs(ease, rollMs, ROLL_START, past, [-1.15, -0.72, -0.32, 0.02], rollTravel),
    );
    playMove(
      Animated.sequence([
        rollTo(past, rollMs, ease),
        rollTo(0, 190, Easing.inOut(Easing.quad)),
        moveRock(body, 1),
        call(() => {
          if (mounted.current) setCurled(false);
        }),
        Animated.delay(unfurlGap(pet?.stage)),
        Animated.parallel([
          moveHop(body, 0.6),
          Animated.sequence([
            Animated.delay(HOP_LAND_MS),
            call(() => {
              dust.current?.play([{ x: 0, delay: 0, size: 14 }]);
            }),
          ]),
        ]),
      ]),
      () => {
        busy.current = false;
      },
    );
    // playMove and rollTo only touch refs and the values from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPet, ready, reduceMotion, roll, rollTravel]);

  // Left alone, it shifts about, and now and then goes for a roll on its own.
  useEffect(() => {
    if (!ready || reduceMotion !== false) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive || !mounted.current) return;
        if (!busy.current && running.current === null) {
          if (Math.random() < 0.1) actions.current.roll(false);
          else actions.current.play(actions.current.idle());
        }
        if (alive) schedule();
      }, 6000 + Math.random() * 5000);
    };
    schedule();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      // A trick owns the body until it finishes. An idle fidget does not.
      if (!busy.current) {
        const current = running.current;
        running.current = null;
        current?.stop();
        restBody(body);
      }
    };
  }, [ready, reduceMotion, body]);

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
            <Animated.View
              pointerEvents="none"
              style={[
                styles.groundShadow,
                shadowMotion,
                {
                  width: shadowW,
                  height: shadowH,
                  borderRadius: shadowW / 2,
                  marginLeft: -shadowW / 2,
                },
              ]}
            />
            <Animated.View style={{ transform: [{ translateX: rollMotion.translateX }] }}>
              <Animated.View style={bodyLook.mover}>
                <Animated.View style={[bodyLook.squash, styles.poseBox, { width: petSize, height: petSize }]}>
                  {/* Spin sits inside the squash so a wall hit flattens on the ground. */}
                  <Animated.View
                    style={[styles.poseBox, { width: petSize, height: drawn, transform: [{ rotate: rollMotion.rotate }] }]}
                  >
                    <Pet
                      stage={curled ? 1 : pet.stage}
                      mood={curled ? 'ready' : mood}
                      size={petSize}
                      shadow={false}
                      accessibilityLabel={petName}
                      onPress={() => {
                        if (busy.current) return;
                        hapticSelection();
                        if (reduceMotion !== false) {
                          say();
                          return;
                        }
                        const trick = trickIndex.current % 3;
                        trickIndex.current = trick + 1;
                        if (trick === 0) doRoll(true);
                        else if (trick === 1) doJump();
                        else doStretch();
                      }}
                    />
                  </Animated.View>
                </Animated.View>
              </Animated.View>
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
  poseBox: {
    justifyContent: 'flex-end',
  },
  groundShadow: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
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
