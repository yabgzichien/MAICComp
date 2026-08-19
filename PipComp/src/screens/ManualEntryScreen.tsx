import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountLinkField } from '../components/AccountLinkField';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { Icon } from '../components/Icon';
import { BtnLabel, CategoryChip, Eyebrow, PrimaryButton, TopBar } from '../components/ui';
import { todayISO } from '../lib/duplicates';
import { fullDate, isValidIsoDate } from '../lib/dates';
import { defaultLinkEffect, type LinkEffect } from '../lib/networth';
import { fmt } from '../lib/format';
import { SplitSheet } from '../components/SplitSheet';
import type { Category, ExtractedTxn, SplitDraft, TxnType } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { numFont, radius, shadowToggle, uiFont } from '../theme';

export function ManualEntryScreen({
  categories,
  onBack,
  onComplete,
  title,
  startSplitting = false,
  initialMerchant = null,
  initialAmount = null,
  initialSplit = null,
}: {
  categories: Category[];
  onBack: () => void;
  onComplete: (item: ExtractedTxn, categoryId: string, split: SplitDraft | null) => void;
  /** Overrides the top-bar title when the caller knows how the user got here. */
  title?: string;
  /** Framed as the standalone Split action rather than a plain manual entry. */
  startSplitting?: boolean;
  /** Prefill from a scanned receipt: the merchant, what the card was charged, and the
   *  per-person split the itemiser produced. */
  initialMerchant?: string | null;
  initialAmount?: number | null;
  initialSplit?: SplitDraft | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { accounts, recordBalanceLink, ensureDefaultAccount } = useAppData();
  const [merchant, setMerchant] = useState(initialMerchant ?? '');
  const [amountText, setAmountText] = useState(initialAmount ? initialAmount.toFixed(2) : '');
  const [dateText, setDateText] = useState(todayISO());
  const [type, setType] = useState<TxnType>('expense');
  const [cat, setCat] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [adding, setAdding] = useState(false);
  const [split, setSplit] = useState<SplitDraft | null>(initialSplit);
  const [splitting, setSplitting] = useState(false);

  // Every transaction is tied to an account. Default to a cash account (prefer an
  // existing one); the effect below seeds it and creates a "Cash" account if none exist.
  const defaultAcctId = useMemo(() => {
    const act = accounts.filter((a) => !a.archived);
    return (act.find((a) => a.cls === 'cash') ?? act[0])?.id ?? null;
  }, [accounts]);
  const [linkId, setLinkId] = useState<string | null>(defaultAcctId);
  const [linkEffect, setLinkEffect] = useState<LinkEffect>('subtract');

  const grid = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const amount = Math.max(0, parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0);
  const dateTrimmed = dateText.trim();
  const validDate = isValidIsoDate(dateTrimmed) ? dateTrimmed : null;
  const canSave = amount > 0 && !!cat && !!validDate && !!linkId;

  const switchType = (t: TxnType) => {
    if (t === type) return;
    setType(t);
    setCat(null);
    if (linkId) {
      const a = accounts.find((x) => x.id === linkId);
      if (a) setLinkEffect(defaultLinkEffect(a.kind, t));
    }
  };

  const selectLink = (id: string | null) => {
    setLinkId(id);
    const a = id ? accounts.find((x) => x.id === id) : null;
    if (a) setLinkEffect(defaultLinkEffect(a.kind, type));
  };

  // Seed the required account selection once accounts are known, creating a
  // default "Cash" account if the user has none yet.
  useEffect(() => {
    if (linkId) return;
    if (defaultAcctId) selectLink(defaultAcctId);
    else ensureDefaultAccount().then(selectLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAcctId]);

  // A split whose gross no longer matches the amount field is stale (the user changed the bill
  // after splitting it), so it is dropped rather than silently applied to a different number.
  const activeSplit = split && Math.abs(split.gross - Math.round(amount * 100) / 100) < 0.005 ? split : null;

  const save = async () => {
    if (!canSave || !cat || !validDate) return;
    const amt = Math.round(amount * 100) / 100;
    const item: ExtractedTxn = {
      merchant: merchant.trim(),
      // Only the payer's own share is the expense; the rest becomes a receivable.
      amount: activeSplit ? activeSplit.ownShare : amt,
      type,
      date: validDate,
      method: null,
      remark: remark.trim() || null,
    };
    // The balance moves by the full bill even when the row records only a share, because the
    // whole amount is what actually left the account.
    if (linkId) await recordBalanceLink(linkId, amt, linkEffect, validDate);
    onComplete(item, cat, activeSplit);
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title={title ?? (startSplitting ? 'Split a bill' : 'Add manually')} onBack={onBack} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        {/* type toggle */}
        <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
          {(['expense', 'income'] as TxnType[]).map((k) => {
            const on = type === k;
            return (
              <Pressable key={k} onPress={() => switchType(k)} style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: colorTheme.surface }]}>
                <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && styles.toggleTextOn, on && { color: colorTheme.ink }]}>{k === 'expense' ? 'Expense' : 'Income'}</Text>
              </Pressable>
            );
          })}
        </View>

        <Eyebrow style={{ marginBottom: 8 }}>{type === 'income' ? 'Source (optional)' : 'Merchant (optional)'}</Eyebrow>
        <TextInput
          value={merchant}
          onChangeText={setMerchant}
          placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Jaya Grocer'}
          placeholderTextColor={colorTheme.ink3}
          style={[styles.textInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
          autoFocus={!initialMerchant}
        />

        <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>Amount</Eyebrow>
        <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <Text style={[styles.rm, { color: colorTheme.ink2 }]}>RM</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colorTheme.ink3}
            style={[styles.amountInput, { color: colorTheme.ink }]}
          />
        </View>

        {type === 'expense' && (
          <Pressable
            onPress={() => setSplitting(true)}
            style={[styles.splitRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, amount <= 0 && styles.splitRowOff]}
            disabled={amount <= 0}
            hitSlop={4}
          >
            <Icon name="gift" size={17} color={amount > 0 ? theme.accent : colorTheme.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.splitTitle, { color: colorTheme.ink }]}>
                {activeSplit ? `Your share: RM ${fmt(activeSplit.ownShare)}` : 'Split with friends'}
              </Text>
              <Text style={[styles.splitSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                {activeSplit
                  ? `RM ${fmt(activeSplit.gross - activeSplit.ownShare)} owed back to you`
                  : amount > 0
                    ? 'Paid for the table? Record only your share'
                    : 'Enter the bill amount first'}
              </Text>
            </View>
            <Icon name="chevronRight" size={17} color={colorTheme.ink3} />
          </Pressable>
        )}

        <View style={{ marginTop: 18 }}>
          <AccountLinkField accounts={accounts} selectedId={linkId} effect={linkEffect} onSelect={selectLink} onEffect={setLinkEffect} required />
        </View>

        <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>Date</Eyebrow>
        <TextInput
          value={dateText}
          onChangeText={setDateText}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colorTheme.ink3}
          keyboardType="numbers-and-punctuation"
          style={[styles.textInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
        />
        <Text style={[styles.dateHint, { color: colorTheme.ink2 }, !validDate && styles.dateHintBad]}>
          {validDate ? fullDate(validDate) : 'Enter a valid date (YYYY-MM-DD)'}
        </Text>

        <Eyebrow style={{ marginTop: 18, marginBottom: 10 }}>Category</Eyebrow>
        <View style={styles.grid}>
          {grid.map((c) => (
            <View key={c.id} style={styles.gridCell}>
              <CategoryChip category={c} selected={cat === c.id} suggested={false} onPress={() => setCat(c.id)} />
            </View>
          ))}
          <View style={styles.gridCell}>
            <Pressable onPress={() => setAdding(true)} style={[styles.addChip, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}>
              <Icon name="plus" size={16} color={theme.accent} stroke={2.2} />
              <Text style={[styles.addChipText, { color: theme.accent }]}>New category</Text>
            </Pressable>
          </View>
        </View>

        <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>Remark (optional)</Eyebrow>
        <TextInput
          value={remark}
          onChangeText={setRemark}
          placeholder="e.g. Lunch with a supplier"
          placeholderTextColor={colorTheme.ink3}
          style={[styles.textInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
          multiline
        />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2, paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton onPress={save} disabled={!canSave}>
          <Icon name="check" size={19} color="#fff" stroke={2.4} />
          <BtnLabel>Add {type === 'income' ? 'income' : 'expense'}</BtnLabel>
        </PrimaryButton>
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

      <SplitSheet
        visible={splitting}
        gross={Math.round(amount * 100) / 100}
        merchant={merchant.trim() || undefined}
        initial={activeSplit}
        onClose={() => setSplitting(false)}
        onApply={(draft) => {
          setSplit(draft);
          setSplitting(false);
        }}
        onRemove={activeSplit ? () => { setSplit(null); setSplitting(false); } : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toggle: { flexDirection: 'row', borderRadius: 999, padding: 4, marginBottom: 18, borderWidth: 1 },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999 },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14 },
  toggleTextOn: {},
  textInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: uiFont(600),
    fontSize: 16,
  },
  dateHint: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 6, marginLeft: 2 },
  dateHintBad: { color: '#c5402f' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14 },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  addChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed' },
  addChipText: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  splitRowOff: { opacity: 0.6 },
  splitTitle: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitSub: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
});
