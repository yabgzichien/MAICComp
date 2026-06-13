import React from 'react';
import Svg, { Circle, Line, Path, Rect, G } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Monoline icon set ported from the design (icons.jsx). Stroked glyphs on a
 * 24x24 grid; a few use solid fills (play, dots, sparkles, wallet dot).
 */
export type IconName =
  | 'fuel' | 'cart' | 'utensils' | 'car' | 'coffee' | 'bag' | 'heart' | 'receipt' | 'play' | 'dots'
  | 'camera' | 'image' | 'plus' | 'check' | 'sparkles' | 'x' | 'chevronRight' | 'chevronLeft'
  | 'chevronDown' | 'scan' | 'trending' | 'clock' | 'arrowRight' | 'search' | 'gallery' | 'wallet'
  | 'trash' | 'sliders' | 'gear' | 'alert' | 'pencil' | 'gift' | 'return' | 'percent'
  | 'home' | 'scale';

type RenderFn = (stroke: string, sw: number) => React.ReactNode;

const ICONS: Record<IconName, RenderFn> = {
  fuel: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={4} y={3} width={9} height={18} rx={1.6} />
      <Line x1={3} y1={21} x2={14} y2={21} />
      <Rect x={6.2} y={6} width={4.6} height={3.6} rx={1} />
      <Path d="M13 8h2.6a1.6 1.6 0 011.6 1.6V16a1.5 1.5 0 003 0V9.3L17.6 6.6" />
    </G>
  ),
  cart: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={9} cy={20} r={1.4} />
      <Circle cx={17} cy={20} r={1.4} />
      <Path d="M2.5 4H5l2.1 10.7a1.5 1.5 0 001.5 1.2h7.6a1.5 1.5 0 001.5-1.1L20.5 7.5H6" />
    </G>
  ),
  utensils: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M6 3v4a2 2 0 002 2 2 2 0 002-2V3" />
      <Path d="M8 9v12" />
      <Path d="M17 3c-1.6 1.6-1.6 6.4 0 8v10" />
    </G>
  ),
  car: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 11l1.8-4a2 2 0 011.9-1.2h6.6A2 2 0 0117.2 7L19 11" />
      <Rect x={3} y={11} width={18} height={6} rx={2} />
      <Circle cx={7.5} cy={17.5} r={1.5} />
      <Circle cx={16.5} cy={17.5} r={1.5} />
    </G>
  ),
  coffee: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 9h11v5.5a4 4 0 01-4 4H9a4 4 0 01-4-4V9z" />
      <Path d="M16 10.5h1.8a2.4 2.4 0 010 4.8H16" />
      <Path d="M8.5 3v2.2M11.5 3v2.2" />
    </G>
  ),
  bag: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M6.2 8h11.6l-1 11a2 2 0 01-2 1.8H9.2A2 2 0 017.2 19L6.2 8z" />
      <Path d="M9 8V6.2a3 3 0 016 0V8" />
    </G>
  ),
  heart: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 20.5S4 15 4 9.2A3.8 3.8 0 0112 7a3.8 3.8 0 018 2.2C20 15 12 20.5 12 20.5z" />
      <Path d="M7.5 11.5h2l1.3-2.4 1.8 4 1.2-1.6h2.7" />
    </G>
  ),
  receipt: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5.5 3h13v18l-2.4-1.4-2.3 1.4-2.3-1.4-2.3 1.4L5.5 21V3z" />
      <Path d="M9 8h6M9 12h6" />
    </G>
  ),
  play: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M10 8.3l5.4 3.7L10 15.7V8.3z" fill={s} stroke="none" />
    </G>
  ),
  dots: (s) => (
    <G fill={s} stroke="none">
      <Circle cx={6} cy={12} r={1.7} />
      <Circle cx={12} cy={12} r={1.7} />
      <Circle cx={18} cy={12} r={1.7} />
    </G>
  ),
  camera: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M3 8.5A2 2 0 015 6.5h2L8.3 4.3a1 1 0 01.85-.5h5.7a1 1 0 01.85.5L17 6.5h2a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2V8.5z" />
      <Circle cx={12} cy={12.5} r={3.5} />
    </G>
  ),
  image: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={4} width={18} height={16} rx={2.6} />
      <Circle cx={8.5} cy={9.5} r={1.7} />
      <Path d="M4 18.5l5-4.6 3.4 2.7 3-2.7 4.6 4.2" />
    </G>
  ),
  plus: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 5v14M5 12h14" />
    </G>
  ),
  check: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 12.5l4.4 4.4L19 7" />
    </G>
  ),
  sparkles: (s) => (
    <G fill={s} stroke="none">
      <Path d="M12 3.6c.6 4.2 1 4.7 5.4 5.4-4.4.7-4.8 1.2-5.4 5.4-.6-4.2-1-4.7-5.4-5.4 4.4-.7 4.8-1.2 5.4-5.4z" />
      <Path d="M18 14.5c.3 1.8.5 2 2.3 2.3-1.8.3-2 .5-2.3 2.3-.3-1.8-.5-2-2.3-2.3 1.8-.3 2-.5 2.3-2.3z" />
    </G>
  ),
  x: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M6 6l12 12M18 6L6 18" />
    </G>
  ),
  chevronRight: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M9 5l7 7-7 7" />
    </G>
  ),
  chevronLeft: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M15 5l-7 7 7 7" />
    </G>
  ),
  chevronDown: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 9l7 7 7-7" />
    </G>
  ),
  scan: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 8.5V6a2 2 0 012-2h2.5M15.5 4H18a2 2 0 012 2v2.5M20 15.5V18a2 2 0 01-2 2h-2.5M8.5 20H6a2 2 0 01-2-2v-2.5" />
      <Path d="M4 12h16" />
    </G>
  ),
  trending: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M3 17l6-6 4 4 7-7" />
      <Path d="M16.5 8H21v4.5" />
    </G>
  ),
  clock: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={12} cy={12} r={8.2} />
      <Path d="M12 7.5v5l3.2 2" />
    </G>
  ),
  arrowRight: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M5 12h13M12.5 6l6 6-6 6" />
    </G>
  ),
  search: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={11} cy={11} r={6} />
      <Path d="M19.5 19.5L16 16" />
    </G>
  ),
  gallery: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={3} width={18} height={18} rx={3} />
      <Circle cx={9} cy={9} r={2} />
      <Path d="M4 17l4.5-4 4 3.2 3-2.7L20 17" />
    </G>
  ),
  wallet: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={3} y={6} width={18} height={13} rx={3} />
      <Path d="M3 10.5h18" />
      <Circle cx={16.5} cy={14.8} r={1.2} fill={s} stroke="none" />
    </G>
  ),
  trash: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 7h16" />
      <Path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
      <Path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
      <Path d="M10 11v6M14 11v6" />
    </G>
  ),
  sliders: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 7h9M17 7h3" />
      <Circle cx={14.5} cy={7} r={2} />
      <Path d="M4 17h3M11 17h9" />
      <Circle cx={8.5} cy={17} r={2} />
    </G>
  ),
  gear: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </G>
  ),
  alert: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 4L21.5 19.5H2.5L12 4z" />
      <Path d="M12 10v4.2" />
      <Path d="M12 17.4v.01" />
    </G>
  ),
  pencil: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 20h4L18.5 9.5a2 2 0 000-2.8l-1.2-1.2a2 2 0 00-2.8 0L4 16v4z" />
      <Path d="M13.5 6.5l4 4" />
    </G>
  ),
  gift: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Rect x={4} y={10} width={16} height={10} rx={1.5} />
      <Rect x={3} y={7} width={18} height={3.5} rx={1} />
      <Path d="M12 7v13" />
      <Path d="M12 7S10.5 3.5 8.5 4.2 8 7 12 7z" />
      <Path d="M12 7s1.5-3.5 3.5-2.8S16 7 12 7z" />
    </G>
  ),
  return: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M9 7L5 11l4 4" />
      <Path d="M5 11h9a5 5 0 015 5v2" />
    </G>
  ),
  percent: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M19 5L5 19" />
      <Circle cx={7.5} cy={7.5} r={2.5} />
      <Circle cx={16.5} cy={16.5} r={2.5} />
    </G>
  ),
  home: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M4 11l8-6 8 6" />
      <Path d="M6 10v9h12v-9" />
      <Path d="M10 19v-5h4v5" />
    </G>
  ),
  scale: (s, w) => (
    <G fill="none" stroke={s} strokeWidth={w}>
      <Path d="M12 4v16" />
      <Path d="M6 7h12" />
      <Path d="M6 7l-3 6a3 3 0 006 0z" />
      <Path d="M18 7l-3 6a3 3 0 006 0z" />
      <Path d="M8 20h8" />
    </G>
  ),
};

export function Icon({
  name,
  size = 22,
  stroke = 1.8,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const render = ICONS[name] ?? ICONS.dots;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {render(color, stroke)}
    </Svg>
  );
}
