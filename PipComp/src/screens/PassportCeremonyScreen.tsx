// src/screens/PassportCeremonyScreen.tsx
// The pre-mint consent ceremony (Brief I). Purely presentational: the rows come
// from consentScopes' tier0ScopeRows/tier1ScopeRows over the same draft the
// confirm will sign, so the screen cannot drift from the minted payload.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../components/Icon';
import { Card, TopBar } from '../components/ui';
import type { ConsentScopeRow } from '../lib/consentScopes';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { colors, platformShadow, uiFont } from '../theme';

function GuardLine({ text }: { text: string }) {
  const theme = useAccent();
  return (
    <View style={styles.guardRow}>
      <Icon name="check" size={14} color={theme.accent} />
      <Text style={[styles.guardText, { color: theme.accentInk }]}>{text}</Text>
    </View>
  );
}

function ScopeRows({ rows, dimmed = false }: { rows: ConsentScopeRow[]; dimmed?: boolean }) {
  const colorTheme = useThemeColors();
  return (
    <View style={dimmed ? { opacity: 0.4 } : undefined}>
      {rows.map((row, i) => (
        <View key={row.key} style={[styles.row, i > 0 && [styles.rowDivider, { borderTopColor: colorTheme.line }]]}>
          <Text style={[styles.rowLabel, { color: colorTheme.ink2 }]}>{row.label}</Text>
          <Text style={[styles.rowDetail, { color: colorTheme.ink }]}>{row.detail}</Text>
        </View>
      ))}
    </View>
  );
}

