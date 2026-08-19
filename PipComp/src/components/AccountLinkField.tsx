// src/components/AccountLinkField.tsx
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CLASS_BY_ID, type LinkEffect } from '../lib/networth';
import type { Account } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, uiFont } from '../theme';
import { Icon, type IconName } from './Icon';

/**
 * Control to tie a transaction to an asset/liability account. The account is
 * chosen from a dropdown; when one is picked, an effect toggle (adds to /
 * reduces) appears. Presentational — the parent owns selectedId + effect and
 * decides the default effect on select.
 *
 * Omit `effect`/`onEffect` (e.g. a scanned batch, where each row's direction is
 * derived per-transaction) to render the dropdown alone with no effect toggle.
 * Pass `required` (add flows) to drop the "None" option — an account is
 * mandatory and the parent seeds a default (Cash) selection.
 */
export function AccountLinkField({
  accounts,
  selectedId,
  effect,
  onSelect,
  onEffect,
  label = 'Account',
  required = false,
}: {
  accounts: Account[];
  selectedId: string | null;
  effect?: LinkEffect;
  onSelect: (id: string | null) => void;
  onEffect?: (e: LinkEffect) => void;
  label?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const active = accounts.filter((a) => !a.archived);
  if (active.length === 0) return null;
  const sel = active.find((a) => a.id === selectedId) ?? null;

  const choose = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <View>
      <Text style={[styles.label, { color: colorTheme.ink2 }]}>{label}</Text>

      <Pressable onPress={() => setOpen(true)} style={[styles.trigger, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
        {sel ? (
          <Icon name={(CLASS_BY_ID[sel.cls]?.icon ?? 'wallet') as IconName} size={16} color={colorTheme.ink2} />
        ) : null}
        <Text
          style={[
            styles.triggerText,
            { color: colorTheme.ink },
            !sel && [styles.triggerPlaceholder, { color: colorTheme.ink3 }],
          ]}
          numberOfLines={1}
        >
          {sel ? sel.name : required ? 'Select account' : 'None'}
        </Text>
        <Icon name="chevronDown" size={18} color={colorTheme.ink3} />
      </Pressable>

      {sel && effect && onEffect && (
        <View style={[styles.effectRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
          {(['subtract', 'add'] as LinkEffect[]).map((e) => {
            const on = effect === e;
            return (
              <Pressable key={e} onPress={() => onEffect(e)} style={[styles.effectBtn, on && { backgroundColor: theme.accentInk }]}>
                <Text style={[styles.effectText, { color: colorTheme.ink2 }, on && styles.effectTextOn]}>
                  {e === 'subtract' ? `Reduces ${sel.name}` : `Adds to ${sel.name}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.menuWrap} pointerEvents="box-none">
          <View style={[styles.menu, { backgroundColor: colorTheme.bg, borderColor: colorTheme.line2 }]}>
            <Text style={[styles.menuTitle, { color: colorTheme.ink2 }]}>Account</Text>
            <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
              {!required && <Option label="None" active={!selectedId} onPress={() => choose(null)} />}
              {active.map((a) => (
                <Option
                  key={a.id}
                  label={a.name}
                  icon={(CLASS_BY_ID[a.cls]?.icon ?? 'wallet') as IconName}
                  active={selectedId === a.id}
                  onPress={() => choose(a.id)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Option({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable onPress={onPress} style={[styles.option, active && { backgroundColor: theme.accentTint }]}>
      {icon ? <Icon name={icon} size={16} color={active ? theme.accent : colorTheme.ink3} /> : <View style={styles.optionIconSpacer} />}
      <Text style={[styles.optionText, { color: colorTheme.ink }, active && { color: theme.accentInk }]} numberOfLines={1}>
        {label}
      </Text>
      {active && <Icon name="check" size={16} color={theme.accent} stroke={2.4} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  triggerText: { flex: 1, fontFamily: uiFont(600), fontSize: 16 },
  triggerPlaceholder: {},
  effectRow: { flexDirection: 'row', borderRadius: 999, padding: 3, marginTop: 10, borderWidth: 1 },
  effectBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
  effectText: { fontFamily: uiFont(600), fontSize: 12.5 },
  effectTextOn: { color: '#fff' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  menuWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  menu: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 8,
    maxHeight: '70%',
  },
  menuTitle: { fontFamily: uiFont(700), fontSize: 13, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  menuScroll: { flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  optionIconSpacer: { width: 16 },
  optionText: { flex: 1, fontFamily: uiFont(600), fontSize: 15 },
});
