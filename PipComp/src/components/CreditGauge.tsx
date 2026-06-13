import React from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { bandColors } from '../theme';
import { useEased } from './Motion';
import type { CreditBand } from '../lib/creditScore';

const SCORE_MIN = 300;
const SCORE_MAX = 900;

// Design geometry (viewBox is fixed; the SVG scales to `size`).
const W = 312;
const H = 186;
const CX = 156;
const CY = 164;
const R = 124;
const SW = 16;

const BANDS: { f1: number; f2: number; color: string }[] = [
  { f1: 0.003, f2: 0.331, color: bandColors.Building },
  { f1: 0.335, f2: 0.498, color: bandColors.Fair },
  { f1: 0.503, f2: 0.664, color: bandColors.Good },
  { f1: 0.669, f2: 0.83, color: bandColors.Strong },
  { f1: 0.835, f2: 0.997, color: bandColors.Excellent },
];

function toXY(f: number) {
  const rad = ((180 - f * 180) * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

function arcD(f1: number, f2: number) {
  const a = toXY(f1);
  const b = toXY(f2);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${R} ${R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/**
 * Large semicircular credit gauge (300–900) ported from the approved redesign:
 * a five-band arc with the achieved bands at full opacity, a needle, a centre
 * score + band pill, and an indicator dot riding the arc.
 */
export function CreditGauge({
  score,
  band,
  size = 300,
  animate = true,
}: {
  score: number;
  band: CreditBand;
  size?: number;
  animate?: boolean;
}) {
  // Sweep the needle + count the score up on mount; everything moving reads off `shown`.
  const eased = useEased(score);
  const shown = animate ? eased : score;
  const display = Math.round(shown);
  const p = Math.max(0.01, Math.min(0.99, (shown - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
  const ind = toXY(p);
  const activeIdx = BANDS.findIndex((b) => p >= b.f1 && p <= b.f2);

  // Needle tip just inside the arc inner edge.
  const nr = R - SW / 2 - 4;
  const ang = ((180 - p * 180) * Math.PI) / 180;
  const nEnd = { x: CX + nr * Math.cos(ang), y: CY - nr * Math.sin(ang) };

  return (
    <Svg width={size} height={(size * H) / W} viewBox={`0 0 ${W} ${H}`}>
      {/* Background track */}
      <Path d={arcD(0, 1)} stroke="rgba(20,40,30,0.08)" strokeWidth={SW} fill="none" />

      {/* Band segments — achieved at full opacity, future dimmed */}
      {BANDS.map((b, i) => (
        <Path
          key={i}
          d={arcD(b.f1, b.f2)}
          stroke={b.color}
          strokeWidth={i === activeIdx ? SW + 3 : SW}
          fill="none"
          opacity={i <= activeIdx ? 1 : 0.13}
        />
      ))}

      {/* Needle */}
      <Line x1={CX} y1={CY} x2={nEnd.x.toFixed(1)} y2={nEnd.y.toFixed(1)} stroke="#145c3d" strokeWidth={2.8} strokeLinecap="round" />

      {/* Centre pivot */}
      <Circle cx={CX} cy={CY} r={10} fill="#1a6647" />
      <Circle cx={CX} cy={CY} r={5.5} fill="white" />

      {/* Score */}
      <SvgText x={CX} y={CY - 36} textAnchor="middle" fontFamily="SpaceGrotesk_700Bold" fontSize={58} fill="#16201b">
        {display}
      </SvgText>

      {/* Band pill */}
      <G>
        <Rect x={CX - 30} y={CY - 27} width={60} height={20} rx={10} fill="#dbece5" />
        <SvgText x={CX} y={CY - 12.5} textAnchor="middle" fontFamily="HankenGrotesk_700Bold" fontSize={12} fill="#1c6b48">
          {band}
        </SvgText>
      </G>

      {/* Indicator dot */}
      <Circle cx={ind.x.toFixed(1)} cy={ind.y.toFixed(1)} r={11} fill="white" />
      <Circle cx={ind.x.toFixed(1)} cy={ind.y.toFixed(1)} r={5.5} fill="#1f8a5b" />

      {/* Range labels */}
      <SvgText x={CX - R + 8} y={CY + 18} textAnchor="middle" fontFamily="SpaceGrotesk_500Medium" fontSize={11} fill="rgba(20,40,30,0.32)">
        {SCORE_MIN}
      </SvgText>
      <SvgText x={CX + R - 8} y={CY + 18} textAnchor="middle" fontFamily="SpaceGrotesk_500Medium" fontSize={11} fill="rgba(20,40,30,0.32)">
        {SCORE_MAX}
      </SvgText>
    </Svg>
  );
}
