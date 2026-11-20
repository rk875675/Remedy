import React, { useEffect, useId, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../constants/colors';
import type { DaySky } from '../../../lib/daySky';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Drift, Tree } from './WelcomeStage';

type MeadowStageProps = {
  width: number;
  /** Height of the box the screen measured. */
  height: number;
  /** Top of the near hill at its centre, in points from the top. The pet stands here. */
  groundY: number;
  /** Hill drawn on below the box, behind a pinned footer. */
  below?: number;
  /** Dark bushes at the lower corners. Off when buttons sit on the near hill. */
  frame?: boolean;
  /** Home sky. Omitted on onboarding, which stays on the daytime meadow. */
  day?: DaySky;
  /** Sky, sun, and moon only. No hills. */
  skyOnly?: boolean;
  /** Hills stay put. Progress uses this so the scene does not drift behind the path. */
  still?: boolean;
};

const SWAY_MS = 9000;
/** Each drifting layer is drawn this far past both screen edges, so a drift never shows where it ends. */
const OVERSCAN = 48;

/** Shared slow drift; each layer moves by its own amount so nearer layers read as closer. */
function useSway(still: boolean): Animated.Value {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const sway = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!ready || reduce !== false || still) {
      sway.setValue(0.5);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: SWAY_MS / 2, easing: ease, useNativeDriver: true, isInteraction: false }),
        Animated.timing(sway, { toValue: 0, duration: SWAY_MS, easing: ease, useNativeDriver: true, isInteraction: false }),
        Animated.timing(sway, { toValue: 0.5, duration: SWAY_MS / 2, easing: ease, useNativeDriver: true, isInteraction: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ready, reduce, still, sway]);

  return sway;
}

function Layer({
  sway,
  shift,
  width,
  height,
  children,
}: {
  sway: Animated.Value;
  shift: number;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.layer,
        { width: width + OVERSCAN * 2, height },
        { transform: [{ translateX: sway.interpolate({ inputRange: [0, 1], outputRange: [-shift, shift] }) }] },
      ]}
    >
      <Svg width={width + OVERSCAN * 2} height={height}>
        <G transform={`translate(${OVERSCAN} 0)`}>{children}</G>
      </Svg>
    </Animated.View>
  );
}

