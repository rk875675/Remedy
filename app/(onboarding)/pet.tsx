import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Circle, Rect } from 'react-native-svg';
import { favouriteHumanLine } from '../../components/onboarding/coldopen/you';
import { ObFooter, ObScreen, PrimaryButton, RevealText, TextLink, ob, obType } from '../../components/onboarding/kit';
import { Pet } from '../../components/pet/Pet';
import { PetBubble, PetSays } from '../../components/pet/PetSays';
import { colors } from '../../constants/colors';
import { PET_NAMING, PET_NAME_SUGGESTIONS, fillPetLine } from '../../constants/petOnboardingLines';
import type { PetMood } from '../../constants/petImages';
import { PET_NAME_LABEL, PET_NAME_MAX_LENGTH } from '../../constants/petLines';
import { useOnboarding } from '../../context/OnboardingContext';
import { hapticSelection } from '../../lib/haptics';
import { setPersonProperties } from '../../lib/analytics';
import { nextPath, trackDecision, useHasPet, useObStep } from '../../lib/onboardingFlow';
import { rememberPetName } from '../../lib/petNameCache';
import { useReduceMotion } from '../../lib/useReduceMotion';

const COPY = {
  namePlaceholder: 'Name',
  youLabel: 'Your first name',
  youPlaceholder: 'First name',
  youAsk: '{name}! And what do I call you?',
  dice: 'Random name',
  continue: 'Continue',
  skip: 'Skip',
} as const;

const FIRST_NAME_MAX = 24;
const CONTROL = /[\u0000-\u001F\u007F]/g;
const DICE = 56;
/** iOS draws the caret from the selection tint, so both have to be black. */
const CARET = '#111111';
/** Pet copy waits until typing pauses, so the field does not jump on each letter. */
const SETTLE_MS = 320;

type Phase = 'name' | 'you';

/** Same cleanup as set_pet_name: no control characters, collapsed spaces, trimmed. */
function collapsedName(value: string): string {
  return value.replace(CONTROL, '').replace(/\s+/g, ' ').trim();
}

function stripControls(value: string): string {
  return value.replace(CONTROL, '');
}

/** A random suggestion that is not the name already in the box. */
function randomName(current: string): string {
  const pool = PET_NAME_SUGGESTIONS.filter((item) => item.toLowerCase() !== current.toLowerCase());
  return pool[Math.floor(Math.random() * pool.length)] ?? PET_NAME_SUGGESTIONS[0];
}

/** Dark die showing five, on a light circle. */
function DiceButton({ onPress }: { onPress: () => void }) {
  const pip = 2.2;
  return (
    <Pressable
      testID="dice"
      accessibilityRole="button"
      accessibilityLabel={COPY.dice}
      onPress={onPress}
      style={({ pressed }) => [styles.dice, pressed ? styles.dicePressed : null]}
    >
      <Svg width={26} height={26} viewBox="0 0 26 26">
        <Rect x={2} y={2} width={22} height={22} rx={6} fill="#111111" />
        <Circle cx={8} cy={8} r={pip} fill="#FFFFFF" />
        <Circle cx={18} cy={8} r={pip} fill="#FFFFFF" />
        <Circle cx={13} cy={13} r={pip} fill="#FFFFFF" />
        <Circle cx={8} cy={18} r={pip} fill="#FFFFFF" />
        <Circle cx={18} cy={18} r={pip} fill="#FFFFFF" />
      </Svg>
    </Pressable>
  );
}

/** Springs in from small once, on mount. */
function usePopIn(delay: number): Animated.Value {
  const reduce = useReduceMotion();
  const value = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      value.setValue(1);
      return;
    }
    const anim = Animated.spring(value, { toValue: 1, delay, speed: 12, bounciness: 9, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [delay, reduce, value]);

  return value;
}

function PopBubble({ line, left, bottom }: { line: string; left: number; bottom: number }) {
  const pop = usePopIn(0);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubbleSlot,
        {
          left,
          bottom,
          opacity: pop,
          transform: [
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          ],
        },
      ]}
    >
      <View style={styles.tail} />
      <PetBubble line={line} />
    </Animated.View>
  );
}

/** The grown armadillo peeking in from the bottom-left corner. Says its line once it has a name. */
function CornerPet({ size, named }: { size: number; named: string }) {
  const peek = usePopIn(250);
  const visible = size * 0.74;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.corner,
          {
            width: size,
            height: size,
            bottom: -size * 0.06,
            left: visible - size - ob.space.screen,
            transform: [{ translateX: peek.interpolate({ inputRange: [0, 1], outputRange: [-size, 0] }) }],
          },
        ]}
      >
        <View style={styles.flip}>
          <Pet stage={5} mood={named ? 'celebrating' : 'idle'} size={size} shadow={false} accessibilityLabel="Your armadillo" />
        </View>
      </Animated.View>
      {named ? (
        <PopBubble
          line={fillPetLine(PET_NAMING.named.line, { name: named })}
          left={visible - ob.space.screen + 6}
          bottom={size * 0.5}
        />
      ) : null}
    </View>
  );
}

