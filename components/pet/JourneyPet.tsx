import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { PET_STAGE_SCALE, type PetStage } from '../../constants/petImages';
import { hapticSelection } from '../../lib/haptics';
import { Dust, DUST_PALE, type DustHandle } from './Dust';
import { Pet } from './Pet';
import {
  createPetBody,
  moveHop,
  moveLookAround,
  moveRock,
  petBodyStyles,
  restBody,
  type PetBody,
} from './petMotion';

export type JourneyPetHandle = {
  stop: () => void;
  anticipate: () => Promise<boolean>;
  rock: () => Promise<boolean>;
  hop: (power?: number) => Promise<boolean>;
};

type JourneyPetProps = {
  stage: PetStage;
  curled: boolean;
  /** Changes only to skip Pet's own unfurl and show the settled pose. */
  poseKey: number;
  /** Roll angle, degrees as a string. Applied only while curled. */
  roll: Animated.AnimatedInterpolation<string> | null;
  live: boolean;
  size: number;
};

const LAND_MS = 410;
const ease = Easing.inOut(Easing.sin);

function leanBack(body: PetBody): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.timing(body.tilt, { toValue: -0.4, duration: 150, easing: ease, useNativeDriver: true }),
    Animated.timing(body.tilt, { toValue: 0, duration: 100, easing: ease, useNativeDriver: true }),
  ]);
}

/**
 * The armadillo on the route. One body move at a time. The ground shadow is
 * ours (Pet's is off) and shrinks when the body leaves the ground.
 */
export const JourneyPet = forwardRef<JourneyPetHandle, JourneyPetProps>(function JourneyPet(
  { stage, curled, poseKey, roll, live, size },
  ref,
) {
  const bodyRef = useRef<PetBody | null>(null);
  if (bodyRef.current === null) bodyRef.current = createPetBody();
  const body = bodyRef.current;

  const moveRef = useRef<Animated.CompositeAnimation | null>(null);
  const gen = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleFlip = useRef(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const dustRef = useRef<DustHandle>(null);

  const bodyStyles = useMemo(
    () => petBodyStyles(body, { height: size, hop: 10 }),
    [body, size],
  );

  // The ball sits in the bottom of the box. Spin it around that centre.
  const rollStyle = useMemo(() => {
    if (!roll) return null;
    const drawn = size * PET_STAGE_SCALE[1];
    const dy = (size - drawn) / 2;
    return {
      transform: [{ translateY: dy }, { rotate: roll }, { translateY: -dy }],
    };
  }, [roll, size]);

  const shown: PetStage = curled ? 1 : stage;
  const drawn = size * PET_STAGE_SCALE[shown];
  const shadowW = drawn * 0.55;
  const shadowH = Math.max(4, drawn * 0.08);

  function clearIdle() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
  }

  function clearPuff() {
    if (puffTimer.current) clearTimeout(puffTimer.current);
    puffTimer.current = null;
  }

  function stopMove() {
    const current = moveRef.current;
    moveRef.current = null;
    current?.stop();
    restBody(body);
  }

  function run(factory: () => Animated.CompositeAnimation): Promise<boolean> {
    stopMove();
    const anim = factory();
    moveRef.current = anim;
    return new Promise((resolve) => {
      anim.start(({ finished }) => {
        if (moveRef.current === anim) moveRef.current = null;
        resolve(finished);
      });
    });
  }

  function armPuff() {
    clearPuff();
    puffTimer.current = setTimeout(() => {
      puffTimer.current = null;
      dustRef.current?.play([{ x: size / 2, delay: 0, size: 12 }]);
    }, LAND_MS);
  }

  const scheduleRef = useRef<() => void>(() => {});
  scheduleRef.current = () => {
    clearIdle();
    const token = gen.current;
    const wait = 8000 + Math.floor(Math.random() * 6001);
    idleTimer.current = setTimeout(() => {
      if (token !== gen.current || !liveRef.current) return;
      idleFlip.current = !idleFlip.current;
      const factory = idleFlip.current ? () => moveLookAround(body) : () => moveHop(body, 0.6);
      void run(factory).then((ok) => {
        if (ok && token === gen.current && liveRef.current) scheduleRef.current();
      });
    }, wait);
  };

  useEffect(() => {
    if (!live) return;
    scheduleRef.current();
    return () => {
      // Drop the idle loop. A scripted hop may already own the body.
      gen.current += 1;
      clearIdle();
    };
  }, [live]);

  useImperativeHandle(
    ref,
    () => ({
      stop() {
        gen.current += 1;
        clearIdle();
        clearPuff();
        stopMove();
      },
      anticipate() {
        return run(() => leanBack(body));
      },
      rock() {
        return run(() => moveRock(body, 1));
      },
      hop(power = 1) {
        if (power >= 1) armPuff();
        return run(() => moveHop(body, power));
      },
    }),
  );

  function onPress() {
    if (!liveRef.current) return;
    hapticSelection();
    gen.current += 1;
    clearIdle();
    const token = gen.current;
    armPuff();
    void run(() => moveHop(body, 1)).then((ok) => {
      if (ok && token === gen.current && liveRef.current) scheduleRef.current();
    });
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!live}
      accessible={live}
      accessibilityRole={live ? 'imagebutton' : undefined}
      accessibilityLabel={live ? 'Your armadillo' : undefined}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ width: size, height: size }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            bottom: -shadowH / 2,
            left: (size - shadowW) / 2,
            width: shadowW,
            height: shadowH,
            borderRadius: shadowW / 2,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          },
          bodyStyles.shadow,
        ]}
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, bodyStyles.mover]}>
        <Animated.View style={[StyleSheet.absoluteFill, bodyStyles.squash]}>
          <Animated.View style={[StyleSheet.absoluteFill, curled && rollStyle ? rollStyle : null]}>
            <Pet
              key={poseKey}
              stage={shown}
              mood={shown === 1 ? 'ready' : 'idle'}
              size={size}
              shadow={false}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <Dust ref={dustRef} color={DUST_PALE} />
    </Pressable>
  );
});
