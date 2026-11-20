import React, { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { ob, obType, toneColors, type ObTone } from './tokens';

export type Series = {
  /** Normalized 0..1, y up. */
  points: Array<{ x: number; y: number }>;
  color: string;
  width?: number;
  dashed?: boolean;
  /** Gradient colour under the line. Null or omitted draws no fill. */
  fillTo?: string | null;
  /** Fill is revealed with the stroke, instead of fading in after the line. */
  fillFollows?: boolean;
  /** Opacity at the top of the fill. Default 0.34. */
  fillOpacity?: number;
  /** When this stroke runs, as a fraction of the chart clock. */
  draw?: { start: number; end: number };
};

export type Marker = {
  x: number;
  y: number;
  label?: string;
  tone?: ObTone;
  pulse?: boolean;
  /** Filled pill with light text. Default is a soft tinted chip. */
  solid?: boolean;
};

export type LineChartProps = {
  width: number;
  height: number;
  series: Series[];
  markers?: Marker[];
  xLabels?: string[];
  /**
   * Normalized 0..1 x for each label. When omitted, labels are spaced evenly
   * from the first to the last, which is what a two-label axis already does.
   */
  xLabelAt?: number[];
  yLabelTop?: string;
  yLabelBottom?: string;
  /** Dashed plot lines. Default on. */
  showGrid?: boolean;
  /** Marker dot diameter. Default 12. */
  markerSize?: number;
  /** `ring` is a hollow dot. Default `fill`. */
  markerVariant?: 'fill' | 'ring';
  /** Start the draw when this becomes true. */
  play: boolean;
  durationMs?: number;
  /** Clock curve for the stroke. Default is a cubic ease-out. */
  easing?: (value: number) => number;
  onDrawn?: () => void;
};

type XY = { x: number; y: number };

type Sample = { x: number; len: number };

type BuiltSeries = {
  d: string;
  fillD: string;
  length: number;
  samples: Sample[];
  color: string;
  width: number;
  dashed: boolean;
  fillTo: string | null;
  fillOpacity: number;
  fillFollows: boolean;
  span: { start: number; end: number };
};

type BuiltMarker = {
  px: number;
  py: number;
  label?: string;
  tone: ObTone;
  pulse: boolean;
  solid: boolean;
  threshold: number;
};

type Geometry = {
  series: BuiltSeries[];
  markers: BuiltMarker[];
  padL: number;
  padT: number;
  innerW: number;
  innerH: number;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const EASE_OUT = Easing.out(Easing.cubic);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function num(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** Fritsch-Carlson monotone slopes, so the curve stays between its endpoints. */
function monotoneTangents(pts: XY[]): number[] {
  const n = pts.length;
  const delta: number[] = [];
  const slope = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const left = pts[i];
    const right = pts[i + 1];
    if (!left || !right) continue;
    const dx = right.x - left.x;
    delta.push(dx === 0 ? 0 : (right.y - left.y) / dx);
  }
  slope[0] = delta[0] ?? 0;
  slope[n - 1] = delta[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const prev = delta[i - 1] ?? 0;
    const next = delta[i] ?? 0;
    slope[i] = prev * next <= 0 ? 0 : (prev + next) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const d = delta[i] ?? 0;
    if (d === 0) {
      slope[i] = 0;
      slope[i + 1] = 0;
      continue;
    }
    const a = (slope[i] ?? 0) / d;
    const b = (slope[i + 1] ?? 0) / d;
    const sum = a * a + b * b;
    if (sum > 9) {
      const scale = 3 / Math.sqrt(sum);
      slope[i] = scale * a * d;
      slope[i + 1] = scale * b * d;
    }
  }
  return slope;
}

function cubicAt(p0: XY, c1: XY, c2: XY, p1: XY, t: number): XY {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + tt * t * p1.x,
    y: uu * u * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + tt * t * p1.y,
  };
}

function spanFor(dashed: boolean, index: number, count: number): { start: number; end: number } {
  if (count <= 1) return { start: 0, end: 1 };
  if (dashed) return { start: 0, end: 0.58 };
  return { start: Math.min(0.2, 0.08 + index * 0.05), end: 1 };
}

function fractionAt(samples: Sample[], total: number, dataX: number): number {
  if (total <= 0 || samples.length === 0) return 1;
  const x = clamp01(dataX);
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    const a = samples[i - 1];
    if (!a || !b || b.x < x) continue;
    const span = b.x - a.x;
    const t = span === 0 ? 1 : (x - a.x) / span;
    const len = a.len + (b.len - a.len) * Math.min(1, Math.max(0, t));
    return len / total;
  }
  return 1;
}

