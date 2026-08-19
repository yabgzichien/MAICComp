import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { catColorsForHue } from '../lib/catColors';
import { fmt } from '../lib/format';
import type { Category, CategorySuggestion } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { colors, numFont, platformShadow, radius, shadowCard, uiFont } from '../theme';
import { Icon, type IconName } from './Icon';
import { Pip, type PipExpr } from './Pip';

/* ── text helpers ── */

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: any }) {
  const colorTheme = useThemeColors();
  return <Text style={[styles.eyebrow, { color: colorTheme.ink2 }, style]}>{children}</Text>;
}

export function Amount({
  value,
  size = 17,
  weight = 700,
  color,
  cur = true,
}: {
  value: number;
  size?: number;
  weight?: number;
  color?: string;
  cur?: boolean;
}) {
  const colorTheme = useThemeColors();
  color = color ?? colorTheme.ink;
  return (
    <Text style={{ fontFamily: numFont(weight), fontSize: size, color }}>
      {cur && (
        <Text style={{ fontFamily: numFont(600), fontSize: size * 0.66, color, opacity: 0.55 }}>RM </Text>
      )}
      {fmt(value)}
    </Text>
  );
}

/* ── surfaces ── */

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, style]}>
      {children}
    </View>
  );
}

/* ── category visuals ── */

export function CatBadge({
  category,
  size = 38,
  rad = 11,
}: {
  category: Category;
  size?: number;
  rad?: number;
}) {
  const col = catColorsForHue(category.hue);
  const isCustomImage = category.icon && (
    category.icon.startsWith('data:') ||
    category.icon.startsWith('file:') ||
    category.icon.startsWith('content:') ||
    category.icon.startsWith('http') ||
    category.icon.startsWith('/')
  );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rad,
        backgroundColor: col.bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {isCustomImage ? (
        <Image source={{ uri: category.icon }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Icon name={category.icon as IconName} size={size * 0.52} color={col.fg} stroke={1.9} />
      )}
    </View>
  );
}

export function CategoryChip({
  category,
  selected,
  suggested,
  onPress,
}: {
  category: Category;
  selected: boolean;
  suggested: false | CategorySuggestion['source'];
  onPress: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
        selected && { borderColor: theme.accent, backgroundColor: theme.accentTint },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={category.label}
      accessibilityState={{ selected }}
    >
      <CatBadge category={category} size={34} rad={10} />
      <Text style={[styles.chipLabel, { color: colorTheme.ink }]} numberOfLines={1}>
        {category.label}
      </Text>
      {suggested && !selected && (
        <View style={[styles.learnedTag, { backgroundColor: theme.accentSoft }]}>
          <Icon name="sparkles" size={11} color={theme.accentInk} />
          <Text style={[styles.learnedTagText, { color: theme.onTint }]}>{suggested === 'guess' ? 'AI guess' : 'learned'}</Text>
        </View>
      )}
      {selected && (
        <View style={[styles.checkCircle, { backgroundColor: theme.accent }]}>
          <Icon name="check" size={13} color="#fff" stroke={2.6} />
        </View>
      )}
    </Pressable>
  );
}

/* ── Pip speech ── */

export function Bubble({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.bubble, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, style]}>
      {children}
    </View>
  );
}

/** Standard body text inside a bubble (use <B> for emphasis). */
export function BubbleText({ children }: { children: React.ReactNode }) {
  const colorTheme = useThemeColors();
  return <Text style={[styles.bubbleText, { color: colorTheme.ink }]}>{children}</Text>;
}

export function B({ children }: { children: React.ReactNode }) {
  const colorTheme = useThemeColors();
  return <Text style={[styles.bold, { color: colorTheme.ink }]}>{children}</Text>;
}

export function PipSays({
  expr = 'idle',
  size = 52,
  children,
}: {
  expr?: PipExpr;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
      <View style={{ width: size, alignItems: 'center' }}>
        <Pip size={size} expr={expr} />
      </View>
      <Bubble style={{ flex: 1 }}>{children}</Bubble>
    </View>
  );
}

/* ── buttons / bars ── */

export function IconButton({
  name,
  onPress,
  size = 20,
  color,
  accessibilityLabel,
}: {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  /** Icon-only buttons have no visible text, so screen readers need this to announce anything. */
  accessibilityLabel?: string;
}) {
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: colorTheme.surface }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
    >
      <Icon name={name} size={size} color={color ?? colorTheme.ink} />
    </Pressable>
  );
}

export function PrimaryButton({
  onPress,
  disabled,
  children,
  height = 54,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  height?: number;
}) {
  const theme = useAccent();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btnPrimary,
        {
          backgroundColor: theme.accentInk,
          ...platformShadow(theme.accent, 0.4, 12, { width: 0, height: 6 }, 4),
          height,
          opacity: disabled ? 0.4 : pressed ? 0.94 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.btnRow}>{children}</View>
    </Pressable>
  );
}

export function BtnLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.btnLabel}>{children}</Text>;
}

export function TopBar({
  title,
  onBack,
  onClose,
  right,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: React.ReactNode;
}) {
  const colorTheme = useThemeColors();
  return (
    <View style={styles.topbar}>
      {onBack && <IconButton name="chevronLeft" onPress={onBack} accessibilityLabel="Go back" />}
      <Text style={[styles.topbarTitle, { color: colorTheme.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {right}
      {onClose && <IconButton name="x" onPress={onClose} size={19} accessibilityLabel="Close" />}
    </View>
  );
}

export function ProgressTrack({ pct, height = 7 }: { pct: number; height?: number }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.track, { height, backgroundColor: colorTheme.line }]}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 999, backgroundColor: theme.accent }} />
    </View>
  );
}

export type ValueMode = 'amount' | 'percent';

/** Small RM / % segmented toggle. */
export function ValueToggle({ mode, onChange }: { mode: ValueMode; onChange: (m: ValueMode) => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.vt, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {(['amount', 'percent'] as ValueMode[]).map((m) => {
        const on = mode === m;
        return (
          <Pressable key={m} onPress={() => onChange(m)} style={[styles.vtBtn, on && { backgroundColor: theme.accentInk }]}>
            <Text style={[styles.vtText, { color: colorTheme.ink2 }, on && styles.vtTextOn]}>{m === 'amount' ? 'RM' : '%'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  vt: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1 },
  vtBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  // ink3 is decoration-only (~2.2-2.5:1 contrast); these carry meaning (the unselected
  // toggle option, section labels) so they get ink2.
  vtText: { fontFamily: uiFont(700), fontSize: 12.5 },
  vtTextOn: { color: '#fff' },
  eyebrow: {
    fontFamily: uiFont(700),
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bold: { fontFamily: uiFont(700) },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    ...shadowCard,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  chipLabel: { fontFamily: uiFont(600), fontSize: 14.5, flex: 1 },
  learnedTag: {
    position: 'absolute',
    top: -8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  learnedTagText: { fontFamily: uiFont(700), fontSize: 11 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    borderWidth: 1,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...shadowCard,
  },
  bubbleText: { fontFamily: uiFont(500), fontSize: 15.5, lineHeight: 21 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  pressed: { transform: [{ scale: 0.92 }] },
  btnPrimary: {
    borderRadius: 999,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  btnLabel: { fontFamily: uiFont(600), fontSize: 16, color: colors.onAccent },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
  },
  topbarTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 18 },
  track: { borderRadius: 999, overflow: 'hidden', width: '100%' },
});
