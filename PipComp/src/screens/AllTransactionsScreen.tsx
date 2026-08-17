import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditTransactionModal } from '../components/EditTransactionModal';
import { Icon } from '../components/Icon';
import { Amount, Card, CatBadge, Eyebrow, IconButton, TopBar } from '../components/ui';
import { shortDate } from '../lib/dates';
import { fmt } from '../lib/format';
import { confirmAction } from '../lib/platformAlert';
import { outstanding } from '../lib/split';
import type { Category, Transaction } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, uiFont } from '../theme';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };

export function AllTransactionsScreen({
  onBack,
  filterCategoryId,
  onClearFilter,
  onOpenOwed,
}: {
  onBack: () => void;
  filterCategoryId?: string | null;
  onClearFilter: () => void;
  onOpenOwed: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { transactions, catById, removeMany, splits, shares, openShares } = useAppData();

  /** txnId -> what is still owed on that bill, so a small row can explain itself. */
  const owedByTxn = useMemo(() => {
    const openBySplit: Record<string, number> = {};
    for (const s of shares) {
      if (s.status !== 'open') continue;
      openBySplit[s.splitId] = (openBySplit[s.splitId] ?? 0) + outstanding(s);
    }
    const map: Record<string, { owed: number; gross: number }> = {};
    for (const split of splits) {
      const owed = openBySplit[split.id] ?? 0;
      if (owed > 0) map[split.txnId] = { owed, gross: split.gross };
    }
    return map;
  }, [splits, shares]);

  const owedTotal = useMemo(() => openShares.reduce((s, x) => s + x.outstanding, 0), [openShares]);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = !!filterCategoryId;
  const shown = useMemo(
    () => (filtered ? transactions.filter((t) => (t.categoryId ?? 'other') === filterCategoryId) : transactions),
    [transactions, filterCategoryId, filtered]
  );
  const filterCat = filterCategoryId ? catById[filterCategoryId] ?? fallback : null;

  const totalSpent = useMemo(
    () => transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const totalIncome = useMemo(
    () => transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const filterTotal = useMemo(() => shown.reduce((s, t) => s + t.amount, 0), [shown]);

  const enterSelect = (id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  };
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const cancelSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const deleteSelected = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    confirmAction('Delete selected?', `Remove ${ids.length} transaction${ids.length === 1 ? '' : 's'}? This can’t be undone.`, 'Delete', async () => {
      await removeMany(ids);
      cancelSelect();
    });
  };
  const onRowPress = (t: Transaction) => {
    if (selectMode) toggleSelect(t.id);
    else setEditing(t);
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        {selectMode ? (
          <View style={styles.selectBar}>
            <IconButton name="x" onPress={cancelSelect} size={19} />
            <Text style={styles.selectTitle}>{selected.size} selected</Text>
            <Pressable onPress={deleteSelected} hitSlop={8} style={styles.delAction} disabled={selected.size === 0}>
              <Icon name="trash" size={20} color={selected.size === 0 ? colors.ink3 : '#b3261e'} />
            </Pressable>
          </View>
        ) : (
          <TopBar title={filtered ? filterCat?.label ?? 'Filtered' : 'All transactions'} onBack={onBack} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        {filtered && !selectMode && (
          <Pressable onPress={onClearFilter} style={styles.filterChip}>
            {filterCat && <CatBadge category={filterCat} size={28} rad={8} />}
            <Text style={styles.filterText}>
              {shown.length} in {filterCat?.label} · RM {filterTotal.toFixed(2)}
            </Text>
            <View style={styles.clearPill}>
              <Icon name="x" size={12} color={colors.ink2} />
              <Text style={styles.clearText}>Clear</Text>
            </View>
          </Pressable>
        )}

        {owedTotal > 0 && !selectMode && (
          <Pressable onPress={onOpenOwed} style={styles.owedBanner}>
            <Icon name="gift" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.owedTitle}>RM {fmt(owedTotal)} owed to you</Text>
              <Text style={styles.owedSub}>
                From {openShares.length} shared {openShares.length === 1 ? 'bill' : 'bills'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.ink3} />
          </Pressable>
        )}

        {shown.length === 0 ? (
          <Card style={{ padding: 26, alignItems: 'center' }}>
            <Text style={styles.emptyTitle}>{filtered ? 'Nothing in this category' : 'No transactions yet'}</Text>
            <Text style={styles.emptySub}>{filtered ? 'Try clearing the filter.' : 'Tap Add to scan a receipt or a statement.'}</Text>
          </Card>
        ) : (
          <>
            {!filtered && (
              <View style={styles.summary}>
                <Card style={styles.summaryCard}>
                  <Eyebrow>Spent</Eyebrow>
                  <Amount value={totalSpent} size={20} weight={700} />
                </Card>
                <Card style={styles.summaryCard}>
                  <Eyebrow>Received</Eyebrow>
                  <Amount value={totalIncome} size={20} weight={700} color={colors.accent} />
                </Card>
              </View>
            )}

            <Text style={styles.countLine}>
              {selectMode
                ? 'Tap to select'
                : `${shown.length} record${shown.length === 1 ? '' : 's'} · tap to edit, long-press to select`}
            </Text>

            <Card style={{ overflow: 'hidden' }}>
              {shown.map((t, i) => {
                const cat = catById[t.categoryId ?? 'other'] ?? fallback;
                const income = t.type === 'income';
                const isSel = selected.has(t.id);
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => onRowPress(t)}
                    onLongPress={() => enterSelect(t.id)}
                    delayLongPress={250}
                    style={({ pressed }) => [styles.row, i > 0 && styles.divider, (pressed || isSel) && { backgroundColor: colors.surface2 }]}
                  >
                    {selectMode && (
                      <View style={[styles.checkbox, isSel && styles.checkboxOn]}>
                        {isSel && <Icon name="check" size={13} color="#fff" stroke={2.6} />}
                      </View>
                    )}
                    <CatBadge category={cat} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.merchant} numberOfLines={1}>
                        {t.merchantRaw}
                      </Text>
                      <Text style={styles.sub}>
                        {cat.label} · {shortDate(t.date ?? t.createdAt)}
                      </Text>
                      {t.remark ? (
                        <Text style={styles.remark} numberOfLines={1}>
                          {t.remark}
                        </Text>
                      ) : null}
                      {/* A split row shows only the payer's share, which reads as a suspiciously
                          cheap dinner without this. */}
                      {owedByTxn[t.id] && (
                        <View style={styles.owedChip}>
                          <Icon name="gift" size={10} color={colors.accentInk} />
                          <Text style={styles.owedChipText}>
                            RM {fmt(owedByTxn[t.id].owed)} owed · split of RM {fmt(owedByTxn[t.id].gross)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Amount value={t.amount} size={15} weight={600} color={income ? colors.accent : colors.ink} />
                    {!selectMode && <Icon name="pencil" size={15} color={colors.ink3} />}
                  </Pressable>
                );
              })}
            </Card>
          </>
        )}
      </ScrollView>

      <EditTransactionModal txn={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  selectBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 6 },
  selectTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 18, color: colors.ink },
  delAction: { width: 42, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterText: { flex: 1, fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink },
  clearPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface2, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  clearText: { fontFamily: uiFont(600), fontSize: 12, color: colors.ink2 },
  summary: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 16, gap: 8 },
  countLine: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginBottom: 10, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  merchant: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  sub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 1 },
  remark: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 1, fontStyle: 'italic' },
  owedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  owedTitle: { fontFamily: uiFont(700), fontSize: 14, color: colors.ink },
  owedSub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 1 },
  owedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
  },
  owedChipText: { fontFamily: uiFont(600), fontSize: 10.5, color: colors.accentInk },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, marginTop: 6, textAlign: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
