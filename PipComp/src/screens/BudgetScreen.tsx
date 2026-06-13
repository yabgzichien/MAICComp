// src/screens/BudgetScreen.tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BudgetProgressList } from '../components/BudgetProgressList';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { Amount, BtnLabel, Card, CatBadge, Eyebrow, PrimaryButton, ProgressTrack, TopBar } from '../components/ui';
import { allocatedTotal, averageMonthlySpend, budgetHash, categoryStatus, currentMonthKey, leftover, txnMonthKey } from '../lib/budget';
import { monthName } from '../lib/dates';
import { fmt } from '../lib/format';
import type { Category } from '../lib/types';
import { getProvider, llmErrorMessage } from '../llm';
import { buildBudgetPrompt, COACH_SYSTEM_PROMPT } from '../llm/budgetPrompt';
import { configFor, loadSettings } from '../settings/settingsStore';
import { useAppData } from '../state/store';
import { colors, uiFont } from '../theme';
import { BudgetWizard } from './BudgetWizard';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };
const STATUS_COLOR = { ok: '#1f8a5b', warn: '#d98a00', over: '#c5402f' } as const;

export function BudgetScreen({ onBack, onOpenRecap = () => {} }: { onBack: () => void; onOpenRecap?: () => void }) {
  const insets = useSafeAreaInsets();
  const { transactions, catById, expectedIncome, allocations, hasBudget, getCachedAdvice, saveAdvice } = useAppData();
  const [editing, setEditing] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [adviceErr, setAdviceErr] = useState('');

  const monthExpenses = useMemo(() => {
    const cur = currentMonthKey();
    return transactions.filter((t) => t.type === 'expense' && txnMonthKey(t) === cur);
  }, [transactions]);
  const spentByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthExpenses) m[t.categoryId ?? 'other'] = (m[t.categoryId ?? 'other'] ?? 0) + t.amount;
    return m;
  }, [monthExpenses]);

  const allocated = allocatedTotal(allocations);
  const left = leftover(expectedIncome, allocations);
  const budgetedIds = Object.keys(allocations);
  const unbudgetedSpent = useMemo(
    () => Object.entries(spentByCat).filter(([id]) => !budgetedIds.includes(id)).reduce((s, [, v]) => s + v, 0),
    [spentByCat, budgetedIds]
  );

  if (editing || !hasBudget) {
    return <BudgetWizard onDone={() => { setEditing(false); }} />;
  }

  const askPip = async () => {
    setAdviceErr('');
    const hash = budgetHash(expectedIncome, allocations);
    const cached = await getCachedAdvice();
    if (cached && cached.hash === hash) {
      setAdvice(cached.text);
      return;
    }
    setAdviceBusy(true);
    try {
      const c = configFor(await loadSettings(), 'general');
      const avg = averageMonthlySpend(transactions, new Date(), 3);
      const lines = budgetedIds.map((id) => ({
        label: (catById[id] ?? fallback).label,
        allocated: allocations[id],
        recentAverage: avg[id] ?? 0,
      }));
      const text = await getProvider(c.provider).coach({
        apiKey: c.apiKey,
        model: c.model,
        system: COACH_SYSTEM_PROMPT,
        prompt: buildBudgetPrompt(expectedIncome, left, lines),
      });
      setAdvice(text);
      await saveAdvice(expectedIncome, allocations, text);
    } catch (e) {
      setAdviceErr(llmErrorMessage(e));
    } finally {
      setAdviceBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Budget" onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        {/* summary */}
        <Card style={{ padding: 18 }}>
          <View style={styles.rowBetween}>
            <View>
              <Eyebrow>Income</Eyebrow>
              <Amount value={expectedIncome} size={22} weight={700} />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Eyebrow>{left < 0 ? 'Over' : 'Unallocated'}</Eyebrow>
              <Amount value={Math.abs(left)} size={22} weight={700} color={left < 0 ? STATUS_COLOR.over : colors.accent} />
            </View>
          </View>
          <View style={{ marginTop: 14 }}>
            <ProgressTrack pct={expectedIncome > 0 ? (allocated / expectedIncome) * 100 : 0} />
            <Text style={styles.muted}>Allocated RM {fmt(allocated)} of RM {fmt(expectedIncome)}</Text>
          </View>
        </Card>

        {/* Ask Pip */}
        <Card style={styles.adviceCard}>
          <View style={styles.adviceHead}>
            <Pip size={34} expr="idle" />
            <Text style={styles.adviceTitle}>Pip's budget tip</Text>
          </View>
          {advice ? <Text style={styles.adviceText}>{advice}</Text> : <Text style={styles.muted}>Tap for a quick take on your plan.</Text>}
          {adviceErr ? <Text style={[styles.muted, { color: STATUS_COLOR.over }]}>{adviceErr}</Text> : null}
          <Pressable onPress={askPip} style={styles.askBtn} disabled={adviceBusy}>
            {adviceBusy ? <ActivityIndicator size="small" color={colors.accent} /> : (
              <>
                <Icon name="sparkles" size={15} color={colors.accent} />
                <Text style={styles.askText}>{advice ? 'Refresh' : 'Ask Pip'}</Text>
              </>
            )}
          </Pressable>
        </Card>

        {/* per-category */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>This month · {monthName()}</Eyebrow>
        <BudgetProgressList allocations={allocations} spentByCat={spentByCat} catById={catById} />

        <Pressable onPress={onOpenRecap} style={({ pressed }) => [styles.recapLink, { opacity: pressed ? 0.9 : 1 }]}>
          <Icon name="trending" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.recapTitle}>Monthly recap</Text>
            <Text style={styles.recapSub}>See how each month stacked up against target.</Text>
          </View>
          <Icon name="chevronRight" size={17} color={colors.ink3} />
        </Pressable>

        <View style={{ marginTop: 18 }}>
          <PrimaryButton onPress={() => setEditing(true)} height={50}>
            <Icon name="pencil" size={17} color="#fff" />
            <BtnLabel>Edit budget</BtnLabel>
          </PrimaryButton>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 6 },
  adviceCard: { padding: 16, marginTop: 14, backgroundColor: colors.accentTint, borderColor: colors.accentSoft },
  adviceHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  adviceTitle: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.accentInk },
  adviceText: { fontFamily: uiFont(500), fontSize: 14, lineHeight: 20, color: colors.ink },
  askBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentSoft },
  askText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.accent },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  catLabel: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink, flex: 1 },
  catNums: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },
  barTrack: { height: 6, borderRadius: 999, backgroundColor: colors.line, overflow: 'hidden', marginTop: 7 },
  remaining: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 4 },
  unbudgetedIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  recapLink: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, padding: 16, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line2 },
  recapTitle: { fontFamily: uiFont(700), fontSize: 15, color: colors.ink },
  recapSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink3, marginTop: 1 },
});