function buildGeometry(
  width: number,
  height: number,
  series: Series[],
  markers: Marker[],
  hasXLabels: boolean,
): Geometry {
  const padT = 28;
  const padB = hasXLabels ? 22 : 8;
  const padL = 4;
  const padR = 8;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = Math.max(0, height - padT - padB);
  const plotTop = padT;
  const plotBottom = padT + innerH;

  const built: BuiltSeries[] = [];
  if (innerW >= 2 && innerH >= 2) {
    series.forEach((item, index) => {
      const unique: Array<{ x: number; y: number }> = [];
      [...item.points]
        .map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) }))
        .sort((a, b) => a.x - b.x)
        .forEach((point) => {
          const prev = unique[unique.length - 1];
          if (!prev || point.x > prev.x + 0.0001) unique.push(point);
        });
      if (unique.length < 2) return;

      const pixels = unique.map((point) => ({
        x: padL + point.x * innerW,
        y: plotTop + (1 - point.y) * innerH,
        dataX: point.x,
      }));
      const slope = monotoneTangents(pixels);
      const samples: Sample[] = [];
      const first = pixels[0];
      if (!first) return;
      samples.push({ x: first.dataX, len: 0 });
      let d = `M ${num(first.x)} ${num(first.y)}`;
      let length = 0;

      for (let i = 0; i < pixels.length - 1; i++) {
        const p0 = pixels[i];
        const p1 = pixels[i + 1];
        if (!p0 || !p1) continue;
        const dx = p1.x - p0.x;
        const c1 = {
          x: p0.x + dx / 3,
          y: Math.min(plotBottom, Math.max(plotTop, p0.y + ((slope[i] ?? 0) * dx) / 3)),
        };
        const c2 = {
          x: p1.x - dx / 3,
          y: Math.min(plotBottom, Math.max(plotTop, p1.y - ((slope[i + 1] ?? 0) * dx) / 3)),
        };
        d += ` C ${num(c1.x)} ${num(c1.y)} ${num(c2.x)} ${num(c2.y)} ${num(p1.x)} ${num(p1.y)}`;
        let prev: XY = p0;
        for (let step = 1; step <= 16; step++) {
          const point = cubicAt(p0, c1, c2, p1, step / 16);
          length += Math.hypot(point.x - prev.x, point.y - prev.y);
          const dataX = innerW === 0 ? p1.dataX : (point.x - padL) / innerW;
          samples.push({ x: dataX, len: length });
          prev = point;
        }
      }

      const last = pixels[pixels.length - 1];
      if (!last) return;
      const safeLength = Math.max(1, Math.round(length * 10) / 10);
      built.push({
        d,
        fillD: `${d} L ${num(last.x)} ${num(plotBottom)} L ${num(first.x)} ${num(plotBottom)} Z`,
        length: safeLength,
        samples,
        color: item.color,
        width: item.width ?? 3.5,
        dashed: item.dashed ?? false,
        fillTo: item.fillTo ?? null,
        fillOpacity: item.fillOpacity ?? 0.34,
        fillFollows: item.fillFollows ?? false,
        span: item.draw ?? spanFor(item.dashed ?? false, index, series.length),
      });
    });
  }

  let primary = built.length - 1;
  for (let i = built.length - 1; i >= 0; i--) {
    if (!built[i]?.dashed) {
      primary = i;
      break;
    }
  }
  const guide = built[primary];
  const placed: BuiltMarker[] = markers.map((marker) => {
    const fraction = guide
      ? fractionAt(guide.samples, guide.length, marker.x)
      : 1;
    const span = guide?.span ?? { start: 0, end: 1 };
    return {
      px: padL + clamp01(marker.x) * innerW,
      py: plotTop + (1 - clamp01(marker.y)) * innerH,
      label: marker.label,
      tone: marker.tone ?? 'accent',
      pulse: marker.pulse ?? false,
      solid: marker.solid ?? false,
      threshold: span.start + fraction * (span.end - span.start),
    };
  });

  return { series: built, markers: placed, padL, padT, innerW, innerH };
}

