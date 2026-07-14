import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BAND_ORDER, bandColors, colors, numFont, uiFont } from '../theme';
import type { CreditBand } from '../lib/creditScore';

const SEGMENTS = BAND_ORDER.map((b) => bandColors[b]);

/** Five-segment band bar (Building→Excellent); the active band is highlighted. */
export function ScoreBandBar({
  band,
  showLabels = true,
  height = 6,
}: {
  band: CreditBand;
  showLabels?: boolean;
  height?: number;
}) {
  const activeIdx = BAND_ORDER.indexOf(band);
  return (
    <View>
      <View style={[styles.bar, { height }]}>
        {SEGMENTS.map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: c, opacity: i === activeIdx ? 1 : 0.28, borderRadius: 2 }} />
        ))}
      </View>
      {showLabels && (
        <View style={styles.labels}>
          {BAND_ORDER.map((b, i) => (
            <Text
              key={b}
              style={[styles.label, { color: i === activeIdx ? colors.accentInk : colors.ink3, fontFamily: uiFont(i === activeIdx ? 700 : 400) }]}
              numberOfLines={1}
            >
              {b}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** Small up/down arrow + "+N pts" delta chip (green up on dark/light surfaces). */
export function ScoreDelta({ delta, color = colors.deltaUp }: { delta: number; color?: string }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <View style={styles.deltaRow}>
      <Svg width={11} height={11} viewBox="0 0 12 12" fill="none">
        <Path
          d={up ? 'M6 10V2M6 2L3 5M6 2L9 5' : 'M6 2v8M6 10l-3-3M6 10l3-3'}
          stroke={color}
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={[styles.deltaText, { color }]}>
        {up ? '+' : ''}
        {delta} pts
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 4, overflow: 'hidden', flexDirection: 'row', gap: 2 },
  labels: { flexDirection: 'row', marginTop: 5 },
  label: { fontSize: 11, flex: 1, textAlign: 'center' },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deltaText: { fontFamily: numFont(700), fontSize: 11 },
});
