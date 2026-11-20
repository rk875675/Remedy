import React, { useId, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../../../constants/colors';

type HillCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * No card. Hills fade into the screen colour so there is no rectangle edge.
   */
  blend?: boolean;
};

const SKY = '#E7F2E4';
const SUN = '#F3D7A0';
const FAR = '#D5E8D2';
const MID = '#A9CFAA';
const NEAR = colors.primary;
const TREE = '#2F5440';
const TRUNK = '#6A5344';

/**
 * A small version of the welcome meadow: sky, sun, layered hills, trees at the edges.
 * The pet stands on the near hill. Room is left around the pet so the unfurl clip is not cut off.
 */
export function HillCard({ children, style, blend = false }: HillCardProps) {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const rawId = useId();
  const gradientId = `meadow${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View
      style={[blend ? styles.blend : styles.card, style]}
      onLayout={(event) => {
        const nextW = Math.round(event.nativeEvent.layout.width);
        const nextH = Math.round(event.nativeEvent.layout.height);
        setWidth((current) => (current === nextW ? current : nextW));
        setHeight((current) => (current === nextH ? current : nextH));
      }}
    >
      {width > 0 && height > 0 ? (
        <Meadow width={width} height={height} blend={blend} gradientId={gradientId} />
      ) : null}
      <View style={styles.crest}>{children}</View>
    </View>
  );
}

function Meadow({
  width,
  height,
  blend,
  gradientId,
}: {
  width: number;
  height: number;
  blend: boolean;
  gradientId: string;
}) {
  const ground = height * 0.62;
  const far = `${gradientId}far`;
  const mid = `${gradientId}mid`;
  const near = `${gradientId}near`;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {blend ? (
        <Defs>
          <LinearGradient id={far} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} stopOpacity="0" />
            <Stop offset="0.42" stopColor="#E4EBD8" stopOpacity="0.2" />
            <Stop offset="1" stopColor={FAR} stopOpacity="0.95" />
          </LinearGradient>
          <LinearGradient id={mid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={FAR} stopOpacity="0" />
            <Stop offset="0.38" stopColor={MID} stopOpacity="0.35" />
            <Stop offset="1" stopColor={MID} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id={near} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#8FB89A" stopOpacity="0" />
            <Stop offset="0.34" stopColor="#6E9A78" stopOpacity="0.55" />
            <Stop offset="1" stopColor={NEAR} stopOpacity="1" />
          </LinearGradient>
        </Defs>
      ) : null}
      <Ellipse cx={width * 0.82} cy={height * 0.12} rx={22} ry={22} fill={SUN} opacity={blend ? 0.55 : 0.9} />
      <Ellipse cx={width * 0.82} cy={height * 0.12} rx={46} ry={46} fill={SUN} opacity={0.18} />
      <Ellipse
        cx={width * 0.2}
        cy={ground - 4}
        rx={width * 0.78}
        ry={height * 0.32}
        fill={blend ? `url(#${far})` : FAR}
      />
      <Ellipse
        cx={width * 0.86}
        cy={ground + 16}
        rx={width * 0.55}
        ry={height * 0.26}
        fill={blend ? `url(#${mid})` : MID}
      />
      <Tree x={width * 0.08} y={ground + 8} h={42} />
      <Tree x={width * 0.93} y={ground + 18} h={52} />
      <Ellipse
        cx={width * 0.5}
        cy={height * 1.08}
        rx={width * 0.92}
        ry={height * 0.4}
        fill={blend ? `url(#${near})` : NEAR}
      />
    </Svg>
  );
}

function Tree({ x, y, h }: { x: number; y: number; h: number }) {
  const crown = h * 0.62;
  return (
    <>
      <Path
        d={`M ${x - 3} ${y} L ${x - 1.4} ${y - h * 0.28} L ${x + 1.6} ${y - h * 0.28} L ${x + 3.2} ${y} Z`}
        fill={TRUNK}
      />
      <Circle cx={x} cy={y - h * 0.42} r={crown * 0.42} fill={TREE} />
      <Circle cx={x - crown * 0.22} cy={y - h * 0.32} r={crown * 0.28} fill={TREE} opacity={0.92} />
      <Circle cx={x + crown * 0.24} cy={y - h * 0.3} r={crown * 0.26} fill={TREE} opacity={0.88} />
    </>
  );
}

type RiseInProps = {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/** The meadow and the pet are on screen immediately. Entrance fades were hiding them until motion resolved. */
export function RiseIn({ children, style }: RiseInProps) {
  return <View style={style}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: SKY,
    borderRadius: 28,
    overflow: 'hidden',
  },
  blend: {
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  crest: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
});
