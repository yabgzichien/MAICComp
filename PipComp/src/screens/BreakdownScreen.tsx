import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { PieChart } from '../components/PieChart';
import { Amount, Card, CatBadge, Eyebrow, TopBar, ValueToggle, type ValueMode } from '../components/ui';
import { catColorsForHue } from '../lib/catColors';
import { currentMonthKey, txnMonthKey } from '../lib/budget';
import { monthName } from '../lib/dates';
import { fmt } from '../lib/format';
import type { Category, TxnType } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, shadowToggle, uiFont } from '../theme';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };

export function BreakdownScreen({ onBack, onOpenCategory }: { onBack: () => void; onOpenCategory: (categoryId: string) => void }) {
  const insets = useSafeAreaInsets();
  const { transactions, catById } = useAppData();
  const [kind, setKind] = useState<TxnType>('expense');
  const [mode, setMode] = useState<ValueMode>('amount');

  const monthTxns = useMemo(() => {
    const cur = currentMonthKey();
    return transactions.filter((t) => t.type === kind && txnMonthKey(t) === cur);
  }, [transactions, kind]);
  const total = useMemo(() => monthTxns.reduce((s, t) => s + t.amount, 0), [monthTxns]);

  const breakdown = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const t of monthTxns) {
      const id = t.categoryId ?? (kind === 'income' ? 'income' : 'other');
      byCat[id] = (byCat[id] ?? 0) + t.amount;
    }
    return Object.entries(byCat)
      .map(([catId, amt]) => ({ catId, amt }))
      .sort((a, b) => b.amt - a.amt);
  }, [monthTxns, kind]);

  const pieData = breakdown.map((b) => ({ value: b.amt, color: catColorsForHue((catById[b.catId] ?? fallback).hue).solid }));

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title={kind === 'expense' ? 'Where it goes' : 'Where it comes from'} onBack={onBack} right={<ValueToggle mode={mode} onChange={setMode} />} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        {/* kind toggle */}
        <View style={styles.toggle}>
          {(['expense', 'income'] as TxnType[]).map((k) => {
            const on = kind === k;
            return (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.toggleBtn, on && styles.toggleBtnOn]}>
                <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{k === 'expense' ? 'Spending' : 'Income'}</Text>
              </Pressable>
            );
          })}
        </View>

        {breakdown.length === 0 ? (
          <Card style={{ padding: 26, alignItems: 'center' }}>
            <Text style={styles.emptyTitle}>Nothing this month</Text>
            <Text style={styles.emptySub}>No {kind === 'expense' ? 'spending' : 'income'} recorded for {monthName()}.</Text>
          </Card>
        ) : (
          <>
            <View style={styles.pieWrap}>
              <PieChart data={pieData} size={210} thickness={34} />
              <View style={[styles.pieCenter, { pointerEvents: 'none' }]}>
                <Text style={styles.pieEyebrow}>{monthName()}</Text>
                <Amount value={total} size={22} weight={700} color={kind === 'income' ? colors.accent : colors.ink} />
              </View>
            </View>

            <Eyebrow style={{ marginTop: 18, marginBottom: 10 }}>All categories · tap to view</Eyebrow>
            <Card style={{ overflow: 'hidden' }}>
              {breakdown.map((b, i) => {
                const cat = catById[b.catId] ?? fallback;
                const pctNum = total > 0 ? Math.round((b.amt / total) * 100) : 0;
                const primary = mode === 'amount' ? `RM ${fmt(b.amt)}` : `${pctNum}%`;
                const secondary = mode === 'amount' ? `${pctNum}%` : `RM ${fmt(b.amt)}`;
                return (
                  <Pressable
                    key={b.catId}
                    onPress={() => onOpenCategory(b.catId)}
                    style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: colors.surface2 }]}
                  >
                    <CatBadge category={cat} size={38} />
                    <Text style={styles.label} numberOfLines={1}>
                      {cat.label}
                    </Text>
                    <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                      <Text style={styles.primary}>{primary}</Text>
                      <Text style={styles.secondary}>{secondary}</Text>
                    </View>
                    <Icon name="chevronRight" size={15} color={colors.ink3} />
                  </Pressable>
                );
              })}
            </Card>
          </>
        )}
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
  toggleBtnOn: { backgroundColor: colors.surface, ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14, color: colors.ink2 },
  toggleTextOn: { color: colors.ink },
  pieWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  pieCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pieEyebrow: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink2, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  label: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  primary: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.ink },
  secondary: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 1 },
  emptyTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink },
  emptySub: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, marginTop: 6, textAlign: 'center' },
});
