import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Metric } from './PlanArt';
import { ob, obType } from '../kit/tokens';

const TAG_H = 28;
/** The outcome tag sits above the bars. The checkpoint tag hangs just over its own bar. */
const OUTCOME_TOP = 0;
const TOP = TAG_H + 16;
const BARS_H = 140;
const CHART_H = TOP + BARS_H;
const GAP = 6;
const GROW_MS = 520;
const STAGGER_MS = 70;
/** First bar height as a share of the tallest. */
const FLOOR = 0.18;

/** A specific halfway target, then the plan's outcome. One line each. */
export type ProgressStory = { checkpoint: string; outcome: string };

type GrowthPathProps = {
  weeks: number;
  perWeek: number;
  minutes: number;
  /** Short date, same words as the axis. */
  endLabel: string;
  story: ProgressStory | null;
};

const FALLBACK_STORY: ProgressStory = {
  checkpoint: 'Everyday moves feel easy',
  outcome: 'Stop thinking about your back',
};

function barHeights(count: number): number[] {
  if (count <= 1) return [1];
  return Array.from({ length: count }, (_, i) => FLOOR + (1 - FLOOR) * (i / (count - 1)));
}

/** Checkpoint bar, a little before the middle. Null for plans too short to have one. */
function checkpointIndex(count: number): number | null {
  if (count < 3) return null;
  return Math.max(1, Math.round((count - 1) * 0.4));
}

/**
 * Projected program progress: one bar per week, a specific checkpoint along
 * the way, and the outcome at the end. Not a picture of pain.
 */
