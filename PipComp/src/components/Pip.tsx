import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';
import { useAccent } from '../state/accent';

export type PipExpr = 'idle' | 'happy' | 'think' | 'curious';

const INK = '#15281d';

/** Multiply each RGB channel of a #rrggbb hex by `factor` (brightness shade). */
function shade(hex: string, factor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(c * factor)))
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function Eyes({ expr }: { expr: PipExpr }) {
  if (expr === 'happy') {
    return (
      <G fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round">
        <Path d="M35 55 Q40 49 45 55" />
        <Path d="M55 55 Q60 49 65 55" />
      </G>
    );
  }
  if (expr === 'think') {
    return (
      <G>
        <Circle cx={42} cy={51} r={3.6} fill={INK} />
        <Circle cx={62} cy={51} r={3.6} fill={INK} />
        <Circle cx={43.2} cy={49.8} r={1.1} fill="#fff" />
        <Circle cx={63.2} cy={49.8} r={1.1} fill="#fff" />
      </G>
    );
  }
  if (expr === 'curious') {
    return (
      <G>
        <Circle cx={40} cy={55} r={4.4} fill={INK} />
        <Circle cx={60} cy={54} r={5.2} fill={INK} />
        <Circle cx={41.6} cy={53.4} r={1.4} fill="#fff" />
        <Circle cx={61.8} cy={52.2} r={1.6} fill="#fff" />
      </G>
    );
  }
  return (
    <G>
      <Circle cx={40} cy={55} r={4.2} fill={INK} />
      <Circle cx={60} cy={55} r={4.2} fill={INK} />
      <Circle cx={41.5} cy={53.5} r={1.3} fill="#fff" />
      <Circle cx={61.5} cy={53.5} r={1.3} fill="#fff" />
    </G>
  );
}

function Mouth({ expr }: { expr: PipExpr }) {
  if (expr === 'happy') return <Path d="M41 64 Q50 75 59 64 Q50 69 41 64 Z" fill={INK} />;
  if (expr === 'think') return <Circle cx={50} cy={67} r={2.6} fill={INK} />;
  if (expr === 'curious')
    return <Path d="M45 66 Q50 71 55 66" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />;
  return <Path d="M43 64 Q50 71 57 64" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />;
}

export function Pip({
  size = 96,
  expr = 'idle',
  color,
  float = false,
}: {
  size?: number;
  expr?: PipExpr;
  color?: string;
  float?: boolean;
}) {
  const theme = useAccent();
  const fill = color ?? theme.accent;
  const ty = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!float) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ty, {
          toValue: -5,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ty, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float, ty]);

  return (
    <Animated.View style={{ transform: [{ translateY: ty }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* shadow */}
        <Ellipse cx={50} cy={92} rx={22} ry={4.5} fill="rgba(16,40,28,0.12)" />

        {/* sprout */}
        <Path d="M50 26 C50 18 50 14 50 12" stroke={shade(fill, 0.7)} strokeWidth={3.2} fill="none" strokeLinecap="round" />
        <Ellipse cx={42} cy={15} rx={7.5} ry={4.2} fill={shade(fill, 0.82)} rotation={-32} originX={42} originY={15} />
        <Ellipse cx={58} cy={13} rx={8.5} ry={4.6} fill={shade(fill, 0.9)} rotation={28} originX={58} originY={13} />

        {/* body */}
        <Circle cx={50} cy={56} r={33} fill={fill} />
        <Circle cx={50} cy={56} r={33} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth={2} />
        {/* top highlight */}
        <Ellipse cx={40} cy={42} rx={16} ry={11} fill="rgba(255,255,255,0.22)" />
        {/* cheeks */}
        <Circle cx={33} cy={63} r={5} fill="rgba(255,255,255,0.18)" />
        <Circle cx={67} cy={63} r={5} fill="rgba(255,255,255,0.18)" />

        <Eyes expr={expr} />
        <Mouth expr={expr} />
      </Svg>
    </Animated.View>
  );
}
