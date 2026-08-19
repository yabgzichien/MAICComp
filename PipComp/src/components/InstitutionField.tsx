// src/components/InstitutionField.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { InstitutionBadge } from './InstitutionBadge';
import { searchInstitutions, type Institution } from '../lib/institutions';
import { radius, uiFont } from '../theme';
import { useThemeColors } from '../state/colorScheme';

/**
 * A text field that suggests known Malaysian banks/e-wallets as the user types,
 * each row showing a brand-toned badge + name. Free typing always remains valid 
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
  const colorTheme = useThemeColors();
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
        placeholderTextColor={colorTheme.ink3}
        style={[styles.input, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }, inputStyle]}
      />
      {matches.length > 0 && (
        <View style={[styles.dropdown, { borderColor: colorTheme.line, backgroundColor: colorTheme.surface }]}>
          {matches.map((m, i) => (
            <Pressable key={m.id} onPress={() => pick(m)} style={[styles.row, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
              <InstitutionBadge inst={m} size={32} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: colorTheme.ink }]} numberOfLines={1}>{m.name}</Text>
                <Text style={[styles.sub, { color: colorTheme.ink2 }]}>{m.kind === 'bank' ? 'Bank' : 'E-Wallet'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, fontFamily: uiFont(600), fontSize: 16 },
  dropdown: { marginTop: 8, borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  divider: { borderTopWidth: 1 },
  name: { fontFamily: uiFont(600), fontSize: 13.5 },
  sub: { fontFamily: uiFont(500), fontSize: 11, marginTop: 1 },
});
