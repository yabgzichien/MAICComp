import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_EXPENSE_ID, DEFAULT_INCOME_ID } from '../data/categories';
import type { Transaction, TxnType } from '../lib/types';
import { todayISO } from '../lib/duplicates';
import { defaultLinkEffect, type LinkEffect } from '../lib/networth';
import { confirmAction } from '../lib/platformAlert';
import { useAppData } from '../state/store';
import { colors, numFont, radius, shadowToggle, uiFont } from '../theme';
import { AccountLinkField } from './AccountLinkField';
import { AddCategoryModal } from './AddCategoryModal';
import { SplitSheet } from './SplitSheet';
import { BtnLabel, CategoryChip, PrimaryButton } from './ui';
import { Icon } from './Icon';
import { fmt } from '../lib/format';
import { outstanding } from '../lib/split';
import type { SplitDraft } from '../lib/types';

/** Bottom-sheet editor for a single transaction. Shared by Dashboard + View All. */
export function EditTransactionModal({ txn, onClose }: { txn: Transaction | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const {
    categories,
    accounts,
    saveTransactionEdits,
    removeTransaction,
    recordBalanceLink,
    splits,
    shares,
    people,
    splitTransaction,
    unsplitTransaction,
  } = useAppData();

  const [amountText, setAmountText] = useState('');
  const [type, setType] = useState<TxnType>('expense');
  const [cat, setCat] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [linkEffect, setLinkEffect] = useState<LinkEffect>('subtract');
  const [splitting, setSplitting] = useState(false);

  const openId = txn?.id;
  useEffect(() => {
    if (txn) {
      setAmountText(txn.amount.toFixed(2));
      setType(txn.type);
      setCat(txn.categoryId);
      setRemark(txn.remark ?? '');
      setExpanded(false);
      setLinkId(null);
      setLinkEffect('subtract');
      setSplitting(false);
    }
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const split = useMemo(() => splits.find((s) => s.txnId === openId) ?? null, [splits, openId]);
  const splitShares = useMemo(
    () => (split ? shares.filter((s) => s.splitId === split.id) : []),
    [shares, split]
  );
  const splitDraft: SplitDraft | null = useMemo(
    () =>
      split
        ? {
            gross: split.gross,
            ownShare: split.ownShare,
            method: split.method,
            shares: splitShares.map((s) => ({ personId: s.personId, owed: s.owed })),
          }
        : null,
    [split, splitShares]
  );
  const stillOwed = splitShares
    .filter((s) => s.status === 'open')
    .reduce((sum, s) => sum + outstanding(s), 0);
  const splitNames = splitShares
    .map((s) => people.find((p) => p.id === s.personId)?.name ?? 'someone')
    .join(', ');

  const selectLink = (id: string | null) => {
    setLinkId(id);
    const a = id ? accounts.find((x) => x.id === id) : null;
    if (a) setLinkEffect(defaultLinkEffect(a.kind, type));
  };

  const grid = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  // Collapsed: show 4 (keep the selected one visible). Expanded: show all.
  const visible = useMemo(() => {
    if (expanded) return grid;
    const top4 = grid.slice(0, 4);
    if (!cat || top4.some((c) => c.id === cat)) return top4;
    const selected = grid.find((c) => c.id === cat);
    return selected ? [selected, ...top4].slice(0, 4) : top4;
  }, [grid, expanded, cat]);

  if (!txn) return <Modal visible={false} transparent />;

  const switchType = (t: TxnType) => {
    if (t === type) return;
    setType(t);
    setCat((prev) => {
      const c = categories.find((x) => x.id === prev);
      return c && c.kind === t ? prev : t === 'income' ? DEFAULT_INCOME_ID : DEFAULT_EXPENSE_ID;
    });
    if (linkId) {
      const a = accounts.find((x) => x.id === linkId);
      if (a) setLinkEffect(defaultLinkEffect(a.kind, t));
    }
  };

  const save = async () => {
    const n = parseFloat(amountText.replace(/[^0-9.]/g, ''));
    // A split row's amount is derived from the split, so it is not the user's to retype here:
    // letting it drift would leave `gross` and the shares reconciling against nothing.
    const amount = split
      ? txn.amount
      : Number.isFinite(n) && n >= 0
        ? Math.round(n * 100) / 100
        : txn.amount;
    const categoryId = cat ?? (type === 'income' ? DEFAULT_INCOME_ID : DEFAULT_EXPENSE_ID);
    await saveTransactionEdits(txn, { amount, type, categoryId, remark: remark.trim() || null });
    if (linkId) await recordBalanceLink(linkId, amount, linkEffect, txn.date ?? todayISO());
    onClose();
  };

  const confirmDelete = () => {
    confirmAction('Delete transaction?', `Remove “${txn.merchantRaw}”? This can’t be undone.`, 'Delete', async () => {
      await removeTransaction(txn.id);
      onClose();
    });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>
            {txn.merchantRaw}
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="x" size={20} color={colors.ink2} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* type toggle */}
          <View style={styles.toggle}>
            {(['expense', 'income'] as TxnType[]).map((k) => {
              const on = type === k;
              return (
                <Pressable key={k} onPress={() => switchType(k)} style={[styles.toggleBtn, on && styles.toggleBtnOn]}>
                  <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{k === 'expense' ? 'Expense' : 'Income'}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>{split ? 'Your share' : 'Amount'}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.rmPrefix}>RM</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              selectTextOnFocus
              editable={!split}
              style={[styles.amountInput, !!split && styles.amountInputLocked]}
            />
          </View>
          {!!split && (
            <Text style={styles.lockNote}>
              RM {fmt(split.gross)} left your account. Change the split below to adjust this.
            </Text>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Category</Text>
          <View style={styles.grid}>
            {visible.map((c) => (
              <View key={c.id} style={styles.gridCell}>
                <CategoryChip category={c} selected={cat === c.id} suggested={false} onPress={() => setCat(c.id)} />
              </View>
            ))}
            {expanded && (
              <View style={styles.gridCell}>
                <Pressable onPress={() => setAdding(true)} style={styles.addChip}>
                  <Icon name="plus" size={16} color={colors.accent} stroke={2.2} />
                  <Text style={styles.addChipText}>New category</Text>
                </Pressable>
              </View>
            )}
          </View>
          {grid.length > 4 && (
            <Pressable onPress={() => setExpanded((e) => !e)} style={styles.moreBtn} hitSlop={6}>
              <Text style={styles.moreText}>{expanded ? 'Show less' : `Show all ${grid.length}`}</Text>
              <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                <Icon name="chevronDown" size={16} color={colors.accent} />
              </View>
            </Pressable>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Remark (optional)</Text>
          <TextInput
            value={remark}
            onChangeText={setRemark}
            placeholder="e.g. Lunch with a supplier"
            placeholderTextColor={colors.ink3}
            style={styles.remarkInput}
            multiline
          />

          {type === 'expense' && (
            <Pressable onPress={() => setSplitting(true)} style={styles.splitRow} hitSlop={4}>
              <Icon name="gift" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.splitTitle}>{split ? 'Split with friends' : 'Split with friends'}</Text>
                <Text style={styles.splitSub} numberOfLines={1}>
                  {split
                    ? stillOwed > 0
                      ? `${splitNames} owe you RM ${fmt(stillOwed)}`
                      : `${splitNames} settled up`
                    : 'Record only your share and track what you are owed'}
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.ink3} />
            </Pressable>
          )}

          <View style={{ marginTop: 18 }}>
            <AccountLinkField accounts={accounts} selectedId={linkId} effect={linkEffect} onSelect={selectLink} onEffect={setLinkEffect} label="Link to account (optional)" />
          </View>

          <View style={{ marginTop: 20 }}>
            <PrimaryButton onPress={save} height={52}>
              <Icon name="check" size={18} color="#fff" stroke={2.4} />
              <BtnLabel>Save changes</BtnLabel>
            </PrimaryButton>
          </View>

          <Pressable onPress={confirmDelete} style={styles.deleteBtn} hitSlop={6}>
            <Icon name="trash" size={17} color="#b3261e" />
            <Text style={styles.deleteText}>Delete transaction</Text>
          </Pressable>
        </ScrollView>
      </View>

      <AddCategoryModal
        visible={adding}
        kind={type}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setCat(id);
          setAdding(false);
        }}
      />

      {/* Splitting saves and closes on its own: it rewrites the row's amount, so leaving the
          editor open on a stale figure would invite the user to save the old one back. */}
      <SplitSheet
        visible={splitting}
        gross={split ? split.gross : txn.amount}
        merchant={txn.merchantRaw}
        initial={splitDraft}
        onClose={() => setSplitting(false)}
        onApply={async (draft) => {
          setSplitting(false);
          await splitTransaction(txn, draft);
          onClose();
        }}
        onRemove={
          split
            ? async () => {
                setSplitting(false);
                await unsplitTransaction(txn);
                onClose();
              }
            : undefined
        }
      />
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
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { flex: 1, fontFamily: uiFont(700), fontSize: 19, color: colors.ink, marginRight: 12 },
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
  toggleBtnOn: { backgroundColor: colors.surface, ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink2 },
  toggleTextOn: { color: colors.ink },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rmPrefix: { fontFamily: numFont(600), fontSize: 18, color: colors.ink2 },
  amountInput: {
    flex: 1,
    fontFamily: numFont(700),
    fontSize: 24,
    color: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  amountInputLocked: { backgroundColor: colors.surface2, color: colors.ink2 },
  lockNote: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 6 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  splitTitle: { fontFamily: uiFont(700), fontSize: 14, color: colors.ink },
  splitSub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 2 },
  remarkInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: uiFont(600),
    fontSize: 14.5,
    color: colors.ink,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    borderStyle: 'dashed',
    backgroundColor: colors.accentTint,
  },
  addChipText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.accent },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  moreText: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.accent },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16, marginTop: 4 },
  deleteText: { fontFamily: uiFont(700), fontSize: 14.5, color: '#b3261e' },
});
