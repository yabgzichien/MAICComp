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
import { colors, uiFont } from '../theme';

function GuardLine({ text }: { text: string }) {
  return (
    <View style={styles.guardRow}>
      <Icon name="check" size={14} color={colors.accent} />
      <Text style={styles.guardText}>{text}</Text>
    </View>
  );
}

function ScopeRows({ rows, dimmed = false }: { rows: ConsentScopeRow[]; dimmed?: boolean }) {
  return (
    <View style={dimmed ? { opacity: 0.4 } : undefined}>
      {rows.map((row, i) => (
        <View key={row.key} style={[styles.row, i > 0 && styles.rowDivider]}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowDetail}>{row.detail}</Text>
        </View>
      ))}
    </View>
  );
}

export function PassportCeremonyScreen({
  tier0,
  tier1,
  tier2,
  includeIdentity,
  onToggleIdentity,
  includeSpending,
  onToggleSpending,
  onConfirm,
  onBack,
  minting,
  error,
}: {
  tier0: ConsentScopeRow[];
  tier1: ConsentScopeRow[];
  tier2: ConsentScopeRow[];
  includeIdentity: boolean;
  onToggleIdentity: (on: boolean) => void;
  includeSpending: boolean;
  onToggleSpending: (on: boolean) => void;
  onConfirm: () => void;
  onBack: () => void;
  minting: boolean;
  error: string | null;
}) {
  const insets = useSafeAreaInsets();
  const hasIdentity = tier1.length > 0;
  const hasSpending = tier2.length > 0;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Credit Passport" onBack={onBack} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <Svg width={20} height={23} viewBox="0 0 14 16" fill="none">
            <Path
              d="M7 1L1.5 4v5.2C1.5 12.8 3.9 15.2 7 16c3.1-.8 5.5-3.2 5.5-6.8V4L7 1z"
              fill={colors.accentSoft}
              stroke={colors.accent}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            <Path d="M4.5 8.5l2 2 3-3.5" stroke={colors.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={styles.heading}>Review before you mint</Text>
        </View>
        <Text style={styles.lede}>
          Nothing has left your phone yet. Minting creates a signed passport carrying exactly the fields below — confirm
          to generate it, or go back and nothing is created.
        </Text>

        <View style={styles.guardCard}>
          <GuardLine text="Aggregates only — never your raw transactions." />
          <GuardLine text="Sharing happens only when you show or send the code." />
        </View>

        <Card style={styles.tierCard}>
          <View style={styles.tierHeader}>
            <Text style={styles.tierEyebrow}>Tier 0 · Credit aggregates</Text>
            <View style={styles.requiredChip}>
              <Text style={styles.requiredText}>Always carried</Text>
            </View>
          </View>
          <ScopeRows rows={tier0} />
        </Card>

        {hasIdentity && (
          <Card style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={styles.tierEyebrow}>Tier 1 · Identity & occupation</Text>
              <Pressable
                onPress={() => onToggleIdentity(!includeIdentity)}
                accessibilityRole="switch"
                accessibilityState={{ checked: includeIdentity }}
                aria-checked={includeIdentity}
                accessibilityLabel="Include verified identity and occupation"
                hitSlop={8}
                style={[styles.switchTrack, includeIdentity && styles.switchTrackOn]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>
            <ScopeRows rows={tier1} dimmed={!includeIdentity} />
            <Text style={styles.identityNote}>
              {includeIdentity
                ? 'Included so a lender can bind this passport to you. Occupation is self-declared. Toggle off to mint without your identity.'
                : 'Excluded — this passport will carry anonymous aggregates bound only to your device key.'}
            </Text>
          </Card>
        )}

        {hasSpending && (
          <Card style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={styles.tierEyebrow}>Tier 2 · Spending behaviour</Text>
              <Pressable
                onPress={() => onToggleSpending(!includeSpending)}
                accessibilityRole="switch"
                accessibilityState={{ checked: includeSpending }}
                aria-checked={includeSpending}
                accessibilityLabel="Include spending-behaviour profile"
                hitSlop={8}
                style={[styles.switchTrack, includeSpending && styles.switchTrackOn]}
              >
                <View style={styles.switchThumb} />
              </Pressable>
            </View>
            <ScopeRows rows={tier2} dimmed={!includeSpending} />
            <Text style={styles.identityNote}>
              {includeSpending
                ? 'The most detailed tier — your spending mix and the recurring obligations behind your debt-service figure. Short-lived grant; toggle off to keep it private.'
                : 'Excluded — the lender sees your debt-service total but not the itemised spending behind it.'}
            </Text>
          </Card>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Icon name="alert" size={18} color={colors.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable onPress={onConfirm} disabled={minting} style={[styles.confirmBtn, minting && { opacity: 0.7 }]}>
          {minting ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.confirmText}>I consent — mint my passport</Text>
          )}
        </Pressable>
        <Pressable onPress={onBack} disabled={minting} hitSlop={6} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel — nothing is generated</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  heading: { fontFamily: uiFont(800), fontSize: 20, color: colors.ink },
  lede: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, lineHeight: 19, marginTop: 8, marginBottom: 14 },

  guardCard: {
    backgroundColor: colors.accentTint,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    padding: 14,
    gap: 8,
    marginBottom: 14,
  },
  guardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guardText: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, color: colors.accentInk, lineHeight: 17 },

  tierCard: { padding: 16, marginBottom: 14 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tierEyebrow: {
    fontFamily: uiFont(700),
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  requiredChip: { backgroundColor: colors.surface2, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.line },
  requiredText: { fontFamily: uiFont(600), fontSize: 10, color: colors.ink3 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  rowLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, lineHeight: 17 },
  rowDetail: { flex: 1.3, fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink, lineHeight: 17, textAlign: 'right' },

  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  switchTrackOn: { backgroundColor: colors.accent, borderColor: colors.accent, alignItems: 'flex-end' },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#fff',
    shadowColor: '#102018',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  identityNote: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, lineHeight: 16, marginTop: 10 },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.red,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { flex: 1, fontFamily: uiFont(600), fontSize: 12.5, color: colors.red, lineHeight: 17 },

  confirmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  confirmText: { fontFamily: uiFont(700), fontSize: 15, color: colors.onAccent },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink3 },
});
