import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmt } from '../lib/format';
import { computeSplit, validateSplit, type Participant } from '../lib/split';
import type { SplitDraft, SplitMethod } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, numFont, radius, shadowToggle, uiFont } from '../theme';
import { Icon } from './Icon';
import { BtnLabel, PrimaryButton } from './ui';

const METHODS: { key: SplitMethod; label: string; hint: string }[] = [
  { key: 'equal', label: 'Equal', hint: 'Everyone pays the same' },
  { key: 'shares', label: 'Shares', hint: 'Someone ate double' },
  { key: 'exact', label: 'Exact', hint: 'Type what each person owes' },
];

/**
 * Divide a bill you paid in full. What comes back is what the ledger should record as your own
 * expense, plus what each friend owes you as a receivable.
 *
 * The arithmetic lives in lib/split.ts; this only collects who was there and how to cut it. The
 * running total is recomputed on every keystroke so the payer's own share is never a surprise.
 */
export function SplitSheet({
  visible,
  gross,
  merchant,
  initial,
  onClose,
  onApply,
  onRemove,
}: {
  visible: boolean;
  /** The full amount that left the account. */
  gross: number;
  merchant?: string;
  /** An existing split, when re-opening one to change it. */
  initial?: SplitDraft | null;
  onClose: () => void;
  onApply: (draft: SplitDraft) => void;
  /** Offered only when there is an existing split to clear. */
  onRemove?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { people, addPerson } = useAppData();

  const [method, setMethod] = useState<SplitMethod>('equal');
  const [includeSelf, setIncludeSelf] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [exacts, setExacts] = useState<Record<string, string>>({});
  const [selfWeight, setSelfWeight] = useState(1);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-seed whenever the sheet opens, so re-opening an existing split shows what is already
  // there rather than whatever the last bill happened to leave behind.
  useEffect(() => {
    if (!visible) return;
    if (initial && initial.shares.length > 0) {
      setMethod(initial.method === 'itemized' ? 'exact' : initial.method);
      setPicked(initial.shares.map((s) => s.personId));
      setExacts(Object.fromEntries(initial.shares.map((s) => [s.personId, s.owed.toFixed(2)])));
      setWeights({});
      setSelfWeight(1);
      setIncludeSelf(initial.ownShare > 0);
    } else {
      setMethod('equal');
      setPicked([]);
      setWeights({});
      setExacts({});
      setSelfWeight(1);
      setIncludeSelf(true);
    }
    setNewName('');
  }, [visible, initial]);

  const participants: Participant[] = useMemo(
    () =>
      picked.map((id) => ({
        personId: id,
        weight: weights[id] ?? 1,
        exact: parseFloat((exacts[id] ?? '').replace(/[^0-9.]/g, '')) || 0,
      })),
    [picked, weights, exacts]
  );

  const input = { gross, participants, method, includeSelf, selfWeight };
  const error = useMemo(() => validateSplit(input), [gross, participants, method, includeSelf, selfWeight]);
  const result = useMemo(() => computeSplit(input), [gross, participants, method, includeSelf, selfWeight]);

  const owedBy = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of result.shares) map[s.personId] = s.owed;
    return map;
  }, [result]);

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const unpicked = useMemo(() => people.filter((p) => !picked.includes(p.id)), [people, picked]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addNew = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const person = await addPerson(name);
      setPicked((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]));
      setNewName('');
    } finally {
      setBusy(false);
    }
  };

  const bump = (id: string, by: number) =>
    setWeights((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + by) }));

  const apply = () => {
    if (error) return;
    onApply({
      gross,
      ownShare: result.ownShare,
      method,
      shares: result.shares.filter((s) => s.owed > 0),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Split RM {fmt(gross)}</Text>
            {!!merchant && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {merchant}
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Icon name="x" size={20} color={colors.ink2} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.toggle}>
            {METHODS.map((m) => {
              const on = method === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMethod(m.key)}
                  style={[styles.toggleBtn, on && styles.toggleBtnOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>{METHODS.find((m) => m.key === method)?.hint}</Text>

          <Text style={styles.fieldLabel}>Who else was there</Text>
          {people.length > 0 && (
            <View style={styles.chipWrap}>
              {unpicked.map((p) => (
                <Pressable key={p.id} onPress={() => toggle(p.id)} style={styles.chip}>
                  <Icon name="plus" size={13} color={colors.accent} stroke={2.4} />
                  <Text style={styles.chipText}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.addRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Add a name"
              placeholderTextColor={colors.ink3}
              style={styles.nameInput}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={addNew}
            />
            <Pressable
              onPress={addNew}
              style={[styles.addBtn, !newName.trim() && styles.addBtnOff]}
              disabled={!newName.trim() || busy}
              accessibilityLabel="Add this person"
            >
              <Icon name="plus" size={18} color={newName.trim() ? colors.onAccent : colors.ink3} stroke={2.4} />
            </Pressable>
          </View>

          {picked.length === 0 ? (
            <Text style={styles.empty}>Nobody added yet. Tap a name above, or type a new one.</Text>
          ) : (
            <View style={styles.list}>
              {picked.map((id) => (
                <View key={id} style={styles.personRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(nameById[id] ?? '?').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.personName} numberOfLines={1}>
                    {nameById[id] ?? 'Someone'}
                  </Text>

                  {method === 'shares' && (
                    <View style={styles.stepper}>
                      <Pressable onPress={() => bump(id, -1)} style={styles.stepBtn} hitSlop={4} accessibilityLabel="Fewer shares">
                        <Text style={styles.stepText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepValue}>{weights[id] ?? 1}</Text>
                      <Pressable onPress={() => bump(id, 1)} style={styles.stepBtn} hitSlop={4} accessibilityLabel="More shares">
                        <Text style={styles.stepText}>+</Text>
                      </Pressable>
                    </View>
                  )}

                  {method === 'exact' ? (
                    <TextInput
                      value={exacts[id] ?? ''}
                      onChangeText={(v) => setExacts((prev) => ({ ...prev, [id]: v }))}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.ink3}
                      style={styles.exactInput}
                    />
                  ) : (
                    <Text style={styles.owed}>{fmt(owedBy[id] ?? 0)}</Text>
                  )}

                  <Pressable onPress={() => toggle(id)} hitSlop={8} accessibilityLabel={`Remove ${nameById[id] ?? 'person'}`}>
                    <Icon name="x" size={16} color={colors.ink3} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={() => setIncludeSelf((v) => !v)}
            style={styles.selfRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: includeSelf }}
          >
            <View style={[styles.check, includeSelf && styles.checkOn]}>
              {includeSelf && <Icon name="check" size={13} color={colors.onAccent} stroke={2.6} />}
            </View>
            <Text style={styles.selfText}>I was on this bill too</Text>
            {includeSelf && method === 'shares' && (
              <View style={styles.stepper}>
                <Pressable onPress={() => setSelfWeight((w) => Math.max(1, w - 1))} style={styles.stepBtn} hitSlop={4}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{selfWeight}</Text>
                <Pressable onPress={() => setSelfWeight((w) => w + 1)} style={styles.stepBtn} hitSlop={4}>
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
            )}
          </Pressable>

          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Your expense</Text>
              <Text style={styles.summaryValue}>RM {fmt(result.ownShare)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabelSoft}>Owed to you</Text>
              <Text style={styles.summaryValueSoft}>
                RM {fmt(result.shares.reduce((s, x) => s + x.owed, 0))}
              </Text>
            </View>
            <Text style={styles.summaryNote}>
              Only your share is recorded as spending. The rest becomes money owed to you, and clears when
              they pay you back.
            </Text>
          </View>

          {!!error && picked.length > 0 && <Text style={styles.error}>{error}</Text>}

          <View style={{ marginTop: 16 }}>
            <PrimaryButton onPress={apply} height={52} disabled={!!error}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>Save split</BtnLabel>
            </PrimaryButton>
          </View>

          {!!onRemove && (
            <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={6}>
              <Icon name="trash" size={16} color="#b3261e" />
              <Text style={styles.removeText}>Remove split</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontFamily: uiFont(700), fontSize: 19, color: colors.ink },
  subtitle: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, marginTop: 2 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { backgroundColor: colors.surface, ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink2 },
  toggleTextOn: { color: colors.ink },
  hint: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  chipText: { fontFamily: uiFont(600), fontSize: 13, color: colors.accentInk },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: uiFont(600),
    fontSize: 14.5,
    color: colors.ink,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOff: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  empty: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink3, marginTop: 14, textAlign: 'center' },
  list: { marginTop: 14, gap: 8 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk },
  personName: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  owed: { fontFamily: numFont(700), fontSize: 15, color: colors.ink },
  exactInput: {
    width: 88,
    textAlign: 'right',
    fontFamily: numFont(700),
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontFamily: uiFont(700), fontSize: 15, color: colors.ink2, lineHeight: 18 },
  stepValue: { fontFamily: numFont(700), fontSize: 14, color: colors.ink, minWidth: 14, textAlign: 'center' },
  selfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  selfText: { flex: 1, fontFamily: uiFont(600), fontSize: 14, color: colors.ink },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: uiFont(700), fontSize: 14, color: colors.ink },
  summaryValue: { fontFamily: numFont(700), fontSize: 17, color: colors.ink },
  summaryLabelSoft: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2 },
  summaryValueSoft: { fontFamily: numFont(600), fontSize: 14, color: colors.accent },
  summaryNote: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, lineHeight: 16, marginTop: 4 },
  error: { fontFamily: uiFont(600), fontSize: 12.5, color: '#b3261e', marginTop: 12, textAlign: 'center' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  removeText: { fontFamily: uiFont(700), fontSize: 14, color: '#b3261e' },
});
