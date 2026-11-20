import { StyleSheet, View } from 'react-native';
import { draw } from './glyphCute';

/**
 * Cute flat stickers. Drawn in glyphCute.
 */
export const OB_GLYPHS = [
  'gym',
  'band',
  'mat',
  'spot',
  'side',
  'wander',
  'downLeg',
  'shrug',
  'fresh',
  'early',
  'months',
  'years',
  'ages',
  'crash',
  'lift',
  'stitch',
  'belly',
  'slope',
  'burst',
  'stiff',
  'weak',
  'wobble',
  'uneven',
  'alert',
  'brace',
  'stethoscope',
  'reps',
  'palms',
  'rub',
  'pin',
  'pill',
  'screen',
  'rest',
  'nerve',
  'disc',
  'joint',
  'narrow',
  'curve',
  'sparks',
  'bone',
  'wrap',
  'heart',
  'bump',
  'thigh',
  'shin',
  'foot',
  'trail',
  'steps',
  'spin',
  'reach',
  'moon',
  'dumbbell',
  'sun',
  'highSun',
  'night',
  'balance',
  'swap',
  'meter',
  'pulse',
  'dice',
] as const;

export type ObGlyph = (typeof OB_GLYPHS)[number];

const WHITE = '#FFFFFF';

const TILE: Record<ObGlyph, string> = {
  gym: '#F8E7D8',
  band: '#E5F2E8',
  mat: '#E5F2E8',
  spot: '#F6EDE0',
  side: '#F8E7D8',
  wander: '#FBF3D8',
  downLeg: '#FBE8E3',
  shrug: '#FBF3D8',
  fresh: '#E5F2E8',
  early: '#FBF3D8',
  months: '#F8E7D8',
  years: '#E5F2E8',
  ages: '#F6EDE0',
  crash: '#F8E7D8',
  lift: '#FBF3D8',
  stitch: '#E4F0F5',
  belly: '#FBE8E3',
  slope: '#E5F2E8',
  burst: '#FBF3D8',
  stiff: '#E5F2E8',
  weak: '#FBF3D8',
  wobble: '#E4F0F5',
  uneven: '#F8E7D8',
  alert: '#FBE8E3',
  brace: '#E5F2E8',
  stethoscope: '#E4F0F5',
  reps: '#E5F2E8',
  palms: '#F8E7D8',
  rub: '#FBE8E3',
  pin: '#FBF3D8',
  pill: '#E4F0F5',
  screen: '#F6EDE0',
  rest: '#E5F2E8',
  nerve: '#FBF3D8',
  disc: '#E4F0F5',
  joint: '#F6EDE0',
  narrow: '#F8E7D8',
  curve: '#E5F2E8',
  sparks: '#FBF3D8',
  bone: '#F6EDE0',
  wrap: '#F8E7D8',
  heart: '#FBE8E3',
  bump: '#FBE8E3',
  thigh: '#F8E7D8',
  shin: '#E5F2E8',
  foot: '#F6EDE0',
  trail: '#E5F2E8',
  steps: '#F8E7D8',
  spin: '#FBF3D8',
  reach: '#E4F0F5',
  moon: '#E4F0F5',
  dumbbell: '#F8E7D8',
  sun: '#FBF3D8',
  highSun: '#FBF3D8',
  night: '#E4F0F5',
  balance: '#E5F2E8',
  swap: '#E5F2E8',
  meter: '#FBF3D8',
  pulse: '#FBE8E3',
  dice: '#F6EDE0',
};

export function GlyphArt({ name }: { name: ObGlyph }) {
  return <>{draw(name)}</>;
}

export function GlyphTile({
  name,
  selected = false,
  size = 44,
}: {
  name: ObGlyph;
  selected?: boolean;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: selected ? WHITE : TILE[name],
        },
      ]}
    >
      <View style={{ transform: [{ scale: size / 44 }] }}>
        <GlyphArt name={name} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
