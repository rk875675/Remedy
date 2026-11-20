import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PetMood } from '../../../constants/petImages';
import { trackOption, useObStep, type ObStepKey } from '../../../lib/onboardingFlow';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { AskHeader, useTypedDelay } from './AskHeader';
import type { ObGlyph } from './glyphs';
import type { IconName } from './Icon';
import { ObFooter } from './ObFooter';
import { ObScreen } from './ObScreen';
import { OptionList } from './OptionList';
import { OptionRow } from './OptionRow';
import { PrimaryButton } from './PrimaryButton';
import { ob, obType } from './tokens';

type Reaction = { line: string; mood?: PetMood };

export type SelectOption<V extends string> = {
  value: V;
  label: string;
  sub?: string;
  icon?: IconName;
  /** Existing illustration. Preferred over `glyph` and `icon`. */
  image?: ImageSourcePropType;
  /** Custom drawing in a soft tile. Preferred over `icon`. */
  glyph?: ObGlyph;
  badge?: string;
  /** Pet line shown after this option is tapped on. */
  reaction?: Reaction;
};

export type SelectQuestionProps<V extends string> = {
  /** Drives chapter, progress, analytics, and goNext. */
  step: ObStepKey;
  /** The question, typed in the pet bubble. */
  ask: string;
  /** Default `ready`. */
  askMood?: PetMood;
  /** Optional quiet line under the bubble. Question screens leave this off. */
  sub?: string;
  options: ReadonlyArray<SelectOption<V>>;
  mode: 'single' | 'multi';
  /** Controlled. Single mode uses 0 or 1 items. Multi keeps tap order. */
  selected: ReadonlyArray<V>;
  /** Parent persists this to context. */
  onChange: (next: V[]) => void;
  /** Multi only: continuing with nothing selected is valid. */
  allowNone?: boolean;
  /** Footer label while nothing is selected. Default "None of these". */
  noneLabel?: string;
  /** Default "Continue". */
  continueLabel?: string;
  /**
   * Overrides per-option reactions. The second argument is the choice the
   * bubble should answer: the option just tapped, while it stays selected,
   * otherwise the latest choice still on. Return null to use that option's
   * own reaction.
   */
  reactionFor?: (selected: ReadonlyArray<V>, anchor: V | null) => Reaction | null;
  /** For example `hard` sends `hard_bed`. Null or empty skips option analytics. */
  analyticsPrefix?: string | null;
  /** Alternative to prefix when the legacy value is sent as-is. Wins if both are set. */
  analyticsValue?: (value: V) => string;
  aboveOptions?: ReactNode;
  /** For example a NoteCard or a privacy line under the list. */
  belowOptions?: ReactNode;
  footerNote?: string;
  /** Runs just before goNext. Derived writes go here. */
  onContinue?: (selected: V[]) => void;
  /**
   * When false, Continue runs `onContinue` and stays on this screen.
   * Default true. Use this for the first page of a two-page question.
   */
  advance?: boolean;
  /** Replaces the multi-select count sent when leaving the step. */
  answerCount?: number;
  /** Header back. Default is the previous screen. */
  onBack?: () => void;
  /**
   * Passed to the screen body. Short lists use `obCenterContent` so the
   * stack sits in the body instead of under the bar. Tall lists still scroll
   * from the top.
   */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

const CONTINUE_LOCK_MS = 600;
const REVEAL_CAP_MS = 900;

/**
 * `trackOption` only accepts the analytics union, not a free string.
 * Screen values are checked at runtime in dev and never throw.
 */
function reportOption(
  step: ObStepKey,
  value: string,
  opts: { multi: boolean; deselect: boolean; count: number },
): void {
  trackOption(step, value as Parameters<typeof trackOption>[1], opts);
}

function analyticsToken<V extends string>(
  value: V,
  prefix: string | null | undefined,
  map: ((value: V) => string) | undefined,
): string | null {
  if (map) return map(value);
  if (prefix !== undefined && prefix !== null && prefix.length > 0) return `${prefix}_${value}`;
  return null;
}

function lastInTapOrder<V extends string>(selected: ReadonlyArray<V>): V | null {
  const last = selected[selected.length - 1];
  return last === undefined ? null : last;
}

function nextSelection<V extends string>(
  mode: 'single' | 'multi',
  selected: ReadonlyArray<V>,
  value: V,
): { next: V[]; deselect: boolean } {
  if (selected.includes(value)) {
    return {
      next: mode === 'single' ? [] : selected.filter((item) => item !== value),
      deselect: true,
    };
  }
  if (mode === 'single') return { next: [value], deselect: false };
  return { next: [...selected, value], deselect: false };
}

/**
 * The line follows a choice that is still on. A tap that turns an option off
 * does not keep that option's line, and a saved answer still has one when the
 * screen is shown again.
 */
function resolveReaction<V extends string>(
  options: ReadonlyArray<SelectOption<V>>,
  selected: ReadonlyArray<V>,
  lastTapped: V | null,
  reactionFor: SelectQuestionProps<V>['reactionFor'],
): Reaction | null {
  if (selected.length === 0) return null;
  const anchor =
    lastTapped !== null && selected.includes(lastTapped) ? lastTapped : lastInTapOrder(selected);
  if (anchor === null) return null;
  const custom = reactionFor?.(selected, anchor);
  if (custom) return custom;
  return options.find((option) => option.value === anchor)?.reaction ?? null;
}

/**
 * The question stays in the layout at all times so the list does not jump
 * when a reaction takes over the bubble. It fades in only then.
 */
function QuestionCaption({ ask, shown }: { ask: string; shown: boolean }) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(0)).current;

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
      isInteraction: false,
    });
    anim.start();
    return () => anim.stop();
  }, [shown, reduce, opacity]);

  return (
    <View style={styles.captionSlot} pointerEvents="none">
      <Animated.Text
        numberOfLines={1}
        style={[styles.caption, { opacity }]}
        selectable={false}
        accessibilityRole="header"
        accessible={shown}
        accessibilityElementsHidden={!shown}
        importantForAccessibility={shown ? 'yes' : 'no-hide-descendants'}
      >
        {ask}
      </Animated.Text>
    </View>
  );
}

