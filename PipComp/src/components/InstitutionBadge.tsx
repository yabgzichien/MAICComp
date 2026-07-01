// src/components/InstitutionBadge.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Institution } from '../lib/institutions';
import { uiFont } from '../theme';

/** A brand-toned monogram badge for a recognized bank/e-wallet — fallback to a neutral "?" tile when unrecognized. */
export function InstitutionBadge({ inst, fallbackText, size = 36 }: { inst: Institution | null; fallbackText?: string | null; size?: number }) {
  const text = inst?.monogram ?? (fallbackText ? fallbackText.trim().slice(0, 3).toUpperCase() : '?');
  const bg = inst?.color ?? '#9aa7a0';
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg }]}>
      <Text style={[styles.text, { fontSize: Math.max(8, size * 0.26) }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, flexShrink: 0 },
  text: { fontFamily: uiFont(800), color: '#fff' },
});
