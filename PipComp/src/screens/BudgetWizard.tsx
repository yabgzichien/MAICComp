// src/screens/BudgetWizard.tsx
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { Icon } from '../components/Icon';
import { Amount, BtnLabel, Card, CategoryChip, Eyebrow, PrimaryButton, ProgressTrack, TopBar } from '../components/ui';
import { CatBadge } from '../components/ui';
import { averageMonthlySpend, allocatedTotal, leftover } from '../lib/budget';
import { fmt } from '../lib/format';
import { useAppData } from '../state/store';
import { colors, numFont, radius, uiFont } from '../theme';

export function BudgetWizard({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { transactions, categories, saveBudget } = useAppData();
  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);
  const avg = useMemo(() => averageMonthlySpend(transactions, new Date(), 3), [transactions]);
  const avgIncome = useMemo(() => {
    // average monthly income over last 3 months
    const byMonth: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'income') continue;
      const mk = (t.date ?? t.createdAt).slice(0, 7);
      byMonth[mk] = (byMonth[mk] ?? 0) + t.amount;
    }
    const vals = Object.values(byMonth);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  }, [transactions]);

  const [step, setStep] = useState(0);
  const [incomeText, setIncomeText] = useState(avgIncome ? String(avgIncome) : '');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  const income = Math.max(0, parseFloat(incomeText.replace(/[^0-9.]/g, '')) || 0);
  const allocations = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of chosen) out[id] = Math.max(0, parseFloat((amounts[id] ?? '').replace(/[^0-9.]/g, '')) || 0);
    return out;
  }, [chosen, amounts]);
  const total = allocatedTotal(allocations);
  const left = leftover(income, allocations);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const autoFill = () => {
    setAmounts((prev) => {
      const next = { ...prev };
      for (const id of chosen) next[id] = String(avg[id] ?? 0);
      return next;
    });
  };

  const finish = async () => {
    await saveBudget(income, allocations);
    onDone();
  };

  const chosenCats = expenseCats.filter((c) => chosen.has(c.id));

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title="Set up budget"
          onBack={() => (step === 0 ? onDone() : setStep((s) => s - 1))}
          right={<Text style={styles.counter}>{step + 1}/3</Text>}
        />
        <View style={{ paddingHorizontal: 18, paddingTop: 2 }}>
          <ProgressTrack pct={((step + 1) / 3) * 100} height={5} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Eyebrow style={{ marginBottom: 10 }}>Expected monthly income</Eyebrow>
            <Card style={styles.incomeCard}>
              <Text style={styles.rm}>RM</Text>
              <TextInput
                value={incomeText}
                onChangeText={setIncomeText}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.ink3}
                style={styles.incomeInput}
                autoFocus
              />
            </Card>
            {avgIncome > 0 && <Text style={styles.hint}>Your recent average is RM {fmt(avgIncome)}.</Text>}
          </>
        )}

        {step === 1 && (
          <>
            <Eyebrow style={{ marginBottom: 10 }}>Pick categories to budget</Eyebrow>
            <View style={styles.grid}>
              {expenseCats.map((c) => (
                <View key={c.id} style={styles.gridCell}>
                  <CategoryChip category={c} selected={chosen.has(c.id)} suggested={false} onPress={() => toggle(c.id)} />
                </View>
              ))}
              <View style={styles.gridCell}>
                <PrimaryButton onPress={() => setAdding(true)} height={56}>
                  <Icon name="plus" size={16} color="#fff" stroke={2.2} />
                  <BtnLabel>New</BtnLabel>
                </PrimaryButton>
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Eyebrow style={{ marginBottom: 10 }}>Allocate amounts</Eyebrow>
            <PrimaryButton onPress={autoFill} height={44}>
              <Icon name="sparkles" size={16} color="#fff" />
              <BtnLabel>Auto-fill from history</BtnLabel>
            </PrimaryButton>
            <View style={{ height: 14 }} />
            {chosenCats.map((c) => (
              <Card key={c.id} style={styles.allocRow}>
                <CatBadge category={c} size={36} />
                <Text style={styles.allocLabel} numberOfLines={1}>{c.label}</Text>
                <View style={styles.allocInputWrap}>
                  <Text style={styles.rmSmall}>RM</Text>
                  <TextInput
                    value={amounts[c.id] ?? ''}
                    onChangeText={(v) => setAmounts((p) => ({ ...p, [c.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.ink3}
                    style={styles.allocInput}
                  />
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      {/* footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step === 2 && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              Allocated <Amount value={total} size={13} weight={700} /> of <Amount value={income} size={13} weight={700} />
            </Text>
            <Text style={[styles.summaryText, { color: left < 0 ? '#c5402f' : colors.accentInk }]}>
              {left < 0 ? `Over by RM ${fmt(-left)}` : `RM ${fmt(left)} left`}
            </Text>
          </View>
        )}
        <PrimaryButton
          onPress={() => (step < 2 ? setStep((s) => s + 1) : finish())}
          disabled={(step === 0 && income <= 0) || (step === 1 && chosen.size === 0)}
        >
          {step < 2 ? (
            <>
              <BtnLabel>Next</BtnLabel>
              <Icon name="arrowRight" size={19} color="#fff" />
            </>
          ) : (
            <>
              <BtnLabel>Save budget</BtnLabel>
              <Icon name="check" size={19} color="#fff" stroke={2.4} />
            </>
          )}
        </PrimaryButton>
      </View>

      <AddCategoryModal
        visible={adding}
        kind="expense"
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setChosen((prev) => new Set(prev).add(id));
          setAdding(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  counter: { fontFamily: uiFont(700), fontSize: 13, color: colors.ink3 },
  incomeCard: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 8 },
  rm: { fontFamily: numFont(600), fontSize: 22, color: colors.ink3 },
  incomeInput: { flex: 1, fontFamily: numFont(700), fontSize: 30, color: colors.ink, padding: 0 },
  rmSmall: { fontFamily: numFont(600), fontSize: 14, color: colors.ink3 },
  hint: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink3, marginTop: 10, marginLeft: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10 },
  allocLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  allocInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10 },
  allocInput: { fontFamily: numFont(700), fontSize: 16, color: colors.ink, minWidth: 80, textAlign: 'right', paddingVertical: 8 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line2 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2 },
});