function PulseRing({ color, active }: { color: string; active: boolean }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, value]);
  if (!active) return null;
  const scale = value.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const opacity = value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { borderColor: color, opacity, transform: [{ scale }] }]}
    />
  );
}

const CHIP_W = 156;
const CHIP_H = 26;

/**
 * Park the callout above the marker, shifted toward the open side of the
 * plot, so it does not sit on the stroke. Clamped inside the chart box.
 */
function placeChip(
  px: number,
  py: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const gap = 10;
  let top = py - CHIP_H - gap - 22;
  let left = px + 8;
  if (top < 0) top = Math.min(height - CHIP_H - 4, py + 16);
  if (left + CHIP_W > width - 4) left = px - CHIP_W - 8;
  if (left < 4) left = 4;
  if (top < 0) top = 0;
  return { left, top };
}

function XLabels({ labels, at }: { labels: string[]; at?: number[] }) {
  const spots = at && at.length === labels.length ? at : null;
  if (!spots) {
    return (
      <View style={styles.xLabels}>
        {labels.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.xLabel}>
            {label}
          </Text>
        ))}
      </View>
    );
  }
  return (
    <View style={[styles.xLabels, styles.xLabelsPlaced]}>
      {labels.map((label, index) => {
        const frac = clamp01(spots[index] ?? 0);
        const align = frac <= 0.04 ? 'flex-start' : frac >= 0.96 ? 'flex-end' : 'center';
        const nudge = frac <= 0.04 ? 0 : frac >= 0.96 ? -72 : -36;
        return (
          <View
            key={`${label}-${index}`}
            style={[styles.xTick, { left: `${frac * 100}%`, marginLeft: nudge, alignItems: align }]}
          >
            <Text style={styles.xLabel}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Smooth line chart. The stroke draws on via dash offset; length is sampled
 * in JS because native SVG cannot measure a path. Markers pop as the line
 * reaches them.
 */
export function LineChart({
  width,
  height,
  series,
  markers = [],
  xLabels,
  xLabelAt,
  yLabelTop,
  yLabelBottom,
  showGrid = true,
  markerSize = 12,
  markerVariant = 'fill',
  play,
  durationMs = 1100,
  easing = EASE_OUT,
  onDrawn,
}: LineChartProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const clock = useRef(new Animated.Value(0)).current;
  const drawn = useRef(false);
  const onDrawnRef = useRef(onDrawn);
  onDrawnRef.current = onDrawn;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const seriesKey = JSON.stringify(
    series.map((item) => ({
      points: item.points,
      color: item.color,
      width: item.width ?? null,
      dashed: item.dashed ?? false,
      fillTo: item.fillTo ?? null,
      fillOpacity: item.fillOpacity ?? 0.34,
      fillFollows: item.fillFollows ?? false,
      draw: item.draw ?? null,
    })),
  );
  const markerKey = JSON.stringify(markers);
  const hasXLabels = (xLabels?.length ?? 0) > 0;
  const geom = useMemo(
    () => buildGeometry(width, height, series, markers, hasXLabels),
    // seriesKey / markerKey stand in for the array contents so a new array
    // identity with the same points does not rebuild the curve mid-draw.
    [width, height, seriesKey, markerKey, hasXLabels],
  );

  const pops = useRef<Animated.Value[]>([]);
  const popped = useRef<boolean[]>([]);
  if (pops.current.length !== geom.markers.length) {
    pops.current = geom.markers.map(() => new Animated.Value(0));
    popped.current = geom.markers.map(() => false);
  }

  const motion = useMemo(
    () =>
      geom.series.map((item) => {
        const end = Math.max(item.span.end, item.span.start + 0.0001);
        const local = clock.interpolate({
          inputRange: [item.span.start, end],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        });
        return {
          dash: local.interpolate({ inputRange: [0, 1], outputRange: [item.length, 0] }),
          clip: local.interpolate({
            inputRange: [0, 1],
            outputRange: [geom.padL, geom.padL + geom.innerW],
          }),
          fill: item.fillFollows
            ? local.interpolate({
                inputRange: [0, 0.04, 1],
                outputRange: [0, 1, 1],
                extrapolate: 'clamp',
              })
            : local.interpolate({
                inputRange: [0, 0.7, 1],
                outputRange: [0, 0, 1],
                extrapolate: 'clamp',
              }),
        };
      }),
    [geom, clock],
  );

  useEffect(() => {
    function showMarkers() {
      popped.current = popped.current.map(() => true);
      pops.current.forEach((value) => value.setValue(1));
    }
    function hideMarkers() {
      popped.current = popped.current.map(() => false);
      pops.current.forEach((value) => value.setValue(0));
    }
    function fireDrawn() {
      if (drawn.current) return;
      drawn.current = true;
      onDrawnRef.current?.();
    }
    if (!play || width <= 0 || height <= 0) {
      if (!play) {
        drawn.current = false;
        clock.setValue(0);
        hideMarkers();
      }
      return;
    }
    if (reduce === null) return;
    if (reduce) {
      clock.setValue(1);
      showMarkers();
      fireDrawn();
      return;
    }
    if (!ready) return;
    clock.setValue(0);
    hideMarkers();
    const anim = Animated.timing(clock, {
      toValue: 1,
      duration: durationMs,
      easing,
      useNativeDriver: false,
      isInteraction: false,
    });
    anim.start(({ finished }) => {
      if (finished) fireDrawn();
    });
    return () => anim.stop();
  }, [play, reduce, ready, width, height, durationMs, easing, clock]);

  useEffect(() => {
    const id = clock.addListener(({ value }) => {
      geom.markers.forEach((marker, index) => {
        const pop = pops.current[index];
        if (!pop || popped.current[index]) return;
        if (value + 0.0001 < marker.threshold) return;
        popped.current[index] = true;
        Animated.spring(pop, {
          toValue: 1,
          tension: ob.motion.spring.tension,
          friction: ob.motion.spring.friction,
          useNativeDriver: true,
          isInteraction: false,
        }).start();
      });
    });
    return () => clock.removeListener(id);
  }, [clock, geom.markers]);

  if (width <= 0 || height <= 0) {
    return <View style={{ width: Math.max(0, width), height: Math.max(0, height) }} />;
  }

  const plotBottom = geom.padT + geom.innerH;
  const gridYs = [geom.padT, geom.padT + geom.innerH / 2, plotBottom];

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Line chart"
      style={{ width, height }}
    >
      <Svg width={width} height={height}>
        <Defs>
          {geom.series.map((item, index) =>
            item.fillTo ? (
              <LinearGradient
                key={`g${index}`}
                id={`${uid}f${index}`}
                x1="0"
                y1={geom.padT}
                x2="0"
                y2={plotBottom}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={item.fillTo} stopOpacity={item.fillOpacity} />
                <Stop offset="1" stopColor={item.fillTo} stopOpacity={0} />
              </LinearGradient>
            ) : null,
          )}
          {geom.series.map((item, index) => (
            <ClipPath key={`c${index}`} id={`${uid}c${index}`}>
              <AnimatedRect x={0} y={0} height={height} width={motion[index]?.clip} />
            </ClipPath>
          ))}
        </Defs>
        {showGrid
          ? gridYs.map((y) => (
              <Path
                key={y}
                d={`M ${geom.padL} ${num(y)} L ${geom.padL + geom.innerW} ${num(y)}`}
                stroke={ob.color.lineSoft}
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="none"
              />
            ))
          : null}
        {geom.series.map((item, index) => {
          const node = motion[index];
          if (!node) return null;
          return (
            <React.Fragment key={`s${index}`}>
              {item.fillTo ? (
                <AnimatedPath
                  d={item.fillD}
                  fill={`url(#${uid}f${index})`}
                  stroke="none"
                  opacity={node.fill}
                  clipPath={`url(#${uid}c${index})`}
                />
              ) : null}
              <AnimatedPath
                d={item.d}
                stroke={item.color}
                strokeWidth={item.width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={
                  item.dashed
                    ? `${Math.max(10, Math.round(item.width * 3.6))} ${Math.max(7, Math.round(item.width * 2.2))}`
                    : `${item.length} ${item.length}`
                }
                strokeDashoffset={item.dashed ? 0 : node.dash}
                clipPath={item.dashed ? `url(#${uid}c${index})` : undefined}
              />
            </React.Fragment>
          );
        })}
      </Svg>
      {yLabelTop ? <Text style={[styles.yLabel, styles.yTop]}>{yLabelTop}</Text> : null}
      {yLabelBottom ? (
        <Text style={[styles.yLabel, { bottom: (xLabels?.length ?? 0) > 0 ? 20 : 0 }]}>
          {yLabelBottom}
        </Text>
      ) : null}
      {xLabels && xLabels.length > 0 ? (
        <XLabels labels={xLabels} at={xLabelAt} />
      ) : null}
      {geom.markers.map((marker, index) => {
        const tone = toneColors(marker.tone);
        const scale = pops.current[index];
        if (!scale) return null;
        const chip = marker.label ? placeChip(marker.px, marker.py, width, height) : null;
        const half = markerSize / 2;
        return (
          <React.Fragment key={`${marker.px}-${marker.py}-${index}`}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.marker,
                {
                  width: markerSize,
                  height: markerSize,
                  left: marker.px - half,
                  top: marker.py - half,
                  transform: [{ scale }],
                },
              ]}
            >
              {marker.pulse ? (
                <PulseRing color={tone.fg} active={play && reduce === false} />
              ) : null}
              <View
                style={[
                  styles.dot,
                  {
                    width: markerSize,
                    height: markerSize,
                    borderRadius: half,
                    backgroundColor: markerVariant === 'ring' ? ob.color.surface : tone.fg,
                    borderColor: tone.fg,
                    borderWidth: markerVariant === 'ring' ? 2.5 : 2,
                  },
                ]}
              />
            </Animated.View>
            {marker.label && chip ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.chipFloat,
                  { left: chip.left, top: chip.top, opacity: scale, transform: [{ scale }] },
                ]}
              >
                <View
                  style={[
                    styles.chip,
                    marker.solid ? styles.chipSolid : null,
                    { backgroundColor: marker.solid ? tone.fg : tone.bg },
                  ]}
                >
                  <Text style={[styles.chipText, { color: marker.solid ? ob.color.surface : tone.fg }]}>
                    {marker.label}
                  </Text>
                </View>
              </Animated.View>
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: {
    ...obType.caption,
    position: 'absolute',
    left: 0,
    maxWidth: '46%',
  },
  yTop: {
    top: 0,
  },
  xLabels: {
    position: 'absolute',
    left: 4,
    right: 8,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  xLabelsPlaced: {
    height: 18,
  },
  xTick: {
    position: 'absolute',
    bottom: 0,
    width: 72,
  },
  xLabel: {
    ...obType.caption,
  },
  marker: {
    position: 'absolute',
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: ob.color.surface,
  },
  chipFloat: {
    position: 'absolute',
    maxWidth: CHIP_W,
  },
  chip: {
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  chipSolid: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
