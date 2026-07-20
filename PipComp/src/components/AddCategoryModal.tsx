import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catColorsForHue } from '../lib/catColors';
import type { TxnType } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, radius, uiFont } from '../theme';
import { Icon, type IconName } from './Icon';
import { BtnLabel, CatBadge, PrimaryButton } from './ui';

const EXPENSE_ICONS: IconName[] = ['cart', 'utensils', 'coffee', 'car', 'bag', 'heart', 'receipt', 'play', 'fuel', 'dots'];
const INCOME_ICONS: IconName[] = ['wallet', 'gift', 'sparkles', 'return', 'trending', 'percent', 'dots'];
const HUE_CHOICES = [12, 42, 70, 120, 162, 200, 248, 286, 330];

/** Compact modal to create a custom category of a given kind, then select it. */
export function AddCategoryModal({
  visible,
  kind,
  onClose,
  onCreated,
}: {
  visible: boolean;
  kind: TxnType;
  onClose: () => void;
  onCreated: (categoryId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { addCategory } = useAppData();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('cart');
  const [hue, setHue] = useState(162);
  const [busy, setBusy] = useState(false);

  const iconChoices = kind === 'income' ? INCOME_ICONS : EXPENSE_ICONS;

  const pickCustomIcon = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      const dataUri = a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
      setIcon(dataUri);
    }
  };

  useEffect(() => {
    if (visible) {
      setName('');
      setIcon(kind === 'income' ? 'wallet' : 'cart');
      setHue(162);
    }
  }, [visible, kind]);

  if (!visible) return <Modal visible={false} transparent />;

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await addCategory(name.trim(), icon, hue, kind);
      onCreated(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.center, { pointerEvents: 'box-none' }]}>
        <View style={[styles.card, { marginBottom: insets.bottom }]}>
          <View style={styles.head}>
            <Text style={styles.title}>New {kind} category</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Icon name="x" size={20} color={colors.ink2} />
            </Pressable>
          </View>

          <View style={styles.previewRow}>
            <CatBadge category={{ id: 'new', label: name, icon, hue, kind, isDefault: false }} size={44} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Category name"
              placeholderTextColor={colors.ink3}
              style={styles.input}
              maxLength={22}
              autoFocus
            />
          </View>

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
            <Pressable
              onPress={pickCustomIcon}
              style={[
                styles.iconChoice,
                (icon.startsWith('data:') || icon.startsWith('file:') || icon.startsWith('content:') || icon.startsWith('http') || icon.startsWith('/')) && styles.iconChoiceOn,
                { minWidth: 68, flexDirection: 'row', gap: 4, paddingHorizontal: 6 }
              ]}
            >
              {(icon.startsWith('data:') || icon.startsWith('file:') || icon.startsWith('content:') || icon.startsWith('http') || icon.startsWith('/')) ? (
                <Image source={{ uri: icon }} style={{ width: 22, height: 22, borderRadius: 4 }} resizeMode="cover" />
              ) : (
                <Icon name="image" size={17} color={colors.accent} stroke={2.0} />
              )}
              <Text style={{ fontSize: 10, fontFamily: uiFont(700), color: colors.accent }}>Gallery</Text>
            </Pressable>
          </View>

          <Text style={[styles.pickLabel, { marginTop: 14 }]}>Color</Text>
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

          <View style={{ marginTop: 18 }}>
            <PrimaryButton onPress={submit} disabled={!name.trim() || busy} height={50}>
              <Icon name="plus" size={18} color="#fff" stroke={2.2} />
              <BtnLabel>Create & select</BtnLabel>
            </PrimaryButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  center: { flex: 1, justifyContent: 'flex-end', padding: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
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
  pickLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, marginBottom: 9 },
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
