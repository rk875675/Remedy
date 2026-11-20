import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticSelection } from '../../../lib/haptics';
import { useAfterTransition } from '../../../lib/useAfterTransition';
import { useReduceMotion } from '../../../lib/useReduceMotion';
import { Icon } from './Icon';
import { ob } from './tokens';

type Zone = 'upper' | 'lower';

type BackMapProps = {
  upper: boolean;
  lower: boolean;
  onToggle: (zone: Zone) => void;
  height?: number;
};

const BACK = require('../../../assets/onboarding/illo-back.png');

/** Cropped illo-back.png, head to just below the glutes (373x748). */
const BACK_IMAGE_ASPECT = 373 / 748;

/**
 * Fractions of the cropped image, measured on illo-back.png (373x748).
 * Shirt (upper back through the waist) runs about y 0.32-0.73. Pants and
 * glutes start at 0.73. Zones stay on the torso, not the sleeves or the seat.
 * Upper: shoulder blades to the bottom of the ribs. Lower: lumbar to the
 * waistband, stopping at the top of the glutes.
 */
const ZONES = {
  upper: { x: 0.28, y: 0.33, w: 0.44, h: 0.22, label: 'Upper back' },
  lower: { x: 0.27, y: 0.56, w: 0.46, h: 0.15, label: 'Lower back' },
};

/** Side room for "Upper back" / "Lower back" chips, including the check. */
const GUTTER = 112;
const PAD = 12;

const CLAY = ob.color.clay;
const CLAY_LINE = 'rgba(174,86,54,0.55)';
const CLAY_FILL = 'rgba(174,86,54,0.26)';

function imageAspect(): number {
  if (Platform.OS === 'web') return BACK_IMAGE_ASPECT;
  const resolved = Image.resolveAssetSource(BACK);
  if (resolved && resolved.width > 0 && resolved.height > 0) {
    return resolved.width / resolved.height;
  }
  return BACK_IMAGE_ASPECT;
}

/**
 * Back-view illustration with two tappable bands. The overlay percentages
 * are of the image box, and the box matches the asset's aspect ratio.
 */
export function BackMap({ upper, lower, onToggle, height = 300 }: BackMapProps) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const pulse = useRef(new Animated.Value(1)).current;
  const [cardW, setCardW] = useState(0);
  const aspect = imageAspect();
  const width = cardW > 0 ? cardW : 327;
  const maxImgH = Math.max(140, height - PAD * 2);
  const maxImgW = Math.max(96, width - GUTTER * 2);
  const imgW = Math.min(maxImgH * aspect, maxImgW);
  const imgH = imgW / aspect;
  const cardH = imgH + PAD * 2;
  const imgLeft = (width - imgW) / 2;
  const imgTop = PAD;
  const selected = upper || lower;

  useEffect(() => {
    if (!selected || reduce !== false || !ready) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 900,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [selected, reduce, ready, pulse]);

  function toggle(zone: Zone) {
    hapticSelection();
    onToggle(zone);
  }

  return (
    <View style={[styles.card, { height: cardH }]} onLayout={(event) => setCardW(event.nativeEvent.layout.width)}>
      <View style={{ position: 'absolute', left: imgLeft, top: imgTop, width: imgW, height: imgH }}>
        <Image source={BACK} resizeMode="contain" style={{ width: imgW, height: imgH }} accessibilityIgnoresInvertColors />
        <ZoneHit
          zone="upper"
          box={ZONES.upper}
          imgW={imgW}
          imgH={imgH}
          selected={upper}
          pulse={pulse}
          onPress={() => toggle('upper')}
        />
        <ZoneHit
          zone="lower"
          box={ZONES.lower}
          imgW={imgW}
          imgH={imgH}
          selected={lower}
          pulse={pulse}
          onPress={() => toggle('lower')}
        />
      </View>
      <Chip
        label={ZONES.lower.label}
        selected={lower}
        side="left"
        top={chipTop(ZONES.lower, imgTop, imgH, cardH)}
        gutter={imgLeft}
        onPress={() => toggle('lower')}
      />
      <Chip
        label={ZONES.upper.label}
        selected={upper}
        side="right"
        top={chipTop(ZONES.upper, imgTop, imgH, cardH)}
        gutter={width - (imgLeft + imgW)}
        onPress={() => toggle('upper')}
      />
    </View>
  );
}

function chipTop(
  box: { y: number; h: number },
  imgTop: number,
  imgH: number,
  cardH: number,
): number {
  const center = imgTop + (box.y + box.h / 2) * imgH;
  return Math.max(6, Math.min(cardH - 50, center - 22));
}

function ZoneHit({
  zone,
  box,
  imgW,
  imgH,
  selected,
  pulse,
  onPress,
}: {
  zone: Zone;
  box: { x: number; y: number; w: number; h: number; label: string };
  imgW: number;
  imgH: number;
  selected: boolean;
  pulse: Animated.Value;
  onPress: () => void;
}) {
  const visualH = box.h * imgH;
  const extra = Math.max(0, (44 - visualH) / 2);
  return (
    <Pressable
      testID={zone === 'upper' ? 'zone-upper' : 'zone-lower'}
      accessibilityRole="checkbox"
      accessibilityLabel={box.label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      hitSlop={{ top: extra, bottom: extra, left: 6, right: 6 }}
      style={{
        position: 'absolute',
        left: box.x * imgW,
        top: box.y * imgH,
        width: box.w * imgW,
        height: visualH,
        borderRadius: 18,
        borderWidth: selected ? 2 : 1.5,
        borderStyle: selected ? 'solid' : 'dashed',
        borderColor: selected ? CLAY : CLAY_LINE,
        alignItems: 'flex-end',
        overflow: 'hidden',
      }}
    >
      {selected ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: CLAY_FILL, opacity: pulse, borderRadius: 18 }]}
        />
      ) : null}
      {selected ? (
        <View style={styles.check}>
          <Icon name="checkmark" size={12} color={ob.color.surface} />
        </View>
      ) : null}
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  side,
  top,
  gutter,
  onPress,
}: {
  label: string;
  selected: boolean;
  side: 'left' | 'right';
  top: number;
  gutter: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chipHit,
        { top, maxWidth: Math.max(88, gutter - 6) },
        side === 'right' ? { right: 6, alignItems: 'flex-end' } : { left: 6, alignItems: 'flex-start' },
      ]}
    >
      <View style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}>
        {selected ? <Icon name="checkmark" size={12} color={ob.color.surface} /> : null}
        <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextOn]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: ob.color.surface,
    borderRadius: ob.radius.card,
    borderWidth: 1.5,
    borderColor: ob.color.line,
    overflow: 'hidden',
  },
  check: {
    margin: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CLAY,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  chipHit: {
    position: 'absolute',
    minHeight: 44,
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1.5,
  },
  chipOff: {
    backgroundColor: ob.color.surface,
    borderColor: ob.color.line,
  },
  chipOn: {
    backgroundColor: CLAY,
    borderColor: CLAY,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: ob.color.ink,
  },
  chipTextOn: {
    color: ob.color.surface,
  },
});