/**
 * Shared single- and multi-select question. Selection is controlled so
 * back navigation restores from context. Only the last tap is remembered here.
 */
export function SelectQuestion<V extends string>({
  step,
  ask,
  askMood = 'ready',
  sub,
  options,
  mode,
  selected,
  onChange,
  allowNone = false,
  noneLabel = 'None of these',
  continueLabel = 'Continue',
  reactionFor,
  analyticsPrefix,
  analyticsValue,
  aboveOptions,
  belowOptions,
  footerNote,
  onContinue,
  advance = true,
  answerCount,
  onBack,
  contentStyle,
  testID,
}: SelectQuestionProps<V>) {
  const { chapter, progress, goNext } = useObStep(step);
  const revealDelay = Math.min(useTypedDelay(ask), REVEAL_CAP_MS);
  const [lastTapped, setLastTapped] = useState<V | null>(null);
  const continueLock = useRef(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (lockTimer.current !== null) clearTimeout(lockTimer.current);
    };
  }, []);

  const reaction = resolveReaction(options, selected, lastTapped, reactionFor);
  const nonePath = mode === 'multi' && allowNone;
  const canContinue = nonePath || selected.length > 0;
  const buttonLabel = nonePath && selected.length === 0 ? noneLabel : continueLabel;

  function toggle(value: V) {
    const { next, deselect } = nextSelection(mode, selected, value);
    onChange(next);
    setLastTapped(value);
    const token = analyticsToken(value, analyticsPrefix, analyticsValue);
    if (token === null) return;
    reportOption(step, token, {
      multi: mode === 'multi',
      deselect,
      count: next.length,
    });
  }

  function handleContinue() {
    if (continueLock.current || !canContinue) return;
    continueLock.current = true;
    if (lockTimer.current !== null) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => {
      continueLock.current = false;
      lockTimer.current = null;
    }, CONTINUE_LOCK_MS);
    const current = selected.slice();
    onContinue?.(current);
    if (!advance) return;
    goNext(mode === 'multi' ? (answerCount ?? current.length) : undefined);
  }

  return (
    <ObScreen
      testID={testID}
      chapter={chapter}
      progress={progress}
      onBack={onBack}
      contentStyle={contentStyle}
      footer={
        <ObFooter note={footerNote}>
          <PrimaryButton
            testID="continue"
            label={buttonLabel}
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </ObFooter>
      }
    >
      <AskHeader line={reaction?.line ?? ask} mood={reaction?.mood ?? askMood} sub={sub} />
      {aboveOptions ? <View style={styles.above}>{aboveOptions}</View> : null}
      <QuestionCaption ask={ask} shown={reaction !== null} />
      <OptionList delayMs={revealDelay}>
        {options.map((option) => (
          <OptionRow
            key={option.value}
            testID={`opt-${option.value}`}
            label={option.label}
            sub={option.sub}
            icon={option.icon}
            image={option.image}
            glyph={option.glyph}
            badge={option.badge}
            mode={mode}
            selected={selected.includes(option.value)}
            onPress={() => toggle(option.value)}
          />
        ))}
      </OptionList>
      {belowOptions ? <View style={styles.below}>{belowOptions}</View> : null}
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  // Reserved in both states so the list does not jump when a reaction
  // replaces the question. The line sits in that gap, close to the options.
  captionSlot: {
    marginTop: 12,
    marginBottom: 8,
    height: 18,
    justifyContent: 'flex-end',
  },
  caption: {
    ...obType.caption,
  },
  above: {
    marginTop: ob.space.md,
  },
  below: {
    marginTop: ob.space.md,
  },
});