/** Small grass tufts sitting on an ellipse's top edge. */
function Tufts({
  cx,
  cy,
  rx,
  ry,
  xs,
  color,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  xs: number[];
  color: string;
}) {
  return (
    <>
      {xs.map((x) => {
        const t = (x - cx) / rx;
        if (Math.abs(t) >= 1) return null;
        const y = cy - ry * Math.sqrt(1 - t * t) + 5;
        return (
          <Path
            key={x}
            d={`M ${x - 5} ${y} Q ${x - 4} ${y - 6}, ${x - 2} ${y - 8} M ${x} ${y} L ${x} ${y - 10} M ${x + 5} ${y} Q ${x + 4} ${y - 6}, ${x + 2} ${y - 8}`}
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </>
  );
}

/**
 * Full-bleed meadow for the cold open after Welcome: hazy sky, three depths of
 * hills that drift at different speeds, a lit near hill the pet stands on, and
 * dark foreground bushes at the edges. Fills its parent; the pet is placed by
 * the screen at `groundY`.
 */
export function MeadowStage({ width, height, groundY, below = 0, frame = true, day, skyOnly = false, still = false }: MeadowStageProps) {
  const sway = useSway(still);
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sky = `sky${raw}`;
  const hill = `hill${raw}`;
  const glow = `glow${raw}`;
  const H = height + below;
  const W = width;
  const g = groundY;

  const nearTop = g - 12;
  const nearRy = (H - nearTop) * 1.15 + 40;
  const nearRx = W * 0.95;
  const nearCy = nearTop + nearRy;
  const sunX = day ? W * day.sunX : W * 0.8;
  const sunY = day ? g * day.sunY : g * 0.2;
  const treeFade = day ? 0.45 + 0.55 * (1 - day.moonOn) : 1;
  const sunScale = skyOnly ? 0.62 : 1;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: -below }]}>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={day?.top ?? colors.background} stopOpacity="1" />
            <Stop offset={String((g * 0.5) / H)} stopColor={day?.mid ?? '#F1EEDF'} stopOpacity="1" />
            <Stop offset={String(Math.min(0.98, g / H))} stopColor={day?.low ?? '#E2EDDA'} stopOpacity="1" />
            <Stop offset="1" stopColor={day?.low ?? '#E2EDDA'} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#${sky})`} />
        {day && day.moonOn > 0.04
          ? [0.18, 0.42, 0.7, 0.33, 0.58].map((x, i) => (
              <Ellipse
                key={x}
                cx={W * x}
                cy={g * (0.08 + (i % 3) * 0.06)}
                rx={1.3}
                ry={1.3}
                fill="#F7F1E4"
                opacity={day.moonOn * 0.75}
              />
            ))
          : null}
        {day && day.moonOn > 0.04 ? (
          <Ellipse cx={W * 0.22} cy={g * 0.16} rx={11} ry={11} fill="#F4E6C8" opacity={day.moonOn} />
        ) : null}
        {(day ? day.sunOn : 1) > 0.02 ? (
          <>
            <Ellipse
              cx={sunX}
              cy={sunY}
              rx={58 * sunScale}
              ry={58 * sunScale}
              fill={day?.sunGlow ?? '#F6E6C0'}
              opacity={0.35 * (day?.sunOn ?? 1)}
            />
            <Ellipse
              cx={sunX}
              cy={sunY}
              rx={26 * sunScale}
              ry={26 * sunScale}
              fill={day?.sun ?? '#F3D7A0'}
              opacity={0.95 * (day?.sunOn ?? 1)}
            />
          </>
        ) : null}
      </Svg>

      {skyOnly ? null : (
        <>
      <Drift from={W * 0.06} top={g * 0.1} rx={34} ry={13} opacity={(day?.cloud ?? 0.6) * 1} still={still} />
      <Drift from={W * 0.48} top={g * 0.26} rx={26} ry={10} delay={1200} opacity={(day?.cloud ?? 0.45) * 0.75} still={still} />

      <Layer sway={sway} shift={3} width={W} height={H}>
        <Ellipse cx={W * 0.22} cy={g * 0.82} rx={W * 0.78} ry={g * 0.26} fill={day?.farA ?? '#D5E6D0'} />
        <Ellipse cx={W * 0.98} cy={g * 0.86} rx={W * 0.52} ry={g * 0.22} fill={day?.farB ?? '#C8DEC6'} />
        <Tree x={W * 0.09} y={g * 0.6} h={22} fill="#9DBFA4" opacity={0.7 * treeFade} lean={-2} />
        <Tree x={W * 0.16} y={g * 0.63} h={16} fill="#9DBFA4" opacity={0.6 * treeFade} lean={1} spread={0.9} />
        <Tree x={W * 0.87} y={g * 0.68} h={20} fill="#93B89B" opacity={0.65 * treeFade} lean={2} />
      </Layer>

      <Layer sway={sway} shift={7} width={W} height={H}>
        <Ellipse cx={W * 0.8} cy={g * 1.02} rx={W * 0.72} ry={g * 0.27} fill={day?.midA ?? '#AFD2AE'} />
        <Ellipse cx={W * 0.04} cy={g * 1.06} rx={W * 0.58} ry={g * 0.23} fill={day?.midB ?? '#98C39D'} />
        <Tree x={W * 0.91} y={g * 0.8} h={38} fill="#5E8F6C" opacity={0.82 * treeFade} lean={3} spread={1.05} />
        <Tree x={W * 0.8} y={g * 0.83} h={26} fill="#6E9A78" opacity={0.72 * treeFade} lean={-2} spread={0.92} />
        <Tree x={W * 0.12} y={g * 0.9} h={30} fill="#5E8F6C" opacity={0.78 * treeFade} lean={-3} />
      </Layer>

      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={hill} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#52886A" stopOpacity="1" />
            <Stop offset="0.12" stopColor={colors.primary} stopOpacity="1" />
            <Stop offset="0.4" stopColor={colors.primaryDeep} stopOpacity="1" />
            <Stop offset="1" stopColor="#24432F" stopOpacity="1" />
          </LinearGradient>
          <RadialGradient id={glow} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#F6EDE0" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#F6EDE0" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={W * 0.5} cy={nearCy} rx={nearRx} ry={nearRy} fill={`url(#${hill})`} />
        <Ellipse cx={W * 0.5} cy={nearTop + 46} rx={W * 0.5} ry={70} fill={`url(#${glow})`} />
        <Ellipse cx={W * 0.5} cy={nearCy} rx={nearRx} ry={nearRy} fill="none" stroke="#8DBB96" strokeWidth={2} opacity={0.7} />
        <Tufts
          cx={W * 0.5}
          cy={nearCy}
          rx={nearRx}
          ry={nearRy}
          xs={[W * 0.14, W * 0.27, W * 0.71, W * 0.86]}
          color="#86B590"
        />
      </Svg>

      {frame ? (
        <Layer sway={sway} shift={-9} width={W} height={H}>
          <Tree x={W * 0.14} y={g + (H - g) * 0.2} h={84} fill="#21402C" opacity={0.96} lean={3} spread={1.1} />
          <Tree x={W * 0.86} y={g + (H - g) * 0.24} h={70} fill="#284A33" opacity={0.95} lean={-3} />
        </Layer>
      ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: -OVERSCAN,
  },
});

/** Soft contact shadow under the pet. Pass the pet body's shadow style to shrink it on a hop. */
export function GroundShadow({ width, style }: { width: number; style?: StyleProp<ViewStyle> }) {
  const id = `shade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const height = width * 0.22;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', bottom: -height * 0.45, left: 0, right: 0, alignItems: 'center' }, style]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#0E1F14" stopOpacity="0.42" />
            <Stop offset="0.6" stopColor="#0E1F14" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#0E1F14" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
