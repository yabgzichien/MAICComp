import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, platformShadow, uiFont } from '../theme';

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

/** Persistent bottom tab bar for the borrower app. `badges` shows a count over a tab's icon —
 *  today, the number of lender offers waiting on the borrower's accept/decline.
 *
 *  `onAdd` mounts the raised centre button that opens the add-a-transaction flow. It lives here
 *  rather than on the Home feed because capture is the app's core loop and used to sit four cards
 *  down the dashboard scroll: on a phone the borrower had to scroll to reach the one action they
 *  open the app to perform. In the tab bar it is on screen from every primary tab, always. */
export function BottomNav({
  active,
  onNavigate,
  onAdd,
  badges,
}: {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  onAdd?: () => void;
  badges?: Partial<Record<NavTab, number>>;
}) {
  const insets = useSafeAreaInsets();

  const renderTab = ({ key, label }: { key: NavTab; label: string }) => {
    const on = key === active;
    // The icon stays ink3 (decoration); the label is meaningful nav text so it gets ink2 —
    // ink3 measures ~2.2-2.5:1 contrast, below what body/label text needs.
    const tint = on ? colors.accent : colors.ink3;
    const labelColor = on ? colors.accent : colors.ink2;
    const badge = badges?.[key] ?? 0;
    return (
      <Pressable
        key={key}
        onPress={() => onNavigate(key)}
        style={styles.tab}
        hitSlop={6}
        accessibilityRole="tab"
        accessibilityLabel={badge > 0 ? `${label}, ${badge} new` : label}
        accessibilityState={{ selected: on }}
      >
        <View>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            {ICONS[key](tint, key === 'home' && on ? colors.accent : 'none')}
          </Svg>
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { color: labelColor, fontFamily: uiFont(on ? 700 : 500) }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
      {TABS.slice(0, 2).map(renderTab)}
      {onAdd && (
        <View style={styles.addSlot}>
          <Pressable
            onPress={onAdd}
            style={({ pressed }) => [styles.addBtn, pressed && { transform: [{ scale: 0.94 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Add a transaction"
          >
            <Svg width={26} height={26} viewBox="0 0 24 24">
              <Line x1={12} y1={5} x2={12} y2={19} stroke={colors.onAccent} strokeWidth={2.4} strokeLinecap="round" />
              <Line x1={5} y1={12} x2={19} y2={12} stroke={colors.onAccent} strokeWidth={2.4} strokeLinecap="round" />
            </Svg>
          </Pressable>
          <Text style={[styles.label, styles.addLabel]}>Add</Text>
        </View>
      )}
      {TABS.slice(2).map(renderTab)}
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
  // The raised centre action. `marginTop` lifts the circle above the bar's top edge so it reads
  // as the one thing on the bar that does something rather than a fifth destination; the surface
  // ring keeps it legible where it overlaps the content behind.
  addSlot: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  addBtn: {
    width: 54,
    height: 54,
    borderRadius: 999,
    marginTop: -26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    ...platformShadow(colors.accent, 0.34, 14, { width: 0, height: 6 }, 6),
  },
  addLabel: { color: colors.accent, fontFamily: uiFont(700), marginTop: 1 },
  // Red count bubble pinned to the top-right of the tab icon.
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontFamily: uiFont(800), lineHeight: 12 },
});
