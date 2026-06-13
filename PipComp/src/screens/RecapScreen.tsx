// src/screens/RecapScreen.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BudgetProgressList, STATUS_COLOR } from '../components/BudgetProgressList';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { Amount, Card, CatBadge, Eyebrow, TopBar } from '../components/ui';
import { monthKey } from '../lib/budget';
import { monthLabel } from '../lib/dates';
import { fmt } from '../lib/format';
import { availableMonths, computeAdherence, monthlyIncomeStatement, spentByCategory } from '../lib/recap';
import { netWorthSeries } from '../lib/networth';
import type { Category } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, uiFont } from '../theme';

/** The 'YYYY-MM' before the given one. */
function prevMonthKey(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };

export function RecapScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { transactions, catById, snapshots, accounts, balanceEntries } = useAppData();

  const snapshotMonths = useMemo(() => Object.keys(snapshots), [snapshots]);
  const months = useMemo(
    () => availableMonths(transactions, snapshotMonths),
    [transactions, snapshotMonths]
  );
  const [selected, setSelected] = useState<string>(() => monthKey(new Date().toISOString())!);
  const month = months.includes(selected) ? selected : months[0];

  const statement = useMemo(() => monthlyIncomeStatement(transactions, month), [transactions, month]);
  const spentByCat = useMemo(() => spentByCategory(transactions, month), [transactions, month]);
  const snapshot = snapshots[month];
  const allocations = snapshot?.allocations ?? {};
  const adherence = useMemo(() => computeAdherence(allocations, spentByCat), [allocations, spentByCat]);
  const hasBudget = Object.keys(allocations).length > 0;

  // Month-end net worth for the selected month and the one before it.
  const networth = useMemo(() => {
    if (accounts.length === 0) return null;
    const [prev, curr] = netWorthSeries(accounts, balanceEntries, [prevMonthKey(month), month]);
    return { net: curr.net, delta: curr.net - prev.net };
  }, [accounts, balanceEntries, month]);

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Monthly recap" onBack={onBack} />
      </View>

      {/* month filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthStrip}
      >
        {months.map((mk) => {
          const on = mk === month;
          return (
            <Pressable key={mk} onPress={() => setSelected(mk)} style={[styles.monthChip, on && styles.monthChipOn]}>
              <Text style={[styles.monthChipText, on && styles.monthChipTextOn]}>{monthLabel(mk, false)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <Eyebrow style={{ marginBottom: 10 }}>{monthLabel(month)}</Eyebrow>

        {/* income statement */}
        <Card style={{ padding: 18 }}>
          <View style={styles.stmtRow}>
            <Text style={styles.stmtLabel}>Income</Text>
            <Amount value={statement.income} size={16} weight={600} color={colors.ink} />
          </View>
          <View style={[styles.stmtRow, styles.divider]}>
            <Text style={styles.stmtLabel}>Expenses</Text>
            <Text style={styles.stmtMinus}>− <Amount value={statement.expenses} size={16} weight={600} color={colors.ink} /></Text>
          </View>
          <View style={[styles.stmtRow, styles.netRow]}>
            <Text style={styles.netLabel}>Net</Text>
            <Text style={[styles.netSign, { color: statement.net >= 0 ? colors.accent : STATUS_COLOR.over }]}>
              {statement.net >= 0 ? '+' : '−'}
              <Amount value={Math.abs(statement.net)} size={22} weight={700} color={statement.net >= 0 ? colors.accent : STATUS_COLOR.over} />
            </Text>
          </View>
        </Card>

        {networth && (
          <Card style={[styles.stmtRow, { padding: 16, marginTop: 12 }]}>
            <View>
              <Text style={styles.netLabel}>Net worth</Text>
              <Text style={styles.nwDelta}>
                {networth.delta === 0
                  ? 'No change vs last month'
                  : `${networth.delta > 0 ? '▲' : '▼'} RM ${fmt(Math.abs(networth.delta))} vs last month`}
              </Text>
            </View>
            <Text style={[styles.netSign, { color: networth.net >= 0 ? colors.accent : STATUS_COLOR.over }]}>
              {networth.net < 0 ? '−' : ''}
              <Amount value={Math.abs(networth.net)} size={20} weight={700} color={networth.net >= 0 ? colors.accent : STATUS_COLOR.over} />
            </Text>
          </Card>
        )}

        {/* per-category target vs actual */}
        <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Target vs actual</Eyebrow>
        {hasBudget ? (
          <BudgetProgressList allocations={allocations} spentByCat={spentByCat} catById={catById} />
        ) : (
          <Card style={styles.notePad}>
            <Text style={styles.noteText}>No budget was recorded for this month, so there's no target to compare against.</Text>
          </Card>
        )}

        {/* improvement insights */}
        {hasBudget && (
          <>
            <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Where to improve</Eyebrow>
            <Card style={{ padding: 16 }}>
              <View style={styles.insightHead}>
                <Pip size={32} expr={adherence.overspends.length === 0 ? 'happy' : 'idle'} />
                <Text style={styles.adherence}>
                  Stayed within budget in {adherence.withinCount} of {adherence.totalBudgeted} categories.
                </Text>
              </View>

              {adherence.overspends.length === 0 ? (
                <Text style={styles.allGood}>Nice — nothing went over target this month. 🎉</Text>
              ) : (
                <View style={{ marginTop: 6 }}>
                  {adherence.overspends.slice(0, 3).map((o) => {
                    const cat = catById[o.catId] ?? fallback;
                    return (
                      <View key={o.catId} style={styles.overRow}>
                        <CatBadge category={cat} size={32} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.overLabel} numberOfLines={1}>{cat.label}</Text>
                          <Text style={styles.overSub}>RM {fmt(o.spent)} spent of {fmt(o.allocated)}</Text>
                        </View>
                        <Text style={styles.overAmt}>+RM {fmt(o.over)}{o.allocated > 0 ? ` · ${o.pct}%` : ''}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  monthStrip: { paddingHorizontal: 18, paddingBottom: 10, gap: 8 },
  monthChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line2 },
  monthChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  monthChipText: { fontFamily: uiFont(700), fontSize: 13, color: colors.ink2 },
  monthChipTextOn: { color: '#fff' },
  stmtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  stmtLabel: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink2 },
  stmtMinus: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  netRow: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 2, paddingTop: 14 },
  netLabel: { fontFamily: uiFont(700), fontSize: 15, color: colors.ink },
  nwDelta: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, marginTop: 3 },
  netSign: { fontFamily: uiFont(700), fontSize: 18 },
  notePad: { padding: 16 },
  noteText: { fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 19, color: colors.ink2 },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  adherence: { flex: 1, fontFamily: uiFont(700), fontSize: 14, lineHeight: 19, color: colors.ink },
  allGood: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, marginTop: 4 },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  overLabel: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  overSub: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 2 },
  overAmt: { fontFamily: uiFont(700), fontSize: 13, color: STATUS_COLOR.over },
});
