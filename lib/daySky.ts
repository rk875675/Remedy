import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

export type DaySky = {
  top: string;
  mid: string;
  low: string;
  farA: string;
  farB: string;
  midA: string;
  midB: string;
  sun: string;
  sunGlow: string;
  /** 0 hides the sun. */
  sunOn: number;
  /** 0 hides the moon. */
  moonOn: number;
  /** Across the width, 0 left to 1 right. */
  sunX: number;
  /** Down the sky above the hill, 0 high to 1 at the ground line. */
  sunY: number;
  cloud: number;
  /** Header type on the sky. */
  ink: 'dark' | 'light';
};

type Frame = {
  at: number;
  top: string;
  mid: string;
  low: string;
  farA: string;
  farB: string;
  midA: string;
  midB: string;
  sun: string;
  sunGlow: string;
  sunOn: number;
  moonOn: number;
  sunX: number;
  sunY: number;
  cloud: number;
};

const NIGHT: Omit<Frame, 'at' | 'sunX' | 'sunY'> = {
  top: '#1A2740',
  mid: '#24344C',
  low: '#2C4158',
  farA: '#314A5C',
  farB: '#2A4254',
  midA: '#3A5A56',
  midB: '#34564E',
  sun: '#F4E6C8',
  sunGlow: '#F4E6C8',
  sunOn: 0,
  moonOn: 0.9,
  cloud: 0.16,
};

const FRAMES: Frame[] = [
  { at: 0, ...NIGHT, sunX: 0.15, sunY: 0.7 },
  { at: 5 * 60, ...NIGHT, top: '#1C2A42', low: '#3A3E58', sunX: 0.08, sunY: 0.78, moonOn: 0.7 },
  {
    at: 6 * 60 + 20,
    top: '#F6CDB8',
    mid: '#F3B89A',
    low: '#E7D2BE',
    farA: '#E4D0BA',
    farB: '#DCC4AE',
    midA: '#C9C4A4',
    midB: '#B7C4A8',
    sun: '#F4A24A',
    sunGlow: '#F8C98A',
    sunOn: 1,
    moonOn: 0,
    sunX: 0.14,
    sunY: 0.62,
    cloud: 0.4,
  },
  {
    at: 8 * 60,
    top: '#F8E6D4',
    mid: '#F3E2CC',
    low: '#E6E4D0',
    farA: '#E2E0C8',
    farB: '#D5DEC4',
    midA: '#C5D4B4',
    midB: '#B4C9A8',
    sun: '#F6C56A',
    sunGlow: '#F8E0A8',
    sunOn: 1,
    moonOn: 0,
    sunX: 0.32,
    sunY: 0.28,
    cloud: 0.5,
  },
  {
    at: 12 * 60,
    top: '#F6EDE0',
    mid: '#F1EEDF',
    low: '#E2EDDA',
    farA: '#D5E6D0',
    farB: '#C8DEC6',
    midA: '#AFD2AE',
    midB: '#98C39D',
    sun: '#F3D7A0',
    sunGlow: '#F6E6C0',
    sunOn: 1,
    moonOn: 0,
    sunX: 0.62,
    sunY: 0.16,
    cloud: 0.55,
  },
  {
    at: 16 * 60,
    top: '#F8E6CC',
    mid: '#F4DCC0',
    low: '#E7E0C8',
    farA: '#E0D8C0',
    farB: '#D4D4BC',
    midA: '#C4D0B0',
    midB: '#B0C4A4',
    sun: '#F6C56A',
    sunGlow: '#F8E0A0',
    sunOn: 1,
    moonOn: 0,
    sunX: 0.78,
    sunY: 0.24,
    cloud: 0.45,
  },
  {
    at: 18 * 60 + 40,
    top: '#F6C4A0',
    mid: '#F0A888',
    low: '#E8C8B0',
    farA: '#E4C8B0',
    farB: '#D8B89C',
    midA: '#C8B898',
    midB: '#C4B090',
    sun: '#F27A3A',
    sunGlow: '#F8B070',
    sunOn: 1,
    moonOn: 0,
    sunX: 0.88,
    sunY: 0.58,
    cloud: 0.35,
  },
  {
    at: 20 * 60,
    top: '#3A3E62',
    mid: '#4A4468',
    low: '#3E4A5C',
    farA: '#3A4E5C',
    farB: '#344858',
    midA: '#3A564F',
    midB: '#345448',
    sun: '#F4A24A',
    sunGlow: '#F6C98A',
    sunOn: 0,
    moonOn: 0.45,
    sunX: 0.92,
    sunY: 0.72,
    cloud: 0.2,
  },
  { at: 22 * 60, ...NIGHT, sunX: 0.2, sunY: 0.2 },
  { at: 24 * 60, ...NIGHT, sunX: 0.15, sunY: 0.7 },
];

function channel(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const from = channel(a);
  const to = channel(b);
  const parts = from.map((value, i) => Math.round(value + ((to[i] ?? value) - value) * t));
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function mixNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function luminance(hex: string): number {
  const [r, g, b] = channel(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function skyAt(now: Date): DaySky {
  const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  let index = 0;
  for (let i = 0; i < FRAMES.length - 1; i++) {
    const next = FRAMES[i + 1];
    if (next && minutes >= next.at) index = i + 1;
  }
  const from = FRAMES[index] ?? FRAMES[0];
  const to = FRAMES[index + 1] ?? from;
  if (!from || !to || from.at === to.at) {
    return paint(from ?? FRAMES[0]!);
  }
  const t = Math.min(1, Math.max(0, (minutes - from.at) / (to.at - from.at)));
  return paint({
    at: minutes,
    top: mixHex(from.top, to.top, t),
    mid: mixHex(from.mid, to.mid, t),
    low: mixHex(from.low, to.low, t),
    farA: mixHex(from.farA, to.farA, t),
    farB: mixHex(from.farB, to.farB, t),
    midA: mixHex(from.midA, to.midA, t),
    midB: mixHex(from.midB, to.midB, t),
    sun: mixHex(from.sun, to.sun, t),
    sunGlow: mixHex(from.sunGlow, to.sunGlow, t),
    sunOn: mixNum(from.sunOn, to.sunOn, t),
    moonOn: mixNum(from.moonOn, to.moonOn, t),
    sunX: mixNum(from.sunX, to.sunX, t),
    sunY: mixNum(from.sunY, to.sunY, t),
    cloud: mixNum(from.cloud, to.cloud, t),
  });
}

function paint(frame: Frame): DaySky {
  return {
    top: frame.top,
    mid: frame.mid,
    low: frame.low,
    farA: frame.farA,
    farB: frame.farB,
    midA: frame.midA,
    midB: frame.midB,
    sun: frame.sun,
    sunGlow: frame.sunGlow,
    sunOn: frame.sunOn,
    moonOn: frame.moonOn,
    sunX: frame.sunX,
    sunY: frame.sunY,
    cloud: frame.cloud,
    ink: luminance(frame.top) > 0.55 ? 'dark' : 'light',
  };
}

/** The sky for the current minute. Updates on the minute and when the app returns. */
export function useDaySky(): DaySky {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  const minute = now.getHours() * 60 + now.getMinutes();
  return useMemo(() => skyAt(now), [minute]);
}
