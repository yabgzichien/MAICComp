// src/components/InstitutionField.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { InstitutionBadge } from './InstitutionBadge';
import { searchInstitutions, type Institution } from '../lib/institutions';
import { colors, radius, uiFont } from '../theme';

/**
 * A text field that suggests known Malaysian banks/e-wallets as the user types,
 * each row showing a brand-toned badge + name. Free typing always remains valid —
 * a match is a convenience, never a requirement. The dropdown renders in normal
 * layout flow (pushes content down) rather than as an overlay, since this field
 * always sits inside a scroll view.
 */
export function InstitutionField({
  value,
  onChangeText,
  onPick,
  placeholder,
  inputStyle,
}: {
  value: string;
  onChangeText: (s: string) => void;
  onPick?: (inst: Institution) => void;
  placeholder?: string;
  inputStyle?: TextStyle;
}) {
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => (focused ? searchInstitutions(value) : []), [focused, value]);

  const pick = (inst: Institution) => {
    onChangeText(inst.name);
    onPick?.(inst);
    setFocused(false);
  };

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        // Delay so a suggestion's onPress fires before the dropdown unmounts on blur.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        style={[styles.input, inputStyle]}
      />
      {matches.length > 0 && (
        <View style={styles.dropdown}>
          {matches.map((m, i) => (
            <Pressable key={m.id} onPress={() => pick(m)} style={[styles.row, i > 0 && styles.divider]}>
              <InstitutionBadge inst={m} size={32} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.sub}>{m.kind === 'bank' ? 'Bank' : 'E-Wallet'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, fontFamily: uiFont(600), fontSize: 16, color: colors.ink },
  dropdown: { marginTop: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  name: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink },
  sub: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink3, marginTop: 1 },
});
