// Judge guided tour  spotlight anchor (Judge Tour spec, 2026-07-12). Enhancement, never a
// dependency: a step whose anchorId doesn't match anything currently mounted still shows
// the card on its own. Scoped simplification vs. the spec's "dimmed screen + measured
// cutout": a highlight ring around the anchored element, which needs no layout measurement
// and works identically across RN and RN-web.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, platformShadow, radius } from '../theme';

export function TourAnchor({ id, activeId, children }: { id: string; activeId: string | null; children: React.ReactNode }) {
  if (id !== activeId) return <>{children}</>;
  return <View style={styles.ring}>{children}</View>;
}

const styles = StyleSheet.create({
  ring: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    ...platformShadow(colors.accent, 0.35, 8, { width: 0, height: 0 }, 0),
  },
});
