import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  LineChart,
  ObFooter,
  ObScreen,
  PrimaryButton,
  RevealText,
  SourcesSheet,
  ob,
  obType,
} from '../../components/onboarding/kit';
import { ONBOARDING_SOURCES } from '../../constants/onboardingSources';
import { useObStep } from '../../lib/onboardingFlow';
import { useReduceMotion } from '../../lib/useReduceMotion';

const COPY = {
  title: 'Most back pain gets better',
  chartLabel:
    'Average pain over time. New pain falls from 52 to 6 in a year. Long-lasting pain falls from 51 to 23.',
  newPain: 'New pain',
  lasting: 'Long-lasting pain',
  marker: '-56% in 6 weeks',
  yAxis: 'Pain',
  journal: 'CMAJ, 2012',
  finding: 'Pain dropped by more than half in the first six weeks.',
  meta: 'Review of 33 studies, 11,166 people.',
  continue: 'Continue',
} as const;

const CHART_H = 232;
const DRAW_MS = 980;

const X = [0, 0.22, 0.6, 1] as const;
const NEW_PAIN = [52, 23, 12, 6] as const;
const LASTING_PAIN = [51, 33, 26, 23] as const;
const X_LABELS = ['Now', '6 wks', '6 mo', '1 yr'];

/**
 * LineChart y is up (1 at the top). Dividing by 54 puts a score of 52
 * against the top of the plot and single digits near the bottom.
 * `1 - value/60` would draw the drop upside down.
 */
function painY(value: number): number {
  return Math.min(1, Math.max(0, value / 54));
}

function points(values: readonly number[]) {
  return X.map((x, index) => ({ x, y: painY(values[index] ?? 0) }));
}

export default function OutlookScreen() {
  const { chapter, progress, goNext } = useObStep('outlook');
  const focused = useIsFocused();
  const reduce = useReduceMotion();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [draw, setDraw] = useState(false);
  const note = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;

  useEffect(() => {
    if (!focused || reduce === null) return;
    if (reduce) {
      setDraw(true);
      note.setValue(1);
      return;
    }
    setDraw(false);
    note.setValue(0);
    const id = setTimeout(() => setDraw(true), 240);
    const motion = Animated.timing(note, {
      toValue: 1,
      duration: 420,
      delay: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start();
    return () => {
      clearTimeout(id);
      motion.stop();
    };
  }, [focused, reduce, note]);

  return (
    <>
      <ObScreen
        chapter={chapter}
        progress={progress}
        scroll={false}
        contentStyle={styles.page}
        footer={
          <ObFooter>
            <PrimaryButton label={COPY.continue} onPress={() => goNext()} />
          </ObFooter>
        }
      >
        <RevealText style={styles.title} play={focused}>
          {COPY.title}
        </RevealText>
        <View style={styles.chartWrap}>
          <OutlookChart play={draw} />
          <Animated.View
            style={{
              opacity: note,
              transform: [
                {
                  translateY: note.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            }}
          >
            <Pressable
              onPress={() => setSourcesOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${COPY.journal}. ${COPY.finding} ${COPY.meta}`}
              style={({ pressed }) => [styles.callout, pressed ? styles.calloutPressed : null]}
            >
              <Text style={styles.finding}>{COPY.finding}</Text>
              <Text style={styles.meta}>
                {COPY.journal}
                {'  ·  '}
                {COPY.meta}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </ObScreen>
      <SourcesSheet
        visible={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        items={[ONBOARDING_SOURCES.outlook]}
      />
    </>
  );
}

function OutlookChart({ play }: { play: boolean }) {
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const rise = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;

  useEffect(() => {
    if (reduce === null) return;
    if (reduce) {
      rise.setValue(1);
      return;
    }
    rise.setValue(0);
    const motion = Animated.timing(rise, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start();
    return () => motion.stop();
  }, [reduce, rise]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: rise,
          transform: [
            {
              translateY: rise.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={COPY.chartLabel}
    >
      <View
        style={styles.chartSlot}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((current) => (current === next ? current : next));
        }}
      >
        <LineChart
          width={width}
          height={CHART_H}
          play={play && width > 0}
          durationMs={DRAW_MS}
          showGrid={false}
          markerSize={14}
          markerVariant="ring"
          yLabelTop={COPY.yAxis}
          xLabels={X_LABELS}
          xLabelAt={[...X]}
          series={[
            {
              points: points(LASTING_PAIN),
              color: ob.color.clay,
              width: 3.5,
              dashed: true,
              draw: { start: 0, end: 0.9 },
            },
            {
              points: points(NEW_PAIN),
              color: ob.color.accent,
              width: 5,
              fillTo: ob.color.accent,
              fillOpacity: 0.16,
              fillFollows: true,
              draw: { start: 0.08, end: 1 },
            },
          ]}
          markers={[
            { x: 0, y: painY(52), tone: 'accent' },
            {
              x: 0.22,
              y: painY(23),
              label: COPY.marker,
              tone: 'accent',
            },
            { x: 1, y: painY(6), tone: 'accent' },
            { x: 1, y: painY(23), tone: 'clay' },
          ]}
        />
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: ob.color.accent }]} />
          <Text style={styles.legendText}>{COPY.newPain}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: ob.color.clay }]} />
          <Text style={styles.legendText}>{COPY.lasting}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingTop: 22,
  },
  title: {
    ...obType.display,
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -0.8,
    textAlign: 'left',
  },
  chartWrap: {
    flex: 1,
    justifyContent: 'center',
    marginTop: 8,
  },
  card: {
    backgroundColor: ob.color.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ob.color.lineSoft,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 2,
    shadowColor: '#1C1C1E',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  chartSlot: {
    height: CHART_H,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 4,
    paddingLeft: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 16,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: ob.color.ink,
  },
  callout: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: ob.color.accentSoft,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 6,
  },
  calloutPressed: {
    opacity: 0.72,
  },
  finding: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: ob.color.ink,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: ob.color.inkSoft,
  },
});