export function PassportCeremonyScreen({
  tier0,
  tier1,
  tier2,
  tier3,
  includeIdentity,
  onToggleIdentity,
  includeSpending,
  onToggleSpending,
  includeMonitoring,
  onToggleMonitoring,
  onConfirm,
  onBack,
  minting,
  error,
}: {
  tier0: ConsentScopeRow[];
  tier1: ConsentScopeRow[];
  tier2: ConsentScopeRow[];
  /** Present only when the ceremony is minting against an active loan (Brief S). */
  tier3: ConsentScopeRow | null;
  includeIdentity: boolean;
  onToggleIdentity: (on: boolean) => void;
  includeSpending: boolean;
  onToggleSpending: (on: boolean) => void;
  includeMonitoring: boolean;
  onToggleMonitoring: (on: boolean) => void;
  onConfirm: () => void;
  onBack: () => void;
  minting: boolean;
  error: string | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { tourActive } = useAppData();
  const hasIdentity = tier1.length > 0;
  const hasSpending = tier2.length > 0;
  const hasMonitoring = tier3 !== null;

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Credit Passport" onBack={onBack} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + (tourActive ? 250 : 30) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <Svg width={20} height={23} viewBox="0 0 14 16" fill="none">
            <Path
              d="M7 1L1.5 4v5.2C1.5 12.8 3.9 15.2 7 16c3.1-.8 5.5-3.2 5.5-6.8V4L7 1z"
              fill={theme.accentSoft}
              stroke={theme.accent}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            <Path d="M4.5 8.5l2 2 3-3.5" stroke={theme.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={[styles.heading, { color: colorTheme.ink }]}>Review before you mint</Text>
        </View>
        <Text style={[styles.lede, { color: colorTheme.ink2 }]}>
          Nothing has left your phone yet. Minting creates a signed passport carrying exactly the fields below. Confirm
          to generate it, or go back and nothing is created.
        </Text>

        <View style={[styles.guardCard, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
          <GuardLine text="Aggregates only, never your raw transactions." />
          <GuardLine text="Sharing happens only when you show or send the code." />
        </View>

        <Card style={styles.tierCard}>
          <View style={styles.tierHeader}>
            <Text style={[styles.tierEyebrow, { color: colorTheme.ink2 }]}>Tier 0 · Credit aggregates</Text>
            <View style={[styles.requiredChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              <Text style={[styles.requiredText, { color: colorTheme.ink2 }]}>Always carried</Text>
            </View>
          </View>
          <ScopeRows rows={tier0} />
        </Card>

        {hasIdentity && (
          <Card style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={[styles.tierEyebrow, { color: colorTheme.ink2 }]}>Tier 1 · Identity & occupation</Text>
              <Pressable
                onPress={() => onToggleIdentity(!includeIdentity)}
                accessibilityRole="switch"
                accessibilityState={{ checked: includeIdentity }}
                aria-checked={includeIdentity}
                accessibilityLabel="Include verified identity and occupation"
                hitSlop={8}
                style={[styles.switchTrack, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, includeIdentity && styles.switchTrackOn, includeIdentity && { backgroundColor: theme.accent, borderColor: theme.accent }]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>
            <ScopeRows rows={tier1} dimmed={!includeIdentity} />
            <Text style={[styles.identityNote, { color: colorTheme.ink2 }]}>
              {includeIdentity
                ? 'Included so a lender can bind this passport to you. Occupation is self-declared. Toggle off to mint without your identity.'
                : 'Excluded. This passport will carry anonymous aggregates bound only to your device key.'}
            </Text>
          </Card>
        )}

        {hasSpending && (
          <Card style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={[styles.tierEyebrow, { color: colorTheme.ink2 }]}>Tier 2 · Spending behaviour</Text>
              <Pressable
                onPress={() => onToggleSpending(!includeSpending)}
                accessibilityRole="switch"
                accessibilityState={{ checked: includeSpending }}
                aria-checked={includeSpending}
                accessibilityLabel="Include spending-behaviour profile"
                hitSlop={8}
                style={[styles.switchTrack, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, includeSpending && styles.switchTrackOn, includeSpending && { backgroundColor: theme.accent, borderColor: theme.accent }]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>
            <ScopeRows rows={tier2} dimmed={!includeSpending} />
            <Text style={[styles.identityNote, { color: colorTheme.ink2 }]}>
              {includeSpending
                ? 'The most detailed tier. Your spending mix and the recurring obligations behind your debt-service figure. Short-lived grant; toggle off to keep it private.'
                : 'Excluded. The lender sees your debt-service total but not the itemised spending behind it.'}
            </Text>
          </Card>
        )}

        {hasMonitoring && tier3 && (
          <Card style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={[styles.tierEyebrow, { color: colorTheme.ink2 }]}>Tier 3 · Ongoing monitoring</Text>
              <Pressable
                onPress={() => onToggleMonitoring(!includeMonitoring)}
                accessibilityRole="switch"
                accessibilityState={{ checked: includeMonitoring }}
                aria-checked={includeMonitoring}
                accessibilityLabel="Include ongoing monitoring"
                hitSlop={8}
                style={[styles.switchTrack, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, includeMonitoring && styles.switchTrackOn, includeMonitoring && { backgroundColor: theme.accent, borderColor: theme.accent }]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>
            <ScopeRows rows={[tier3]} dimmed={!includeMonitoring} />
            <Text style={[styles.identityNote, { color: colorTheme.ink2 }]}>
              {includeMonitoring
                ? 'Lets the lender ask for a fresh check-in while your loan is active. You choose when to share one. Toggle off to skip ongoing monitoring.'
                : 'Excluded. The lender only sees this passport, never a check-in, unless you regenerate with this on.'}
            </Text>
          </Card>
        )}

        {error && (
          <View style={[styles.errorCard, { backgroundColor: colorTheme.surface, borderColor: colorTheme.red }]}>
            <Icon name="alert" size={18} color={colorTheme.red} />
            <Text style={[styles.errorText, { color: colorTheme.red }]}>{error}</Text>
          </View>
        )}

        <Pressable onPress={onConfirm} disabled={minting} style={[styles.confirmBtn, { backgroundColor: theme.accentInk }, minting && { opacity: 0.7 }]}>
          {minting ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.confirmText}>I consent, mint my passport</Text>
          )}
        </Pressable>
        <Pressable onPress={onBack} disabled={minting} hitSlop={6} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colorTheme.ink2 }]}>Cancel. Nothing is generated</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  heading: { fontFamily: uiFont(800), fontSize: 20 },
  lede: { fontFamily: uiFont(500), fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 14 },

  guardCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginBottom: 14,
  },
  guardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guardText: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, lineHeight: 17 },

  tierCard: { padding: 16, marginBottom: 14 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tierEyebrow: {
    fontFamily: uiFont(700),
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  requiredChip: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  requiredText: { fontFamily: uiFont(600), fontSize: 11 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  rowDivider: { borderTopWidth: 1 },
  rowLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, lineHeight: 17 },
  rowDetail: { flex: 1.3, fontFamily: uiFont(600), fontSize: 12.5, lineHeight: 17, textAlign: 'right' },

  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  switchTrackOn: { alignItems: 'flex-end' },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#fff',
    ...platformShadow('#102018', 0.15, 3, { width: 0, height: 1 }, 2),
  },
  identityNote: { fontFamily: uiFont(500), fontSize: 11.5, lineHeight: 16, marginTop: 10 },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, lineHeight: 17 },

  confirmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 999,
    marginTop: 4,
  },
  confirmText: { fontFamily: uiFont(700), fontSize: 15, color: colors.onAccent },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontFamily: uiFont(600), fontSize: 12.5 },
});