export function GrowthPath({ weeks, perWeek, minutes, endLabel, story }: GrowthPathProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const [width, setWidth] = useState(0);
  const [checkW, setCheckW] = useState(0);
  const [outcomeW, setOutcomeW] = useState(0);
  const count = Math.max(1, Math.round(weeks));
  const heights = useMemo(() => barHeights(count), [count]);
  const mid = checkpointIndex(count);
  const grow = useRef<Animated.Value[]>([]);
  if (grow.current.length !== count) {
    grow.current = heights.map(() => new Animated.Value(0));
  }
  const tagsIn = useRef(new Animated.Value(0)).current;
  const { checkpoint, outcome } = story ?? FALLBACK_STORY;
  const note =
    'Harder only when your check-ins say so. This chart is an estimate, not a result anyone can promise.';

  useEffect(() => {
    if (!ready || reduce === null) return;
    const bars = grow.current;
    if (reduce) {
      bars.forEach((value) => value.setValue(1));
      tagsIn.setValue(1);
      return;
    }
    bars.forEach((value) => value.setValue(0));
    tagsIn.setValue(0);
    const motion = Animated.sequence([
      Animated.stagger(
        STAGGER_MS,
        bars.map((value) =>
          Animated.timing(value, {
            toValue: 1,
            duration: GROW_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
            isInteraction: false,
          }),
        ),
      ),
      Animated.timing(tagsIn, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    motion.start();
    return () => motion.stop();
  }, [ready, reduce, count, tagsIn]);

  const slotW = width > 0 ? (width - GAP * (count - 1)) / count : 0;
  const barLeft = (i: number) => i * (slotW + GAP);
  const barCenter = (i: number) => barLeft(i) + slotW / 2;
  const barTop = (i: number) => CHART_H - (heights[i] ?? 1) * BARS_H;
  const clampLeft = (center: number, tagW: number) =>
    Math.min(Math.max(0, center - tagW / 2), Math.max(0, width - tagW));
  const fade = {
    opacity: tagsIn,
    transform: [{ translateY: tagsIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };

  const stemOpacity = tagsIn.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });
  function pin(index: number, from: number) {
    const x = barCenter(index);
    const top = barTop(index);
    return (
      <React.Fragment key={`pin-${index}`}>
        <Animated.View
          style={[styles.stem, { left: x - 1, top: from, height: Math.max(0, top - from), opacity: stemOpacity }]}
        />
        <Animated.View style={[styles.dot, { left: x - 6, top: top - 6, opacity: tagsIn }]} />
      </React.Fragment>
    );
  }

  const last = count - 1;
  // Just above its own bar, and never high enough to touch the outcome tag.
  const checkTop =
    mid === null ? 0 : Math.max(TAG_H + 10, barTop(mid) - TAG_H - 10);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Projected progress over ${weeks} weeks.${mid !== null ? ` By week ${mid + 1}: ${checkpoint}.` : ''} By ${endLabel}: ${outcome}. ${perWeek} days a week, ${minutes} minutes a session. ${note}`}
    >
      <View
        style={styles.stage}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((current) => (current === next ? current : next));
        }}
      >
        {width > 0
          ? heights.map((h, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.bar,
                  {
                    left: barLeft(i),
                    width: slotW,
                    opacity: count <= 1 ? 1 : 0.28 + 0.72 * (i / (count - 1)),
                    height: grow.current[i]?.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, h * BARS_H],
                    }),
                  },
                ]}
              />
            ))
          : null}

        {width > 0 ? (
          <>
            {mid !== null ? (
              <>
                {pin(mid, checkTop + TAG_H)}
                <Animated.View
                  onLayout={(event) => setCheckW(Math.round(event.nativeEvent.layout.width))}
                  style={[
                    styles.tag,
                    styles.checkTag,
                    { left: clampLeft(barCenter(mid), checkW), top: checkTop, maxWidth: width },
                    fade,
                  ]}
                >
                  <Text style={[styles.tagText, styles.checkText]} numberOfLines={1} adjustsFontSizeToFit>
                    {checkpoint}
                  </Text>
                </Animated.View>
              </>
            ) : null}

            {pin(last, OUTCOME_TOP + TAG_H)}
            <Animated.View
              onLayout={(event) => setOutcomeW(Math.round(event.nativeEvent.layout.width))}
              style={[
                styles.tag,
                styles.outcomeTag,
                { left: clampLeft(barCenter(last), outcomeW), top: OUTCOME_TOP, maxWidth: width },
                fade,
              ]}
            >
              <Text style={[styles.tagText, styles.outcomeText]} numberOfLines={1} adjustsFontSizeToFit>
                {outcome}
              </Text>
            </Animated.View>
          </>
        ) : null}
      </View>

      <View style={styles.xRow}>
        <Text style={styles.xLabel}>Today</Text>
        {mid !== null && width > 0 ? (
          <Text style={[styles.xLabel, styles.xMid, { left: barCenter(mid) - 30 }]}>Wk {mid + 1}</Text>
        ) : null}
        <Text style={[styles.xLabel, styles.xEnd]}>{endLabel}</Text>
      </View>

      <View style={styles.stats}>
        <Metric icon="calendar" tone="clay" value={weeks} label={weeks === 1 ? 'Week' : 'Weeks'} />
        <Metric icon="run" tone="green" value={perWeek} label="Days a week" />
        <Metric icon="clock" tone="blue" value={minutes} label="Min a session" />
      </View>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: CHART_H,
    position: 'relative',
  },
  bar: {
    position: 'absolute',
    bottom: 0,
    borderRadius: 8,
    backgroundColor: ob.color.accent,
  },
  tag: {
    position: 'absolute',
    height: TAG_H,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  tagText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  checkTag: {
    backgroundColor: ob.color.surface,
    borderWidth: 1.5,
    borderColor: ob.color.accent,
  },
  checkText: {
    color: ob.color.accentDeep,
  },
  outcomeTag: {
    backgroundColor: ob.color.accent,
  },
  outcomeText: {
    color: ob.color.surface,
  },
  stem: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
    backgroundColor: ob.color.accent,
  },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ob.color.surface,
    borderWidth: 3,
    borderColor: ob.color.accentDeep,
  },
  xRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    height: 16,
  },
  xLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    color: ob.color.inkSoft,
  },
  xMid: {
    position: 'absolute',
    top: 0,
    width: 60,
    textAlign: 'center',
    color: ob.color.accentDeep,
    fontWeight: '700',
  },
  xEnd: {
    color: ob.color.ink,
    fontWeight: '700',
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  note: {
    ...obType.caption,
    fontWeight: '400',
    color: ob.color.inkSoft,
    marginTop: 16,
  },
});
