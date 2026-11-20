import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { ObGlyph } from './glyphs';

/**
 * Flat color stickers, built the way Fluent Emoji Color is built
 * (microsoft/fluentui-emoji): a few solid shapes, no outline, no fake light.
 * The objects are Remedy's, not copies of that set.
 */
const GREEN = '#5EAE4E';
const LEAF = '#8FBF9A';
const CLAY = '#E07A5F';
const YOLK = '#F0C14B';
const SAND = '#F6C9A8';
const SKY = '#5BA3E8';
const INK = '#2C2824';
const WHITE = '#FFFFFF';
const PINK = '#F27B8A';
const GREY = '#C5CDD6';

function Art({ children }: { children: ReactNode }) {
  return (
    <Svg width={34} height={34} viewBox="0 0 32 32">
      {children}
    </Svg>
  );
}

function Face({
  hair,
  mood,
  mark,
}: {
  hair: string;
  mood: 'flat' | 'frown';
  mark?: ReactNode;
}) {
  const mouth = mood === 'frown' ? 'M12.6 22.2c1.4-1.5 5.4-1.5 6.8 0' : 'M13.2 21.6h5.6';
  return (
    <Art>
      <Circle cx={16} cy={18} r={9.4} fill={SAND} />
      <Path
        d="M7.2 17.2C7.6 10 11 6.6 16 6.6s8.4 3.4 8.8 10.6c-1.8-2.6-4-3.2-6-2.2-1.2-2.6-2.6-3.6-2.8-3.6s-1.6 1-2.8 3.6c-2-1-4.2-.4-6 2.2z"
        fill={hair}
      />
      <Circle cx={12.7} cy={17.6} r={1.25} fill={INK} />
      <Circle cx={19.3} cy={17.6} r={1.25} fill={INK} />
      <Ellipse cx={10.4} cy={20.2} rx={1.7} ry={1} fill={PINK} />
      <Ellipse cx={21.6} cy={20.2} rx={1.7} ry={1} fill={PINK} />
      <Path d={mouth} stroke={PINK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      {mark}
    </Art>
  );
}

function Broccoli() {
  return (
    <Art>
      <Path d="M14.2 18.2h3.6c.3 2.2.2 4.6.2 6.4 0 1.1-.8 1.8-2 1.8s-2-.7-2-1.8c0-1.8-.1-4.2.2-6.4z" fill={LEAF} />
      <Circle cx={10.2} cy={15.2} r={4.6} fill={GREEN} />
      <Circle cx={16.2} cy={11.4} r={5.2} fill={LEAF} />
      <Circle cx={21.6} cy={15.6} r={4.2} fill={GREEN} />
      <Circle cx={15.2} cy={16.8} r={4.4} fill={GREEN} />
      <Circle cx={12.4} cy={12.6} r={3.2} fill={LEAF} />
    </Art>
  );
}

function LowBattery() {
  return (
    <Art>
      <Rect x={12} y={3.2} width={8} height={3} rx={1.2} fill={GREEN} />
      <Rect x={6.4} y={6} width={19.2} height={22} rx={4.4} fill={GREEN} />
      <Rect x={9} y={8.6} width={14} height={16.8} rx={2.4} fill={WHITE} />
      <Rect x={11} y={18.4} width={10} height={4.8} rx={1.6} fill={CLAY} />
    </Art>
  );
}

function Shoe() {
  return (
    <Art>
      <Path
        d="M7 20.8C7 15.2 10.8 12.2 15.6 13.4C19.4 11.8 23.4 13.4 25.8 17C26.6 18.4 26.2 20.8 24.6 20.8Z"
        fill={SKY}
      />
      <Path d="M18.2 15.6C20.2 16.4 22.2 17.6 23.8 19C24.2 19.5 24 20.2 23.2 20.2H18C18.2 18.6 18.2 17 18.2 15.6Z" fill={SAND} />
      <Rect x={4} y={19.2} width={24} height={6} rx={2.8} fill={WHITE} />
      <Circle cx={11.6} cy={16.6} r={1.5} fill={WHITE} />
      <Circle cx={14.8} cy={15.6} r={1.5} fill={WHITE} />
    </Art>
  );
}

function Stomach() {
  return (
    <Art>
      <Path
        d="M18.4 5.6c-6.2 1-9 5.2-8 10 1 5.2 3.8 7.4 7.4 8.4 5 1.2 8.2-.4 8.2-4.8 0-2.8-2-3.8-4-3.8 2.8-.8 4.8-2.8 4-5.8-.8-3-3.6-4.8-7.6-4z"
        fill={PINK}
      />
      <Path d="M13.2 15.6c2.6 2.2 6 2.2 8.4 0" stroke={WHITE} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </Art>
  );
}

function Heart() {
  return (
    <Art>
      <Path
        d="M16 26.8C16 26.8 6.2 20.4 6.2 13.6 6.2 10 8.8 7.4 12.2 7.4c1.8 0 3.2.9 3.8 2.2.6-1.3 2-2.2 3.8-2.2 3.4 0 6 2.6 6 6.2 0 6.8-9.8 13.2-9.8 13.2z"
        fill={PINK}
      />
    </Art>
  );
}

function Sun() {
  return (
    <Art>
      <Circle cx={16} cy={16} r={5.4} fill={YOLK} />
      <Rect x={14.9} y={2.2} width={2.2} height={4.4} rx={1.1} fill={YOLK} />
      <Rect x={14.9} y={25.4} width={2.2} height={4.4} rx={1.1} fill={YOLK} />
      <Rect x={2.2} y={14.9} width={4.4} height={2.2} rx={1.1} fill={YOLK} />
      <Rect x={25.4} y={14.9} width={4.4} height={2.2} rx={1.1} fill={YOLK} />
      <Rect x={5.2} y={5.6} width={4.2} height={2.2} rx={1.1} fill={YOLK} transform="rotate(-45 7.3 6.7)" />
      <Rect x={22.6} y={5.6} width={4.2} height={2.2} rx={1.1} fill={YOLK} transform="rotate(45 24.7 6.7)" />
      <Rect x={5.2} y={24.2} width={4.2} height={2.2} rx={1.1} fill={YOLK} transform="rotate(45 7.3 25.3)" />
      <Rect x={22.6} y={24.2} width={4.2} height={2.2} rx={1.1} fill={YOLK} transform="rotate(-45 24.7 25.3)" />
    </Art>
  );
}

function Kettlebell() {
  return (
    <Art>
      <Path
        fillRule="evenodd"
        d="M11.2 11V8.8C11.2 6.2 13.2 4.4 16 4.4s4.8 1.8 4.8 4.4V11H23.2c1.4 0 2.4 1.1 2.4 2.4v9.1c0 3.3-4 5.5-9.6 5.5s-9.6-2.2-9.6-5.5v-9.1c0-1.3 1-2.4 2.4-2.4H11.2zm2.2 0V9c0-1.4 1.1-2.4 2.6-2.4s2.6 1 2.6 2.4V11h-5.2z"
        fill={CLAY}
      />
      <Path d="M16 15.6 19.4 21.2h-6.8z" fill={GREEN} />
    </Art>
  );
}

/** Rear view. No face, so the pink mark is the only thing that changes. */
function BackFigure({ pain, travel = false }: { pain: ReactNode; travel?: boolean }) {
  return (
    <Art>
      <Circle cx={16} cy={4.8} r={2.8} fill={SAND} />
      <Rect x={6.4} y={9.4} width={19.2} height={12.2} rx={5} fill={SAND} />
      {travel ? (
        <>
          <Rect x={11} y={20} width={4} height={9.4} rx={2} fill={SAND} />
          <Rect x={17.4} y={20} width={3.6} height={4.8} rx={1.8} fill={SAND} />
        </>
      ) : (
        <>
          <Rect x={11} y={20.2} width={3.8} height={6.2} rx={1.9} fill={SAND} />
          <Rect x={17.2} y={20.2} width={3.8} height={6.2} rx={1.9} fill={SAND} />
        </>
      )}
      <G>{pain}</G>
    </Art>
  );
}

/** Flat stickers. One object, two or three colors, readable at 32px. */
export function draw(name: ObGlyph): ReactNode {
  switch (name) {
    case 'gym':
      return <Kettlebell />;
    case 'band':
      return (
        <Art>
          <Ellipse cx={16} cy={16} rx={8.4} ry={10.4} stroke={GREEN} strokeWidth={5.4} fill="none" />
        </Art>
      );
    case 'mat':
      return (
        <Art>
          <Rect x={5} y={8.5} width={22} height={15} rx={3.2} fill={GREEN} />
          <Rect x={8} y={12} width={16} height={2.4} rx={1.2} fill={LEAF} />
          <Rect x={8} y={17} width={16} height={2.4} rx={1.2} fill={LEAF} />
        </Art>
      );
    case 'spot':
      return <BackFigure pain={<Circle cx={16} cy={15.4} r={2.6} fill={PINK} />} />;
    case 'side':
      return <BackFigure pain={<Circle cx={10.6} cy={15.4} r={2.6} fill={PINK} />} />;
    case 'wander':
      return (
        <BackFigure
          pain={
            <>
              <Circle cx={11.2} cy={12.2} r={1.65} fill={PINK} />
              <Circle cx={20.2} cy={14.8} r={1.65} fill={PINK} />
              <Circle cx={14.6} cy={18.2} r={1.65} fill={PINK} />
            </>
          }
        />
      );
    case 'downLeg':
      return (
        <BackFigure
          travel
          pain={
            <>
              <Circle cx={13} cy={17.6} r={1.9} fill={PINK} />
              <Circle cx={13} cy={23.2} r={1.55} fill={PINK} />
              <Circle cx={13} cy={27.4} r={1.25} fill={PINK} />
            </>
          }
        />
      );
    case 'shrug':
      return (
        <Art>
          <Path
            d="M11.6 13.2c.6-3.6 3.2-5.8 6.4-5.8 3.8 0 6.4 2.4 6.4 5.6 0 4.2-6.4 4.8-6.4 8.6"
            stroke={YOLK}
            strokeWidth={3.4}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={17.8} cy={25.6} r={2} fill={YOLK} />
        </Art>
      );
    case 'fresh':
      return <Broccoli />;
    case 'early':
      return (
        <Art>
          <Rect x={6} y={6.5} width={20} height={19} rx={4} fill={WHITE} />
          <Path d="M6 11.2V10.4A4 4 0 0 1 10 6.5h12a4 4 0 0 1 4 3.9v.8H6z" fill={YOLK} />
          <Rect x={10} y={4.4} width={2.2} height={4.2} rx={1} fill={CLAY} />
          <Rect x={19.8} y={4.4} width={2.2} height={4.2} rx={1} fill={CLAY} />
          <Circle cx={11.4} cy={17.2} r={1.55} fill={GREEN} />
          <Circle cx={16} cy={17.2} r={1.55} fill={GREEN} />
          <Circle cx={20.6} cy={17.2} r={1.55} fill={LEAF} />
        </Art>
      );
    case 'months':
      return (
        <Art>
          <Path
            d="M8.4 4.8h15.2l-1.4 2.4c-2 3.2-3.8 5.4-6.2 7.2 2.4 1.8 4.2 4 6.2 7.2l1.4 2.4H8.4l1.4-2.4c2-3.2 3.8-5.4 6.2-7.2-2.4-1.8-4.2-4-6.2-7.2L8.4 4.8z"
            fill={CLAY}
          />
          <Path d="M12.2 21.2c1-1.6 2.2-2.6 3.8-2.6s2.8 1 3.8 2.6V25H12.2v-3.8z" fill={YOLK} />
        </Art>
      );
    case 'years':
      return (
        <Art>
          <Rect x={7.5} y={4.6} width={17} height={6.2} rx={2.2} fill={LEAF} />
          <Rect x={5.5} y={12.6} width={21} height={6.2} rx={2.2} fill={GREEN} />
          <Rect x={3.6} y={20.6} width={24.8} height={6.6} rx={2.2} fill={CLAY} />
        </Art>
      );
    case 'ages':
      return (
        <Art>
          <Circle cx={16} cy={16} r={10} fill={GREEN} />
          <Circle cx={16} cy={16} r={7.1} fill={WHITE} />
          <Rect x={15.1} y={10.6} width={1.8} height={6.2} rx={0.9} fill={CLAY} />
          <Rect x={15.1} y={15.1} width={5.2} height={1.8} rx={0.9} fill={CLAY} />
          <Circle cx={16} cy={16} r={1.15} fill={CLAY} />
        </Art>
      );
    case 'crash':
      return (
        <Art>
          <Rect x={3} y={12.4} width={26} height={7.2} rx={3.6} fill={SAND} transform="rotate(-18 16 16)" />
          <Rect x={12.4} y={12.4} width={7.2} height={7.2} fill={WHITE} transform="rotate(-18 16 16)" />
          <Circle cx={8.6} cy={15.2} r={0.7} fill={CLAY} transform="rotate(-18 16 16)" />
          <Circle cx={23.2} cy={16.6} r={0.7} fill={CLAY} transform="rotate(-18 16 16)" />
        </Art>
      );
    case 'lift':
      return (
        <Art>
          <Rect x={8} y={16} width={16} height={11} rx={2.4} fill={CLAY} />
          <Path d="M16 3.6 21.2 10.2h-3.2V16h-4V10.2H10.8z" fill={GREEN} />
        </Art>
      );
    case 'stitch':
      return (
        <Art>
          <Rect x={4.5} y={7.5} width={23} height={17} rx={5} fill={WHITE} />
          <Path d="M16 9.5v13" stroke={SKY} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M10.5 16h3.4M14.3 16h3.4M18.1 16h3.4" stroke={GREEN} strokeWidth={2.6} strokeLinecap="round" />
        </Art>
      );
    case 'belly':
      return (
        <Art>
          <Path d="M6.4 22.2C7 13.8 10.8 8 16 8s9 5.8 9.6 14.2c-1 3.4-4.6 5.2-9.6 5.2s-8.6-1.8-9.6-5.2z" fill={SAND} />
          <Path d="M0 2.1C0 .3 3 .3 3 2.1 3 4.4 0 6.2 0 6.2S-3 4.4-3 2.1C-3 .3 0 .3 0 2.1z" fill={PINK} transform="translate(22.2 9.4)" />
        </Art>
      );
    case 'slope':
      return (
        <Art>
          <Path d="M3.5 25.2C8 22.4 11.2 16 16.4 12.2 20 9.4 23.6 8.4 28.5 8.4V26H3.5z" fill={GREEN} />
          <Circle cx={24.6} cy={8.2} r={2.3} fill={YOLK} />
          <Circle cx={10} cy={20.2} r={1.15} fill={LEAF} />
          <Circle cx={15.2} cy={15.6} r={1.15} fill={LEAF} />
          <Circle cx={20.2} cy={12.2} r={1.15} fill={LEAF} />
        </Art>
      );
    case 'burst':
      return (
        <Art>
          <Path
            d="M16 3.2 17.8 9.6l6.6-1.4-3.8 5.6 5.8 3.4-6.6 1.2.8 6.8L16 20.6l-4.6 4.6.8-6.8-6.6-1.2 5.8-3.4L7.6 8.2l6.6 1.4z"
            fill={YOLK}
          />
          <Circle cx={16} cy={15.6} r={3.1} fill={CLAY} />
        </Art>
      );
    case 'stiff':
      return (
        <Art>
          <Rect x={12.4} y={3.6} width={7.2} height={5} rx={2} fill={GREEN} />
          <Rect x={12.4} y={10} width={7.2} height={5} rx={2} fill={GREEN} />
          <Rect x={12.4} y={16.4} width={7.2} height={5} rx={2} fill={GREEN} />
          <Rect x={12.4} y={22.8} width={7.2} height={5} rx={2} fill={GREEN} />
          <Rect x={7.4} y={14.4} width={17.2} height={3.2} rx={1.6} fill={LEAF} />
        </Art>
      );
    case 'weak':
      return <LowBattery />;
    case 'wobble':
      return (
        <Art>
          <Circle cx={18} cy={11} r={6.2} fill={SKY} />
          <Rect x={3.5} y={20.4} width={25} height={5.6} rx={2.6} fill={GREEN} transform="rotate(-12 16 23.2)" />
        </Art>
      );
    case 'uneven':
      return (
        <Art>
          <Path d="M14.2 23.6h3.6L16 27.2z" fill={YOLK} />
          <Rect x={3.4} y={13.2} width={25.2} height={3.6} rx={1.8} fill={GREEN} transform="rotate(-14 16 15)" />
          <Circle cx={8.2} cy={11.2} r={3.3} fill={CLAY} />
          <Circle cx={23.4} cy={18.6} r={3.3} fill={LEAF} />
        </Art>
      );
    case 'alert':
      return (
        <Face
          hair={GREY}
          mood="frown"
          mark={<Path d="M24.6 3.4 21 8.8h2.5l-1 4.6 4.8-6.4h-2.7z" fill={PINK} />}
        />
      );
    case 'brace':
      return (
        <Art>
          <Rect x={8} y={6} width={16} height={20} rx={7} fill={SAND} />
          <Rect x={6.4} y={14} width={19.2} height={3.6} rx={1.8} fill={GREEN} />
          <Rect x={14.2} y={11.8} width={3.6} height={8} rx={1.6} fill={LEAF} />
        </Art>
      );
    case 'stethoscope':
      return (
        <Art>
          <Path d="M9 6.4v6.2a5.2 5.2 0 0 0 10.4 0V6.4" stroke={SKY} strokeWidth={3.2} strokeLinecap="round" fill="none" />
          <Circle cx={9} cy={6.2} r={2.15} fill={SKY} />
          <Circle cx={19.4} cy={6.2} r={2.15} fill={SKY} />
          <Path d="M14.2 17.8c2.2 1.2 4 2.2 6.4 2.2" stroke={SKY} strokeWidth={3.2} strokeLinecap="round" fill="none" />
          <Circle cx={23.4} cy={22.2} r={4.1} fill={GREEN} />
          <Circle cx={23.4} cy={22.2} r={1.55} fill={WHITE} />
        </Art>
      );
    case 'reps':
      return (
        <Art>
          <Path d="M20 10A8.2 8.2 0 1 1 16 7.4" stroke={GREEN} strokeWidth={4.4} strokeLinecap="round" fill="none" />
          <Path d="M14.4 4h7.4L17.4 10.6z" fill={LEAF} />
        </Art>
      );
    case 'palms':
      return (
        <Art>
          <Circle cx={6.2} cy={16.6} r={3.6} fill={CLAY} />
          <Rect x={8} y={9.2} width={8.4} height={15.2} rx={4.2} fill={CLAY} />
          <Circle cx={25.8} cy={16.6} r={3.6} fill={SAND} />
          <Rect x={15.6} y={9.2} width={8.4} height={15.2} rx={4.2} fill={SAND} />
        </Art>
      );
    case 'rub':
      return (
        <Art>
          <G transform="rotate(-16 10 17)">
            <Circle cx={6} cy={16.4} r={3.4} fill={SAND} />
            <Rect x={7.4} y={9.4} width={8} height={14.4} rx={4} fill={SAND} />
          </G>
          <G transform="rotate(16 22 17)">
            <Circle cx={26} cy={16.4} r={3.4} fill={CLAY} />
            <Rect x={16.6} y={9.4} width={8} height={14.4} rx={4} fill={CLAY} />
          </G>
        </Art>
      );
    case 'pin':
      return (
        <Art>
          <Path d="M14.2 23.2h3.6L16 28z" fill={GREEN} />
          <Rect x={14.5} y={8.4} width={3} height={15.2} rx={1.5} fill={GREEN} />
          <Circle cx={16} cy={6.8} r={3.8} fill={YOLK} />
          <Circle cx={16} cy={16.2} r={1.25} fill={CLAY} />
        </Art>
      );
    case 'pill':
      return (
        <Art>
          <G transform="rotate(-28 16 16)">
            <Rect x={3.4} y={11} width={25.2} height={10} rx={5} fill={SKY} />
            <Rect x={3.4} y={11} width={12.6} height={10} rx={5} fill={GREEN} />
          </G>
        </Art>
      );
    case 'screen':
      return (
        <Art>
          <Rect x={9} y={3} width={14} height={25} rx={3.2} fill={SKY} />
          <Rect x={11} y={6} width={10} height={14.2} rx={1.4} fill={WHITE} />
          <Path d="M14.2 9.6 19.4 13l-5.2 3.4z" fill={GREEN} />
          <Circle cx={16} cy={24.2} r={1.2} fill={WHITE} />
        </Art>
      );
    case 'rest':
      return (
        <Art>
          <Circle cx={24.2} cy={8.2} r={3.1} fill={YOLK} />
          <Rect x={4} y={13.2} width={4} height={11} rx={1.6} fill={GREEN} />
          <Rect x={6.2} y={17.2} width={20.4} height={6.2} rx={2} fill={LEAF} />
          <Rect x={14.4} y={17.6} width={11.2} height={5.4} rx={1.6} fill={GREEN} />
          <Rect x={7.2} y={14} width={8.2} height={5.2} rx={2.2} fill={WHITE} />
        </Art>
      );
    case 'nerve':
      return (
        <Art>
          <Path d="M16 4.2v9.6L8.2 26.4" stroke={YOLK} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M16 13.8 23.8 26.4" stroke={YOLK} strokeWidth={4.6} strokeLinecap="round" fill="none" />
          <Circle cx={16} cy={13.6} r={2.2} fill={CLAY} />
        </Art>
      );
    case 'disc':
      return (
        <Art>
          <Ellipse cx={14} cy={7.6} rx={7} ry={3.4} fill={SKY} />
          <Ellipse cx={18.2} cy={16} rx={8.2} ry={3.8} fill={CLAY} />
          <Ellipse cx={14} cy={24.4} rx={7} ry={3.4} fill={GREEN} />
        </Art>
      );
    case 'joint':
      return (
        <Art>
          <Rect x={2.2} y={13.2} width={9.2} height={5.6} rx={2.8} fill={GREEN} />
          <Circle cx={10.6} cy={16} r={4} fill={GREEN} />
          <Rect x={20.6} y={13.2} width={9.2} height={5.6} rx={2.8} fill={CLAY} />
          <Circle cx={21.4} cy={16} r={4} fill={CLAY} />
          <Ellipse cx={16} cy={16} rx={1.7} ry={2.7} fill={YOLK} />
        </Art>
      );
    case 'narrow':
      return (
        <Art>
          <Ellipse cx={16} cy={6} rx={8.6} ry={3.2} fill={CLAY} />
          <Ellipse cx={16} cy={12.4} rx={5.6} ry={2.6} fill={CLAY} />
          <Ellipse cx={16} cy={18.4} rx={3.2} ry={2.2} fill={YOLK} />
          <Ellipse cx={16} cy={25.2} rx={8.2} ry={3.2} fill={CLAY} />
        </Art>
      );
    case 'curve':
      return (
        <Art>
          <Ellipse cx={20.2} cy={6.2} rx={6.2} ry={3} fill={GREEN} />
          <Ellipse cx={11.8} cy={12.6} rx={6.2} ry={3} fill={LEAF} />
          <Ellipse cx={20.4} cy={19.2} rx={6.2} ry={3} fill={GREEN} />
          <Ellipse cx={12} cy={25.6} rx={6} ry={2.8} fill={LEAF} />
        </Art>
      );
    case 'sparks':
      return (
        <Art>
          <Path d="M0-5 1.4-1.5 5.2-1.5 2.2.8 3.3 4.6 0 2.3-3.3 4.6-2.2.8-5.2-1.5-1.4-1.5z" fill={YOLK} transform="translate(10 18)" />
          <Path d="M0-4 1.1-1.2 4.1-1.2 1.7.6 2.6 3.6 0 1.8-2.6 3.6-1.7.6-4.1-1.2-1.1-1.2z" fill={CLAY} transform="translate(22 9)" />
          <Path d="M0-3.2.9-1 3.3-1 1.4.5 2.1 2.9 0 1.5-2.1 2.9-1.4.5-3.3-1-.9-1z" fill={GREEN} transform="translate(22 22)" />
        </Art>
      );
    case 'bone':
      return (
        <Art>
          <Rect x={9} y={13.6} width={14} height={4.8} rx={2} fill={SAND} />
          <Circle cx={8.2} cy={13.2} r={3.3} fill={CLAY} />
          <Circle cx={8.2} cy={18.8} r={3.3} fill={CLAY} />
          <Circle cx={23.8} cy={13.2} r={3.3} fill={CLAY} />
          <Circle cx={23.8} cy={18.8} r={3.3} fill={CLAY} />
        </Art>
      );
    case 'wrap':
      return (
        <Art>
          <Ellipse cx={13} cy={16} rx={7.2} ry={7.2} fill={WHITE} />
          <Rect x={16.4} y={14.2} width={10} height={3.6} rx={1.8} fill={SAND} />
          <Circle cx={13} cy={16} r={2.8} fill={CLAY} />
        </Art>
      );
    case 'heart':
      return <Heart />;
    case 'bump':
      return <Stomach />;
    case 'thigh':
      return (
        <Art>
          <Rect x={9.5} y={4.5} width={13} height={14.5} rx={6.5} fill={CLAY} />
          <Ellipse cx={16} cy={18.2} rx={6.2} ry={3.3} fill={SAND} />
        </Art>
      );
    case 'shin':
      return (
        <Art>
          <Ellipse cx={16} cy={8} rx={5.2} ry={3} fill={LEAF} />
          <Path d="M12.2 8.2h7.6c1 4 1.8 8 1.2 12.2-.4 2.2-2 3.8-5 3.8s-4.6-1.6-5-3.8c-.6-4.2.2-8.2 1.2-12.2z" fill={GREEN} />
        </Art>
      );
    case 'foot':
      return <Shoe />;
    case 'trail':
      return (
        <Art>
          <Ellipse cx={11} cy={13} rx={3.1} ry={4.2} fill={GREEN} transform="rotate(-22 11 13)" />
          <Circle cx={8.2} cy={8} r={1.15} fill={GREEN} />
          <Circle cx={10.8} cy={6.8} r={1.15} fill={GREEN} />
          <Circle cx={13.2} cy={8.2} r={1.15} fill={GREEN} />
          <Ellipse cx={21.2} cy={22.2} rx={2.8} ry={3.8} fill={LEAF} transform="rotate(-22 21.2 22.2)" />
          <Circle cx={18.8} cy={17.8} r={1.05} fill={LEAF} />
          <Circle cx={21.2} cy={16.8} r={1.05} fill={LEAF} />
          <Circle cx={23.4} cy={18} r={1.05} fill={LEAF} />
        </Art>
      );
    case 'steps':
      return (
        <Art>
          <Rect x={3.2} y={20} width={11} height={7.2} rx={2} fill={CLAY} />
          <Rect x={10.6} y={13} width={11} height={7.2} rx={2} fill={YOLK} />
          <Rect x={18} y={6} width={11} height={7.2} rx={2} fill={GREEN} />
        </Art>
      );
    case 'spin':
      return (
        <Art>
          <Path d="M19.2 8.4a8 8 0 1 0 1.8 5.8" stroke={YOLK} strokeWidth={4} strokeLinecap="round" fill="none" />
          <Path d="M18.2 3.2 23.2 9.2h-10z" fill={GREEN} />
        </Art>
      );
    case 'reach':
      return (
        <Art>
          <Rect x={6} y={4.6} width={20} height={5.2} rx={2} fill={SKY} />
          <Path d="M16 10.2 21.6 16.6h-3.4V27h-4.4V16.6H10.4z" fill={GREEN} />
        </Art>
      );
    case 'moon':
      return (
        <Art>
          <Path d="M20.2 5.2a9.2 9.2 0 1 0 4.6 16.6A8.4 8.4 0 1 1 20.2 5.2z" fill={SKY} />
        </Art>
      );
    case 'dumbbell':
      return (
        <Art>
          <Circle cx={7.2} cy={16} r={4.6} fill={GREEN} />
          <Circle cx={24.8} cy={16} r={4.6} fill={GREEN} />
          <Rect x={7.2} y={14.2} width={17.6} height={3.6} rx={1.8} fill={CLAY} />
        </Art>
      );
    case 'sun':
      return <Sun />;
    case 'highSun':
      return (
        <Art>
          <Rect x={3.5} y={21.5} width={25} height={4.2} rx={2} fill={SAND} />
          <Circle cx={16} cy={12.2} r={5.2} fill={YOLK} />
          <Rect x={14.9} y={3.2} width={2.2} height={3.6} rx={1.1} fill={YOLK} />
          <Rect x={6.2} y={8.4} width={3.6} height={2.2} rx={1.1} fill={YOLK} transform="rotate(-40 8 9.5)" />
          <Rect x={22.2} y={8.4} width={3.6} height={2.2} rx={1.1} fill={YOLK} transform="rotate(40 24 9.5)" />
        </Art>
      );
    case 'night':
      return (
        <Art>
          <Path d="M19.4 6.2a8.4 8.4 0 1 0 4.2 15.2A7.6 7.6 0 1 1 19.4 6.2z" fill={SKY} />
          <Path d="M8.2 7.2 9.2 9.4l2.4.4-1.8 1.5.6 2.3-2-1.2-2 1.2.6-2.3-1.8-1.5 2.4-.4z" fill={YOLK} />
        </Art>
      );
    case 'balance':
      return (
        <Art>
          <Rect x={15} y={5.2} width={2} height={8} rx={1} fill={GREEN} />
          <Rect x={5.5} y={12} width={21} height={3.2} rx={1.6} fill={GREEN} />
          <Circle cx={8.2} cy={20.2} r={3.3} fill={CLAY} />
          <Path d="M8.2 15.4v2.2" stroke={GREEN} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M23.6 16.2 26.6 22.4h-6z" fill={YOLK} />
          <Path d="M23.6 15.4v1.2" stroke={GREEN} strokeWidth={1.6} strokeLinecap="round" />
        </Art>
      );
    case 'swap':
      return (
        <Art>
          <Path d="M4 10.2h11.2V6.6L24.6 12.4 15.2 18.2v-3.6H4z" fill={GREEN} />
          <Path d="M28 20.4H16.8v3.6L7.4 18.2l9.4-5.8v3.6H28z" fill={CLAY} />
        </Art>
      );
    case 'meter':
      return (
        <Art>
          <Path d="M5 22.4a11 11 0 0 1 22 0" stroke={YOLK} strokeWidth={5} strokeLinecap="round" fill="none" />
          <Path d="M16 21.6 22.6 12" stroke={GREEN} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={16} cy={21.6} r={2.5} fill={CLAY} />
        </Art>
      );
    case 'pulse':
      return (
        <Art>
          <Path
            d="M2.8 17h5.6l2.2-6.6 3.8 11.2 2.2-4.6H29"
            stroke={PINK}
            strokeWidth={3.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Art>
      );
    case 'dice':
      return (
        <Art>
          <Rect x={6} y={6} width={20} height={20} rx={5} fill={GREEN} />
          <Circle cx={11.2} cy={11.2} r={1.55} fill={WHITE} />
          <Circle cx={20.8} cy={11.2} r={1.55} fill={WHITE} />
          <Circle cx={16} cy={16} r={1.55} fill={WHITE} />
          <Circle cx={11.2} cy={20.8} r={1.55} fill={WHITE} />
          <Circle cx={20.8} cy={20.8} r={1.55} fill={WHITE} />
        </Art>
      );
  }
}
