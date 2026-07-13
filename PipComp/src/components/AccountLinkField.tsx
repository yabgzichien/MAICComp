// src/components/AccountLinkField.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CLASS_BY_ID, type LinkEffect } from '../lib/networth';
import type { Account } from '../lib/types';
import { colors, uiFont } from '../theme';
import { Icon, type IconName } from './Icon';

/**
 * Optional control to link a transaction to an asset/liability account. When an
 * account is picked, an effect toggle (adds to / reduces) appears. Presentational
 *  the parent owns selectedId + effect and decides the default effect on select.
 */
export function AccountLinkField({
  accounts,
  selectedId,
  effect,
  onSelect,
  onEffect,
}: {
  accounts: Account[];
  selectedId: string | null;
  effect: LinkEffect;
  onSelect: (id: string | null) => void;
  onEffect: (e: LinkEffect) => void;
}) {
  const active = accounts.filter((a) => !a.archived);
  if (active.length === 0) return null;
  const sel = active.find((a) => a.id === selectedId) ?? null;

  return (
    <View>
      <Text style={styles.label}>Link to account (optional)</Text>
      <View style={styles.chips}>
        <Pressable onPress={() => onSelect(null)} style={[styles.chip, !selectedId && styles.chipOn]}>
          <Text style={[styles.chipText, !selectedId && styles.chipTextOn]}>None</Text>
        </Pressable>
        {active.map((a) => {
          const on = selectedId === a.id;
          return (
            <Pressable key={a.id} onPress={() => onSelect(a.id)} style={[styles.chip, on && styles.chipOn]}>
              <Icon name={(CLASS_BY_ID[a.cls]?.icon ?? 'wallet') as IconName} size={13} color={on ? colors.accent : colors.ink3} />
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{a.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {sel && (
        <View style={styles.effectRow}>
          {(['subtract', 'add'] as LinkEffect[]).map((e) => {
            const on = effect === e;
            return (
              <Pressable key={e} onPress={() => onEffect(e)} style={[styles.effectBtn, on && styles.effectBtnOn]}>
                <Text style={[styles.effectText, on && styles.effectTextOn]}>
                  {e === 'subtract' ? `Reduces ${sel.name}` : `Adds to ${sel.name}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, maxWidth: '100%' },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  chipText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2, flexShrink: 1 },
  chipTextOn: { color: colors.accentInk },
  effectRow: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 999, padding: 3, marginTop: 10, borderWidth: 1, borderColor: colors.line2 },
  effectBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
  effectBtnOn: { backgroundColor: colors.accent },
  effectText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink3 },
  effectTextOn: { color: '#fff' },
});