export default function PetScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { progress, answers, intake, setLocalAnswer } = useOnboarding();
  const { goNext } = useObStep('pet');
  const hasPet = useHasPet();
  const storedPet = typeof progress?.pet_name === 'string' ? progress.pet_name.trim() : '';
  const [name, setName] = useState(storedPet);
  const [you, setYou] = useState(progress?.first_name ?? '');
  const [phase, setPhase] = useState<Phase>(storedPet.length > 0 ? 'you' : 'name');
  const [settledName, setSettledName] = useState(storedPet);
  const [settledYou, setSettledYou] = useState(() => stripControls(progress?.first_name ?? '').trim());
  const untouched = useRef(storedPet.length === 0 && !(progress?.first_name ?? '').trim());
  const nameSource = useRef<'typed' | 'random'>('typed');

  useEffect(() => {
    if (!untouched.current) return;
    const pet = typeof progress?.pet_name === 'string' ? progress.pet_name.trim() : '';
    const person = progress?.first_name?.trim() ?? '';
    if (!pet && !person) return;
    untouched.current = false;
    if (pet) {
      setName(pet);
      setSettledName(pet);
      setPhase('you');
    }
    if (person) {
      setYou(person);
      setSettledYou(person);
    }
  }, [progress?.pet_name, progress?.first_name]);
  const nameRef = useRef<TextInput>(null);
  const youRef = useRef<TextInput>(null);
  const leaving = useRef(false);
  const onScreen = useRef(true);
  const redirected = useRef(false);
  const flowRef = useRef({ answers, intake, progress });
  flowRef.current = { answers, intake, progress };

  const stored = collapsedName(name);
  const valid = stored.length >= 1 && stored.length <= PET_NAME_MAX_LENGTH;
  const youTrimmed = stripControls(you).trim();
  const compact = height < 700;
  const named = settledName.length >= 1 && settledName.length <= PET_NAME_MAX_LENGTH ? settledName : '';

  useEffect(() => {
    const id = setTimeout(() => {
      setSettledName(valid ? stored : '');
    }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [stored, valid]);

  useEffect(() => {
    const id = setTimeout(() => {
      setSettledYou(youTrimmed);
    }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [youTrimmed]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!onScreen.current) return;
      if (phase === 'you') youRef.current?.focus();
      else nameRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // The name is saved on each character, which replaces `progress`. This effect
  // must not depend on that: while the screen is focused, a new callback runs
  // the cleanup below, and that blur drops the keyboard and yanks the layout.
  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      onScreen.current = true;
      if (hasPet && !redirected.current) {
        const path = nextPath('pet', { ...flowRef.current, hasPet: true });
        if (path) {
          redirected.current = true;
          router.replace(path as never);
        }
      }
      return () => {
        onScreen.current = false;
        nameRef.current?.blur();
        youRef.current?.blur();
      };
    }, [hasPet, router]),
  );

  function handleDice() {
    hapticSelection();
    untouched.current = false;
    nameSource.current = 'random';
    const picked = randomName(stored);
    setName(picked);
    setSettledName(picked);
    setLocalAnswer('pet_name', picked);
  }

  function handleNameContinue() {
    if (!valid || phase !== 'name' || leaving.current) return;
    setName(stored);
    setSettledName(stored);
    setLocalAnswer('pet_name', stored);
    void rememberPetName(stored);
    trackDecision('pet_name_source', nameSource.current);
    setPersonProperties({ pet_name_source: nameSource.current });
    setPhase('you');
  }

  function leave(choice: 'provided' | 'skipped', save: () => void) {
    if (leaving.current || phase !== 'you') return;
    leaving.current = true;
    onScreen.current = false;
    youRef.current?.blur();
    trackDecision('first_name', choice);
    setPersonProperties({ first_name_provided: choice === 'provided' });
    save();
    goNext();
  }

  if (hasPet) {
    return (
      <ObScreen testID="pet" chapter={null}>
        {null}
      </ObScreen>
    );
  }

  const petName = stored.length > 0 ? stored : named;
  const youLine = settledYou
    ? favouriteHumanLine(settledYou)
    : fillPetLine(COPY.youAsk, { name: petName });
  const youMood: PetMood = settledYou.length > 0 ? 'love' : 'ready';
  const petSize = compact ? 128 : 158;

  return (
    <ObScreen
      testID="pet"
      chapter={null}
      keyboard
      scroll={false}
      onBack={phase === 'you' ? () => setPhase('name') : undefined}
      contentStyle={styles.frame}
      footer={
        <ObFooter>
          {phase === 'name' ? (
            <View style={styles.footerRow}>
              <DiceButton onPress={handleDice} />
              <View style={styles.pill}>
                <PrimaryButton
                  testID="continue"
                  label={COPY.continue}
                  variant="ink"
                  chevron
                  disabled={!valid}
                  onPress={handleNameContinue}
                />
              </View>
            </View>
          ) : (
            <>
              <PrimaryButton
                testID="continue"
                label={COPY.continue}
                variant="ink"
                chevron
                disabled={youTrimmed.length === 0}
                onPress={() => {
                  if (!youTrimmed) return;
                  leave('provided', () => setLocalAnswer('first_name', youTrimmed));
                }}
              />
              <TextLink label={COPY.skip} onPress={() => leave('skipped', () => setLocalAnswer('first_name', null))} />
            </>
          )}
        </ObFooter>
      }
    >
      {phase === 'name' ? (
        <View style={styles.fill}>
          <View style={[styles.center, { paddingBottom: petSize * 0.75 }]}>
            <RevealText style={styles.label}>{PET_NAMING.title}</RevealText>
            <TextInput
              ref={nameRef}
              testID="pet-name"
              style={styles.input}
              value={name}
              accessibilityLabel={PET_NAME_LABEL}
              onChangeText={(value) => {
                untouched.current = false;
                nameSource.current = 'typed';
                const next = stripControls(value);
                setName(next);
                const collapsed = collapsedName(next);
                if (collapsed.length >= 1 && collapsed.length <= PET_NAME_MAX_LENGTH) {
                  setLocalAnswer('pet_name', collapsed);
                } else if (collapsed.length === 0) {
                  setLocalAnswer('pet_name', null);
                }
              }}
              placeholder={COPY.namePlaceholder}
              placeholderTextColor={ob.color.disabledBg}
              cursorColor={CARET}
              selectionColor={CARET}
              caretHidden={false}
              underlineColorAndroid="transparent"
              maxLength={PET_NAME_MAX_LENGTH}
              autoCapitalize="words"
              autoCorrect={false}
              scrollEnabled={false}
              returnKeyType="done"
              onSubmitEditing={handleNameContinue}
            />
          </View>
          <CornerPet size={petSize} named={named} />
        </View>
      ) : (
        <View style={styles.fill}>
          <View style={styles.says}>
            <PetSays line={youLine} mood={youMood} stage={5} size={ob.size.petAsk + 12} name={petName} entrance="pop" />
          </View>
          <View style={[styles.center, styles.centerBelowSays]}>
            <RevealText style={styles.label}>{COPY.youLabel}</RevealText>
            <TextInput
              ref={youRef}
              testID="first-name"
              style={styles.input}
              value={you}
              accessibilityLabel={COPY.youLabel}
              onChangeText={(value) => {
                untouched.current = false;
                const next = stripControls(value);
                setYou(next);
                const trimmed = next.trim();
                setLocalAnswer('first_name', trimmed.length > 0 ? trimmed : null);
              }}
              placeholder={COPY.youPlaceholder}
              placeholderTextColor={ob.color.disabledBg}
              cursorColor={CARET}
              selectionColor={CARET}
              caretHidden={false}
              underlineColorAndroid="transparent"
              maxLength={FIRST_NAME_MAX}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="givenName"
              autoComplete="given-name"
              scrollEnabled={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!youTrimmed) return;
                leave('provided', () => setLocalAnswer('first_name', youTrimmed));
              }}
            />
          </View>
        </View>
      )}
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
  },
  says: {
    marginTop: ob.space.sm,
  },
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: ob.color.hint,
    textAlign: 'center',
  },
  centerBelowSays: {
    paddingBottom: ob.space.xl,
  },
  corner: {
    position: 'absolute',
  },
  flip: {
    flex: 1,
    transform: [{ scaleX: -1 }],
  },
  bubbleSlot: {
    position: 'absolute',
    right: 0,
    alignItems: 'flex-start',
  },
  // A square turned 45 degrees, half hidden under the bubble's left edge, pointing at the pet.
  tail: {
    position: 'absolute',
    left: -5,
    bottom: 16,
    width: 12,
    height: 12,
    backgroundColor: colors.surface,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  input: {
    alignSelf: 'stretch',
    height: 64,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
    color: ob.color.ink,
    backgroundColor: 'transparent',
    paddingVertical: 0,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    width: 168,
  },
  dice: {
    width: DICE,
    height: DICE,
    borderRadius: DICE / 2,
    backgroundColor: 'rgba(28, 28, 30, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dicePressed: {
    backgroundColor: 'rgba(28, 28, 30, 0.13)',
    transform: [{ scale: ob.motion.pressScale }],
  },
});
