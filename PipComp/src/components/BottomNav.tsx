import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, uiFont } from '../theme';

export type NavTab = 'home' | 'activity' | 'loan' | 'profile';

const ICONS: Record<NavTab, (stroke: string, fill: string) => React.ReactNode> = {
  home: (stroke, fill) => (
    <Path d="M3 12L12 3l9 9v8a1 1 0 01-1 1h-5v-5H9v5H4a1 1 0 01-1-1z" fill={fill} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  ),
  activity: (stroke) => (
    <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  ),
  loan: (stroke) => (
    <>
      <Circle cx={12} cy={12} r={9} fill="none" stroke={stroke} strokeWidth={1.8} />
      <Line x1={12} y1={8} x2={12} y2={16} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={8} y1={12} x2={16} y2={12} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),
  profile: (stroke) => (
    <>
      <Circle cx={12} cy={8} r={4} fill="none" stroke={stroke} strokeWidth={1.8} />
      <Path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

const TABS: { key: NavTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'activity', label: 'Activity' },
  { key: 'loan', label: 'Loan' },
  { key: 'profile', label: 'Profile' },
];

/** Persistent bottom tab bar for the borrower app. */
export function BottomNav({ active, onNavigate }: { active: NavTab; onNavigate: (tab: NavTab) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
      {TABS.map(({ key, label }) => {
        const on = key === active;
        // The icon stays ink3 (decoration); the label is meaningful nav text so it gets ink2
        // ink3 measures ~2.2-2.5:1 contrast, below what body/label text needs.
        const tint = on ? colors.accent : colors.ink3;
        const labelColor = on ? colors.accent : colors.ink2;
        return (
          <Pressable
            key={key}
            onPress={() => onNavigate(key)}
            style={styles.tab}
            hitSlop={6}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24">
              {ICONS[key](tint, key === 'home' && on ? colors.accent : 'none')}
            </Svg>
            <Text style={[styles.label, { color: labelColor, fontFamily: uiFont(on ? 700 : 500) }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 9,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 11 },
});
