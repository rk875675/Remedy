import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ob, obType } from '../kit/tokens';

export type PhaseMode = 'calm' | 'control' | 'build';

export type PhaseStep = {
  label: string;
  range: string;
  /** done: already behind the start. now: where this plan begins. next: later. */
  tone: 'done' | 'now' | 'next';
  mode: PhaseMode;
  /** Weeks in this phase. Null before the server outline arrives. */
  weeks: number | null;
};

const MODE_COLOR: Record<PhaseMode, string> = {
  calm: '#4F86E8',
  control: '#F0B23A',
  build: '#45B062',
};

const MODE_LABEL: Record<PhaseMode, string> = {
  calm: 'Settle',
  control: 'Control',
  build: 'Build',
};

type WeekMode = { week: number; mode: PhaseMode };

/** Consecutive weeks that share a mode, in week order. */
export function phasesFromOutline(weeks: readonly WeekMode[]): PhaseStep[] {
  const sorted = [...weeks].sort((a, b) => a.week - b.week);
  const runs: { mode: PhaseMode; start: number; end: number }[] = [];
  for (const item of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.mode === item.mode && item.week <= last.end + 1) {
      last.end = Math.max(last.end, item.week);
    } else {
      runs.push({ mode: item.mode, start: item.week, end: item.week });
    }
  }
  return runs.map((run, index) => ({
    label: MODE_LABEL[run.mode],
    range: run.start === run.end ? `Week ${run.start}` : `Weeks ${run.start}-${run.end}`,
    tone: index === 0 ? 'now' : 'next',
    mode: run.mode,
    weeks: run.end - run.start + 1,
  }));
}

/** Three-step path when the server outline has not arrived. */
export function phasesFromMode(mode: PhaseMode): PhaseStep[] {
  const order: PhaseMode[] = ['calm', 'control', 'build'];
  const startAt = order.indexOf(mode);
  return order.map((item, index) => ({
    label: MODE_LABEL[item],
    range: item === mode ? 'You start here' : '',
    tone: index < startAt ? 'done' : index === startAt ? 'now' : 'next',
    mode: item,
    weeks: null,
  }));
}

type PhaseStepperProps = {
  steps: readonly PhaseStep[];
};

/** Phases as one segmented bar, each segment sized by its weeks, with a legend under it. */
export function PhaseStepper({ steps }: PhaseStepperProps) {
  const shown = steps.filter((step) => step.tone !== 'done');
  if (shown.length === 0) return null;
  const spoken = shown
    .map((step) => (step.weeks ? `${step.label}, ${step.weeks} ${step.weeks === 1 ? 'week' : 'weeks'}` : step.label))
    .join('. ');
  return (
    <View accessibilityRole="text" accessibilityLabel={spoken} style={styles.root}>
      <View style={styles.bar}>
        {shown.map((step, index) => (
          <View
            key={`${step.label}-${index}`}
            style={[styles.segment, { flex: step.weeks ?? 1, backgroundColor: MODE_COLOR[step.mode] }]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {shown.map((step, index) => (
          <View key={`${step.label}-${index}`} style={styles.item}>
            <View style={styles.nameRow}>
              <View style={[styles.dot, { backgroundColor: MODE_COLOR[step.mode] }]} />
              <Text style={styles.name} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
            {step.weeks ? (
              <Text style={styles.value}>
                {step.weeks}
                <Text style={styles.unit}> {step.weeks === 1 ? 'wk' : 'wks'}</Text>
              </Text>
            ) : step.tone === 'now' ? (
              <Text style={styles.start}>Start</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  bar: {
    flexDirection: 'row',
    height: 12,
    gap: 3,
  },
  segment: {
    borderRadius: 6,
  },
  legend: {
    flexDirection: 'row',
  },
  item: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    ...obType.caption,
    fontWeight: '600',
    color: ob.color.ink,
    flexShrink: 1,
  },
  value: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: ob.color.ink,
  },
  unit: {
    fontSize: 16,
    fontWeight: '700',
    color: ob.color.inkSoft,
  },
  start: {
    fontSize: 16,
    lineHeight: 28,
    fontWeight: '700',
    color: ob.color.inkSoft,
  },
});
