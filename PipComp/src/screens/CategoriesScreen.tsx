import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { BtnLabel, Card, CatBadge, Eyebrow, PrimaryButton, TopBar } from '../components/ui';
import { PROTECTED_CATEGORY_IDS } from '../db/categoriesRepo';
import { catColorsForHue } from '../lib/catColors';
import type { TxnType } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, radius, uiFont } from '../theme';

const EXPENSE_ICONS: IconName[] = ['cart', 'utensils', 'coffee', 'car', 'bag', 'heart', 'receipt', 'play', 'fuel', 'dots'];
const INCOME_ICONS: IconName[] = ['wallet', 'gift', 'sparkles', 'return', 'trending', 'percent', 'dots'];
const HUE_CHOICES = [12, 42, 70, 120, 162, 200, 248, 286, 330];

export function CategoriesScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { categories, addCategory, deleteCategory } = useAppData();

  const [kind, setKind] = useState<TxnType>('expense');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('cart');
  const [hue, setHue] = useState(162);
  const [busy, setBusy] = useState(false);

  const iconChoices = kind === 'income' ? INCOME_ICONS : EXPENSE_ICONS;
  const list = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);

  // When switching kind, default the icon to one valid for that kind.
  useEffect(() => {
    setIcon(kind === 'income' ? 'wallet' : 'cart');
  }, [kind]);

  const canAdd = name.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canAdd) return;
    setBusy(true);
    try {
      await addCategory(name.trim(), icon, hue, kind);
      setName('');
      setHue(162);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (id: string, label: string) => {
    Alert.alert('Delete category?', `Remove “${label}”? Transactions move to a default and its learning is cleared.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(id) },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Categories" onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* kind toggle */}
        <View style={styles.toggle}>
          {(['expense', 'income'] as TxnType[]).map((k) => {
            const on = kind === k;
            return (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.toggleBtn, on && styles.toggleBtnOn]}>
                <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{k === 'expense' ? 'Expense' : 'Income'}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* existing */}
        <Eyebrow style={{ marginBottom: 10 }}>Your {kind} categories</Eyebrow>
        <Card style={{ overflow: 'hidden' }}>
          {list.map((c, i) => (
            <View key={c.id} style={[styles.row, i > 0 && styles.divider]}>
              <CatBadge category={c} size={38} />
              <Text style={styles.rowLabel} numberOfLines={1}>
                {c.label}
              </Text>
              {PROTECTED_CATEGORY_IDS.includes(c.id) ? (
                <Text style={styles.defaultTag}>locked</Text>
              ) : (
                <Pressable onPress={() => confirmDelete(c.id, c.label)} hitSlop={8} style={styles.delBtn}>
                  <Icon name="trash" size={17} color="#b3261e" />
                </Pressable>
              )}
            </View>
          ))}
        </Card>

        {/* add new */}
        <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Add a {kind} category</Eyebrow>
        <Card style={{ padding: 16, gap: 16 }}>
          <View style={styles.previewRow}>
            <CatBadge category={{ id: 'new', label: name, icon, hue, kind, isDefault: false }} size={44} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={kind === 'income' ? 'e.g. Freelance' : 'Category name'}
              placeholderTextColor={colors.ink3}
              style={styles.input}
              maxLength={22}
            />
          </View>

          <View style={{ gap: 9 }}>
            <Text style={styles.pickLabel}>Icon</Text>
            <View style={styles.choiceWrap}>
              {iconChoices.map((ic) => {
                const on = ic === icon;
                return (
                  <Pressable key={ic} onPress={() => setIcon(ic)} style={[styles.iconChoice, on && styles.iconChoiceOn]}>
                    <Icon name={ic} size={20} color={on ? colors.accent : colors.ink2} stroke={1.9} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 9 }}>
            <Text style={styles.pickLabel}>Color</Text>
            <View style={styles.choiceWrap}>
              {HUE_CHOICES.map((h) => {
                const on = h === hue;
                return (
                  <Pressable key={h} onPress={() => setHue(h)} style={[styles.hueChoice, { backgroundColor: catColorsForHue(h).solid }, on && styles.hueChoiceOn]}>
                    {on && <Icon name="check" size={14} color="#fff" stroke={2.6} />}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <PrimaryButton onPress={submit} disabled={!canAdd} height={50}>
            <Icon name="plus" size={18} color="#fff" stroke={2.2} />
            <BtnLabel>Add {kind} category</BtnLabel>
          </PrimaryButton>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: 999,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { backgroundColor: colors.surface, ...{ shadowColor: '#102018', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 } },
  toggleText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink3 },
  toggleTextOn: { color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  rowLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 15, color: colors.ink },
  defaultTag: { fontFamily: uiFont(600), fontSize: 11.5, color: colors.ink3 },
  delBtn: { padding: 6 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: uiFont(600),
    fontSize: 15,
    color: colors.ink,
  },
  pickLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  iconChoice: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoiceOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  hueChoice: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  hueChoiceOn: { borderWidth: 2.5, borderColor: colors.ink },
});
