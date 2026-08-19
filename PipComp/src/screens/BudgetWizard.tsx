// src/screens/BudgetWizard.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { BenchmarkPicker } from '../components/BenchmarkPicker';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { Amount, BtnLabel, Card, CategoryChip, Eyebrow, PrimaryButton, ProgressTrack, TopBar } from '../components/ui';
import { CatBadge } from '../components/ui';
import { getBenchmark } from '../lib/belanjawanku';
import { buildBelanjawankuBudget } from '../lib/belanjawankuBudget';
import { averageMonthlySpend, allocatedTotal, leftover } from '../lib/budget';
import { fmt } from '../lib/format';
import { baselineExplanation, computeIncomeBaseline } from '../lib/incomeBaseline';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { numFont, radius, uiFont } from '../theme';

export function BudgetWizard({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const {
    transactions,
    categories,
    saveBudget,
    householdProfile,
    guideCity,
    setBenchmarkProfile,
    savingsTarget,
    setSavingsTarget,
  } = useAppData();
  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);
  const avg = useMemo(() => averageMonthlySpend(transactions, new Date(), 3), [transactions]);
  const income6 = useMemo(() => computeIncomeBaseline(transactions), [transactions]);
  const benchmark = useMemo(() => getBenchmark(householdProfile, guideCity), [householdProfile, guideCity]);
  // An irregular earner is prefilled with their safe floor, not their average: budgeting a gig
  // income at its mean guarantees a shortfall in every below-average month, which is most of them.
  const suggestedIncome = income6.irregular ? income6.baseline : income6.average;

  const [step, setStep] = useState(0);
  const [incomeText, setIncomeText] = useState(suggestedIncome ? String(suggestedIncome) : '');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [pickingHousehold, setPickingHousehold] = useState(false);
  const [guideNotice, setGuideNotice] = useState<string | null>(null);
  // Pay-yourself-first is part of the plan, not a side note, so it gets a real row and is saved
  // with the budget. It is deliberately NOT a category allocation: savings is not spending, and
  // giving it a category would pollute the expense taxonomy the adherence maths runs on.
  const [savingsText, setSavingsText] = useState(String(savingsTarget));

  const income = Math.max(0, parseFloat(incomeText.replace(/[^0-9.]/g, '')) || 0);
  const savings = Math.max(0, parseFloat(savingsText.replace(/[^0-9.]/g, '')) || 0);
  const allocations = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of chosen) out[id] = Math.max(0, parseFloat((amounts[id] ?? '').replace(/[^0-9.]/g, '')) || 0);
    return out;
  }, [chosen, amounts]);
  const total = allocatedTotal(allocations);
  const left = leftover(income, allocations) - savings;

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const autoFill = () => {
    setGuideNotice(null);
    setAmounts((prev) => {
      const next = { ...prev };
      for (const id of chosen) next[id] = String(avg[id] ?? 0);
      return next;
    });
  };

  /** Fill every chosen category from the national reference budget, scaled to this income. */
  const fillFromGuide = () => {
    const template = buildBelanjawankuBudget({
      income,
      benchmark,
      actualByCategory: avg,
      categoryIds: [...chosen],
      categoryLabels: Object.fromEntries(expenseCats.map((c) => [c.id, c.label])),
      savingsTarget: savings,
    });
    setAmounts((prev) => {
      const next = { ...prev };
      for (const id of chosen) next[id] = String(template.allocations[id] ?? 0);
      return next;
    });
    setSavingsText(String(template.savings));
    setGuideNotice(
      template.belowGuideIncome
        ? `Your income is RM ${fmt(template.shortfall)} short of what the guide says this household needs, so every essential has been scaled down to fit. That shortfall comes from your income, not a mistake in the budget.`
        : `Essentials are set at the guide, with RM ${fmt(template.savings)} kept back for savings first.`
    );
  };

  const finish = async () => {
    await saveBudget(income, allocations);
    // The savings commitment made here is what the Budget screen's habit card tracks from now on.
    await setSavingsTarget(savings);
    onDone();
  };

  /** Select exactly the categories the guide has a figure for, plus any obligation already recorded. */
  const useGuideCategories = () => {
    const benchmarked = benchmark.lines.flatMap((l) => l.categoryIds);
    const committed = expenseCats.filter((c) => !benchmarked.includes(c.id) && (avg[c.id] ?? 0) > 0);
    setChosen(new Set([...benchmarked, ...committed.map((c) => c.id)].filter((id) => expenseCats.some((c) => c.id === id))));
  };

  const chosenCats = expenseCats.filter((c) => chosen.has(c.id));

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title="Set up budget"
          onBack={() => (step === 0 ? onDone() : setStep((s) => s - 1))}
          right={<Text style={[styles.counter, { color: colorTheme.ink2 }]}>{step + 1}/3</Text>}
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
              <Text style={[styles.rm, { color: colorTheme.ink2 }]}>RM</Text>
              <TextInput
                value={incomeText}
                onChangeText={setIncomeText}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colorTheme.ink3}
                style={[styles.incomeInput, { color: colorTheme.ink }]}
                autoFocus
              />
            </Card>
            {income6.months > 0 && (
              <>
                {income6.irregular ? (
                  <Text style={[styles.hint, { color: colorTheme.ink2 }]}>
                    Your income swings between RM {fmt(income6.low)} and RM {fmt(income6.high)}, so Pip
                    suggests planning against RM {fmt(income6.baseline)}. {baselineExplanation(income6)}
                  </Text>
                ) : (
                  <Text style={[styles.hint, { color: colorTheme.ink2 }]}>Your recent average is RM {fmt(income6.average)}.</Text>
                )}
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Eyebrow style={{ marginBottom: 10 }}>Pick categories to budget</Eyebrow>
            {/* Makes the guide path coherent end to end: without this, "Start from Belanjawanku"
                only fills whichever categories the user happened to tick, and its success notice
                would overstate a budget that covers three of them. */}
            <Pressable
              onPress={useGuideCategories}
              style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: colorTheme.surface, borderColor: theme.accentSoft, marginBottom: 14, opacity: pressed ? 0.8 : 1 }]}
              accessibilityRole="button"
            >
              <Icon name="scale" size={15} color={theme.accent} />
              <Text style={[styles.secondaryText, { color: theme.accent }]}>Use the guide's categories</Text>
            </Pressable>
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
            <View style={styles.guideInfoRow}>
              <Text style={[styles.guideInfoLabel, { color: colorTheme.ink2 }]}>Belanjawanku</Text>
              <InfoButton entry="belanjawanku" />
            </View>
            <PrimaryButton onPress={fillFromGuide} height={44}>
              <Icon name="scale" size={16} color={theme.accentInk} />
              <BtnLabel>Start from Belanjawanku</BtnLabel>
            </PrimaryButton>
            <Pressable
              onPress={() => setPickingHousehold(true)}
              style={({ pressed }) => [styles.guideRow, { borderColor: colorTheme.line2, backgroundColor: colorTheme.surface2, opacity: pressed ? 0.8 : 1 }]}
              accessibilityRole="button"
            >
              <Text style={[styles.guideRowText, { color: colorTheme.ink2 }]} numberOfLines={1}>
                {benchmark.profileLabel} · {benchmark.cityLabel}
              </Text>
              <Text style={[styles.guideRowChange, { color: theme.accent }]}>Change</Text>
            </Pressable>
            {guideNotice ? <Text style={[styles.guideNotice, { color: colorTheme.ink2 }]}>{guideNotice}</Text> : null}
            <View style={{ height: 12 }} />
            <Pressable onPress={autoFill} style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: colorTheme.surface, borderColor: theme.accentSoft, opacity: pressed ? 0.8 : 1 }]}>
              <Icon name="sparkles" size={15} color={theme.accent} />
              <Text style={[styles.secondaryText, { color: theme.accent }]}>Auto-fill from my history instead</Text>
            </Pressable>
            <View style={{ height: 14 }} />

            {/* Savings sits at the top of the list, ahead of every spending row, because that is
                literally what pay-yourself-first means. */}
            <Card style={[styles.allocRow, styles.savingsRow, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={[styles.savingsBadge, { backgroundColor: colorTheme.surface }]}>
                <Icon name="shield" size={18} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.allocLabel, { color: colorTheme.ink }]} numberOfLines={1}>Kept for savings</Text>
                {benchmark.savings > 0 && (
                  <Text style={[styles.allocGuide, { color: colorTheme.ink2 }]} numberOfLines={1}>Guide: RM {fmt(benchmark.savings)}</Text>
                )}
              </View>
              <View style={[styles.allocInputWrap, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                <Text style={[styles.rmSmall, { color: colorTheme.ink2 }]}>RM</Text>
                <TextInput
                  value={savingsText}
                  onChangeText={setSavingsText}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colorTheme.ink3}
                  style={[styles.allocInput, { color: colorTheme.ink }]}
                  accessibilityLabel="Monthly savings"
                />
              </View>
            </Card>

            {chosenCats.map((c) => {
              const line = benchmark.lines.find((l) => l.categoryIds.includes(c.id));
              return (
                <Card key={c.id} style={styles.allocRow}>
                  <CatBadge category={c} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.allocLabel, { color: colorTheme.ink }]} numberOfLines={1}>{c.label}</Text>
                    {line && (
                      <Text style={[styles.allocGuide, { color: colorTheme.ink2 }]} numberOfLines={1}>
                        Guide: RM {fmt(line.amount)}
                        {line.categoryIds.length > 1 ? ` for ${line.label.toLowerCase()}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.allocInputWrap, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                    <Text style={[styles.rmSmall, { color: colorTheme.ink2 }]}>RM</Text>
                    <TextInput
                      value={amounts[c.id] ?? ''}
                      onChangeText={(v) => setAmounts((p) => ({ ...p, [c.id]: v }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.allocInput, { color: colorTheme.ink }]}
                    />
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* footer */}
      <View style={[styles.footer, { backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2, paddingBottom: insets.bottom + 16 }]}>
        {step === 2 && (
          <View style={{ marginBottom: 10 }}>
            <View style={styles.summary}>
              <Text style={[styles.summaryText, { color: colorTheme.ink2 }]}>
                Allocated <Amount value={total} size={13} weight={700} /> of <Amount value={income} size={13} weight={700} />
              </Text>
              <Text style={[styles.summaryText, { color: left < 0 ? '#c5402f' : theme.accentInk }]}>
                {left < 0 ? `Over by RM ${fmt(-left)}` : `RM ${fmt(left)} left`}
              </Text>
            </View>
            {/* Named explicitly so the savings commitment is never silently folded into "left". */}
            {savings > 0 && (
              <Text style={[styles.savingsFootnote, { color: colorTheme.ink2 }]}>Plus RM {fmt(savings)} kept for savings.</Text>
            )}
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

      <BenchmarkPicker
        visible={pickingHousehold}
        profile={householdProfile}
        city={guideCity}
        onClose={() => setPickingHousehold(false)}
        onSave={(p, c) => {
          void setBenchmarkProfile(p, c);
          setPickingHousehold(false);
          setGuideNotice(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  counter: { fontFamily: uiFont(700), fontSize: 13 },
  incomeCard: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 8 },
  rm: { fontFamily: numFont(600), fontSize: 22 },
  incomeInput: { flex: 1, fontFamily: numFont(700), fontSize: 30, padding: 0 },
  rmSmall: { fontFamily: numFont(600), fontSize: 14 },
  hint: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 10, marginLeft: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10 },
  allocLabel: { fontFamily: uiFont(600), fontSize: 14.5 },
  allocGuide: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2 },
  guideRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1 },
  guideRowText: { flex: 1, fontFamily: uiFont(600), fontSize: 13 },
  guideRowChange: { fontFamily: uiFont(700), fontSize: 12.5 },
  guideNotice: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  guideInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  guideInfoLabel: { fontFamily: uiFont(600), fontSize: 12.5 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  secondaryText: { fontFamily: uiFont(700), fontSize: 13 },
  allocInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 10 },
  allocInput: { fontFamily: numFont(700), fontSize: 16, minWidth: 80, textAlign: 'right', paddingVertical: 8 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
  summary: { flexDirection: 'row', justifyContent: 'space-between' },
  savingsRow: {},
  savingsBadge: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  savingsFootnote: { fontFamily: uiFont(500), fontSize: 12, marginTop: 6 },
  summaryText: { fontFamily: uiFont(600), fontSize: 13 },
});
