import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { ob } from '../kit/tokens';

/**
 * One icon set for the plan page: a soft tinted circle with a solid glyph in
 * the deep shade of the same tint, drawn on a 24-unit grid.
 */
export type PlanTone = 'clay' | 'green' | 'blue' | 'amber' | 'plum';

const TONES: Record<PlanTone, { bg: string; fg: string }> = {
  clay: { bg: '#FBE4DA', fg: '#C2502E' },
  green: { bg: '#DFF0E2', fg: '#2F7A45' },
  blue: { bg: '#DEEAFB', fg: '#2D63B8' },
  amber: { bg: '#FCEFD2', fg: '#B07415' },
  plum: { bg: '#F1E3F3', fg: '#86448F' },
};

export const DOSE_COLOR = {
  weeks: TONES.clay.fg,
  sessions: TONES.green.fg,
  minutes: TONES.blue.fg,
  moves: TONES.amber.fg,
} as const;

export type PlanGlyph =
  | 'calendar'
  | 'clock'
  | 'run'
  | 'meditate'
  | 'mind'
  | 'mix'
  | 'bend'
  | 'arch'
  | 'bars'
  | 'flag'
  | 'person'
  | 'info'
  | 'heart'
  | 'dumbbell';

function Line({ d, color, width = 2.8 }: { d: string; color: string; width?: number }) {
  return <Path d={d} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
}

function glyph(name: PlanGlyph, c: string): ReactNode {
  switch (name) {
    case 'calendar':
      return (
        <Path
          fill={c}
          d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"
        />
      );
    case 'clock':
      return (
        <Path
          fill={c}
          d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
        />
      );
    case 'run':
      return (
        <Path
          fill={c}
          d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"
        />
      );
    case 'meditate':
      return (
        <G>
          <Circle cx={12} cy={6} r={2} fill={c} />
          <Path
            fill={c}
            d="M21 16v-2c-2.24 0-4.16-.96-5.6-2.68l-1.34-1.6A1.98 1.98 0 0 0 12.53 9h-1.05c-.59 0-1.15.26-1.53.71l-1.34 1.6C7.16 13.04 5.24 14 3 14v2c2.77 0 5.19-1.17 7-3.25V15l-3.88 1.55c-.67.27-1.12.93-1.12 1.66C5 19.2 5.8 20 6.79 20H9v-.5a2.5 2.5 0 0 1 2.5-2.5h3c.28 0 .5.22.5.5s-.22.5-.5.5h-3c-.83 0-1.5.67-1.5 1.5v.5h7.21c.99 0 1.79-.8 1.79-1.79 0-.73-.45-1.39-1.12-1.66L14 15v-2.25c1.81 2.08 4.23 3.25 7 3.25z"
          />
        </G>
      );
    case 'mind':
      return (
        <G>
          <Path
            fill={c}
            d="M13 3C9.25 3 6.2 5.94 6.02 9.64L4.1 12.2c-.25.33 0 .8.4.8H6v3c0 1.1.9 2 2 2h1v3h7v-4.68c2.36-1.12 4-3.53 4-6.32 0-3.87-3.13-7-7-7z"
          />
          <Path
            fill="#FFFFFF"
            d="M9.6 8.8c0-1.7 1.5-2.8 3-2.4.9-1.1 3-1.1 3.7.4 1.3.2 2 1.7 1.3 2.8.7.9.2 2.2-1.1 2.4-.4 1.1-2 1.3-2.8.6-1.1.4-2.6 0-2.8-1.1-1.1-.2-1.8-1.7-1.3-2.7z"
          />
          <Line d="M13.2 7.4 V12.2" color={c} width={1.3} />
        </G>
      );
    case 'mix':
      return (
        <G>
          <Path fill={c} d="M3 11.5h18c0 4.7-4 8.5-9 8.5s-9-3.8-9-8.5z" />
          <Circle cx={8} cy={7.2} r={1.6} fill={c} />
          <Circle cx={12} cy={4.6} r={1.6} fill={c} />
          <Circle cx={15.6} cy={7.4} r={1.3} fill={c} />
          <Line d="M17.6 9.4 L21 4" color={c} width={2.2} />
        </G>
      );
    case 'bend':
      return (
        <G transform="translate(-1.2 -1)">
          <Circle cx={17.6} cy={15.4} r={2.3} fill={c} />
          <Line d="M8 8.6 L14.8 13.2" color={c} />
          <Line d="M14.4 13.6 L14 19.8" color={c} width={2.6} />
          <Line d="M8 8.6 L7 20.2" color={c} />
          <Line d="M8 8.6 L10.2 20.2" color={c} />
        </G>
      );
    case 'arch':
      return (
        <G transform="translate(0.4 -1.6)">
          <Circle cx={17.6} cy={7.4} r={2.3} fill={c} />
          <Line d="M3 19.2 H11.4 C14.6 19.2 16.4 15.6 16.8 10.8" color={c} />
          <Line d="M16.2 13.6 L15.4 19.4" color={c} width={2.6} />
        </G>
      );
    case 'bars':
      return <Path fill={c} d="M17 4h3v16h-3zM5 14h3v6H5zm6-5h3v11h-3z" />;
    case 'flag':
      return <Path fill={c} d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />;
    case 'person':
      return (
        <Path
          fill={c}
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      );
    case 'info':
      return (
        <Path
          fill={c}
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
        />
      );
    case 'heart':
      return (
        <Path
          fill={c}
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      );
    case 'dumbbell':
      return (
        <Path
          fill={c}
          d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"
        />
      );
  }
}

/** A bare colored glyph. No tile, no circle. */
export function PlanIcon({ name, tone, size = 24 }: { name: PlanGlyph; tone: PlanTone; size?: number }) {
  return (
    <View style={[styles.icon, { width: size, height: size }]} accessible={false}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {glyph(name, TONES[tone].fg)}
      </Svg>
    </View>
  );
}

/** Small icon and a big number on one line, a gray label under it. */
export function Metric({
  icon,
  tone,
  value,
  unit,
  label,
}: {
  icon: PlanGlyph;
  tone: PlanTone;
  value: number;
  unit?: string;
  label: string;
}) {
  const shown = Number.isFinite(value) ? String(Math.max(0, Math.round(value))) : '0';
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${shown} ${unit ?? ''} ${label}`}>
      <View style={styles.metricLine}>
        <PlanIcon name={icon} tone={tone} size={22} />
        <Text allowFontScaling={false} numberOfLines={1} style={styles.metricValue}>
          {shown}
          {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
        </Text>
      </View>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

export type PatternIcon = 'mix' | 'bend' | 'arch';
export type StartIcon = 'steady' | 'gentle' | 'build';

const PATTERN_GLYPH: Record<PatternIcon, PlanGlyph> = { mix: 'mix', bend: 'bend', arch: 'arch' };
const START_GLYPH: Record<StartIcon, PlanGlyph> = { gentle: 'meditate', steady: 'meditate', build: 'dumbbell' };

export function PatternMark({ kind }: { kind: PatternIcon }) {
  return <PlanIcon name={PATTERN_GLYPH[kind]} tone="clay" size={26} />;
}

export function StartMark({ kind }: { kind: StartIcon }) {
  return <PlanIcon name={START_GLYPH[kind]} tone="green" size={26} />;
}

export function NerveMark() {
  return <PlanIcon name="mind" tone="plum" size={26} />;
}

const styles = StyleSheet.create({
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  metricLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    flexShrink: 1,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: ob.color.ink,
  },
  metricUnit: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
    color: ob.color.inkSoft,
  },
  metricLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    color: ob.color.inkSoft,
  },
});
