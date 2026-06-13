import React from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../theme';

export interface PieSlice {
  value: number;
  color: string;
}

/** Donut chart drawn with stroke-dash arcs (react-native-svg). */
export function PieChart({ data, size = 210, thickness = 34 }: { data: PieSlice[]; size?: number; thickness?: number }) {
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;

  if (total <= 0) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r} fill="none" stroke={colors.line} strokeWidth={thickness} />
      </Svg>
    );
  }

  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${cx}, ${cx}`}>
        {data.map((d, i) => {
          const len = (d.value / total) * C;
          const el = (
            <Circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </G>
    </Svg>
  );
}
