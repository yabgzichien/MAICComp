import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { Icon } from '../components/Icon';
import { Amount, B, BtnLabel, BubbleText, Card, CategoryChip, PipSays, PrimaryButton, ProgressTrack, TopBar } from '../components/ui';
import { applyDateEdit, fullDateWithWeekday, ISO_DATE_RE, isValidIsoDate, shortDate } from '../lib/dates';
import { findDuplicate, todayISO } from '../lib/duplicates';
import { fmt } from '../lib/format';
import { DROP, type Category, type CategorySuggestion, type ExtractedTxn, type TxnType } from '../lib/types';
import { useAccent, useAccentAlert } from '../state/accent';
import { useAppData } from '../state/store';
import { colors, numFont, shadowToggle, uiFont } from '../theme';

export function CategorizeScreen({
  extracted,
  suggestions,
  categories,
  onBack,
  onComplete,
}: {
  extracted: ExtractedTxn[];
  suggestions: (CategorySuggestion | null)[];
  categories: Category[];
  onBack: () => void;
  onComplete: (assignments: (string | null)[], items: ExtractedTxn[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const { transactions } = useAppData();
  const theme = useAccent();
  const { setAlert } = useAccentAlert();
  const today = useMemo(() => todayISO(), []);

  const expenseGrid = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);
  const incomeGrid = useMemo(() => categories.filter((c) => c.kind === 'income'), [categories]);

  // Editable working copy (amount can be changed inline).
  const [items, setItems] = useState<ExtractedTxn[]>(() => extracted.map((e) => ({ ...e })));
  // Every item is a step now  income included (so it can be dropped / dup-warned).
  const stepIndices = useMemo(() => items.map((_, i) => i), [items]);

  const [assignments, setAssignments] = useState<(string | null)[]>(() =>
    extracted.map((_, i) => suggestions[i]?.categoryId ?? null)
  );
  const [acked, setAcked] = useState<Record<number, boolean>>({});
  const [step, setStep] = useState(0);
  const [adding, setAdding] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;

  const hasSteps = stepIndices.length > 0;
  const safeStep = Math.min(step, Math.max(0, stepIndices.length - 1));
  const originalIndex = hasSteps ? stepIndices[safeStep] : -1;
  const item = hasSteps ? items[originalIndex] : null;
  const isIncome = item?.type === 'income';
  const sel = hasSteps ? assignments[originalIndex] : null;
  const rawSuggestion = hasSteps ? suggestions[originalIndex] : null;
  // Ignore a suggestion that no longer matches the item's kind
  // (e.g. after the user flips it between expense and income).
  const suggestionValid = !!rawSuggestion && categories.find((c) => c.id === rawSuggestion.categoryId)?.kind === item?.type;
  const suggestion = suggestionValid ? rawSuggestion!.categoryId : null;
  const suggestionIsGuess = suggestionValid && rawSuggestion!.source === 'guess';
  const activeGrid = isIncome ? incomeGrid : expenseGrid;
  const suggestionCat = suggestion ? categories.find((c) => c.id === suggestion) : undefined;
  const isLast = safeStep === stepIndices.length - 1;
  const confirming = !!sel && sel === suggestion;

  const dup = item ? findDuplicate(transactions, { merchant: item.merchant, amount: item.amount, date: item.date }, today) : null;
  const showBanner = !!dup && !acked[originalIndex];
  const dupDay = dup ? shortDate(dup.date ?? dup.createdAt) : '';
  const keptCount = stepIndices.filter((i) => assignments[i] !== DROP).length;

  useEffect(() => {
    fade.setValue(0);
    slide.setValue(20);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [safeStep, fade, slide]);

  useEffect(() => {
    setAlert(showBanner);
  }, [showBanner, setAlert]);

  useEffect(() => () => setAlert(false), [setAlert]);

  const setCat = (catId: string) => {
    setAssignments((prev) => {
      const next = [...prev];
      next[originalIndex] = catId;
      return next;
    });
  };

  const setAmount = (amount: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], amount };
      return next;
    });
  };

  // Editing the date can rewrite the *whole batch* (year-propagation), so it
  // goes through the pure helper rather than a single-field splice.
  const setDate = (date: string | null) => {
    setItems((prev) => applyDateEdit(prev, originalIndex, date));
  };

  // Flip an item between expense and income; clears the category pick since the
  // available categories change with the kind.
  const setType = (t: TxnType) => {
    if (!item || t === item.type) return;
    setItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], type: t };
      return next;
    });
    setAssignments((prev) => {
      const next = [...prev];
      next[originalIndex] = null;
      return next;
    });
  };

  const advanceOrFinish = (nextAssignments: (string | null)[]) => {
    if (isLast) onComplete(nextAssignments, items);
    else setStep((s) => s + 1);
  };

  const dropCurrent = () => {
    const next = [...assignments];
    next[originalIndex] = DROP;
    setAssignments(next);
    advanceOrFinish(next);
  };

  const addAnyway = () => setAcked((a) => ({ ...a, [originalIndex]: true }));

  const go = (dir: number) => {
    if (dir > 0 && isLast) {
      onComplete(assignments, items);
      return;
    }
    if (dir < 0 && safeStep === 0) {
      onBack();
      return;
    }
    setStep((s) => s + dir);
  };

  if (!hasSteps) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title="Categorize"
          onBack={() => go(-1)}
          right={
            <Text style={styles.counter}>
              {safeStep + 1}/{stepIndices.length}
            </Text>
          }
        />
        <View style={{ paddingHorizontal: 18, paddingTop: 2 }}>
          <ProgressTrack pct={(safeStep / stepIndices.length) * 100} height={5} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 150 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fade, transform: [{ translateX: slide }] }}>
          <PipSays expr={showBanner ? 'curious' : isIncome ? 'happy' : suggestion ? 'idle' : 'curious'}>
            {showBanner ? (
              <BubbleText>
                Hmm. <B>‘{item!.merchant}’</B> looks like a duplicate of one you logged on <B>{dupDay}</B>.
              </BubbleText>
            ) : suggestion && suggestionCat && suggestionIsGuess ? (
              <BubbleText>
                ‘{item!.merchant}’. I think this might be <B>{suggestionCat.label}</B>. Does that look right?
              </BubbleText>
            ) : suggestion && suggestionCat ? (
              <BubbleText>
                ‘{item!.merchant}’. I’ve pre-filled <B>{suggestionCat.label}</B> from last time.
              </BubbleText>
            ) : isIncome ? (
              <BubbleText>
                ‘{item!.merchant}’. Money <B>received</B>. What kind of income?
              </BubbleText>
            ) : (
              <BubbleText>
                What was <B>‘{item!.merchant}’</B> for?
              </BubbleText>
            )}
          </PipSays>

          {/* amount + date focus (both editable) */}
          <Card style={[styles.focus, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusMerchant} numberOfLines={1}>
                {item!.merchant}
              </Text>
              {item!.method ? <Text style={styles.focusSub}>{item!.method}</Text> : null}
              <DateEditor value={item!.date} onChange={setDate} />
            </View>
            <AmountEditor value={item!.amount} income={isIncome} onChange={setAmount} />
          </Card>

          {showBanner ? (
            <View style={[styles.banner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.bannerHead}>
                <Icon name="alert" size={18} color={theme.accentInk} stroke={2} />
                <Text style={[styles.bannerTitle, { color: theme.accentInk }]}>Possible duplicate</Text>
              </View>
              <Text style={styles.bannerText}>
                You already logged <B>{item!.merchant}</B> for RM {fmt(item!.amount)} on {dupDay}. Record it again?
              </Text>
              <View style={styles.bannerBtns}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton onPress={dropCurrent} height={48}>
                    <Icon name="trash" size={17} color="#fff" />
                    <BtnLabel>Skip it</BtnLabel>
                  </PrimaryButton>
                </View>
                <Pressable onPress={addAnyway} style={styles.ghostBtn}>
                  <Text style={[styles.ghostText, { color: theme.accentInk }]}>Add anyway</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.typeToggle}>
                {(['expense', 'income'] as TxnType[]).map((k) => {
                  const on = item!.type === k;
                  return (
                    <Pressable key={k} onPress={() => setType(k)} style={[styles.typeBtn, on && styles.typeBtnOn]}>
                      <Text style={[styles.typeText, on && styles.typeTextOn]}>{k === 'expense' ? 'Expense' : 'Income'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.grid}>
                {activeGrid.map((c) => (
                <View key={c.id} style={styles.gridCell}>
                  <CategoryChip
                    category={c}
                    selected={sel === c.id}
                    suggested={suggestion === c.id ? (suggestionIsGuess ? 'guess' : 'learned') : false}
                    onPress={() => setCat(c.id)}
                  />
                </View>
              ))}
              <View style={styles.gridCell}>
                <Pressable onPress={() => setAdding(true)} style={styles.addChip}>
                  <Icon name="plus" size={16} color={colors.accent} stroke={2.2} />
                  <Text style={styles.addChipText}>New category</Text>
                </Pressable>
              </View>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {!showBanner && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable onPress={dropCurrent} style={styles.dropLink} hitSlop={6}>
            <Icon name="x" size={14} color={colors.ink3} />
            <Text style={styles.dropLinkText}>Don’t record this one</Text>
          </Pressable>
          <PrimaryButton onPress={() => go(1)} disabled={!sel || sel === DROP}>
            {isLast ? (
              <>
                <BtnLabel>Finish · {keptCount} saved</BtnLabel>
                <Icon name="check" size={19} color="#fff" stroke={2.4} />
              </>
            ) : confirming && suggestionCat ? (
              <>
                <BtnLabel>Confirm {suggestionCat.label}</BtnLabel>
                <Icon name="arrowRight" size={19} color="#fff" />
              </>
            ) : (
              <>
                <BtnLabel>Next</BtnLabel>
                <Icon name="arrowRight" size={19} color="#fff" />
              </>
            )}
          </PrimaryButton>
        </View>
      )}

      <AddCategoryModal
        visible={adding}
        kind={isIncome ? 'income' : 'expense'}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setCat(id);
          setAdding(false);
        }}
      />
    </View>
  );
}

/** Tap the amount to edit it inline. */
function AmountEditor({ value, income, onChange }: { value: number; income: boolean; onChange: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value.toFixed(2));

  useEffect(() => {
    if (!editing) setText(value.toFixed(2));
  }, [value, editing]);

  const commit = () => {
    const n = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100) / 100);
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={styles.amountEditRow}>
        <Text style={styles.rmPrefix}>RM</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
          onBlur={commit}
          onSubmitEditing={commit}
          style={styles.amountInput}
        />
      </View>
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.amountTap}>
      <Amount value={value} size={26} weight={700} color={income ? colors.accent : colors.ink} />
      <Icon name="pencil" size={15} color={colors.ink3} />
    </Pressable>
  );
}

/** Tap the date to edit it inline, as a `YYYY-MM-DD` string (mirrors AmountEditor). */
function DateEditor({ value, onChange }: { value: string | null; onChange: (d: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    if (!editing) setText(value ?? '');
  }, [value, editing]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) onChange(null);
    else if (ISO_DATE_RE.test(trimmed) && isValidIsoDate(trimmed)) onChange(trimmed);
    // else: leave the date unchanged (invalid input is dropped, not saved)
    setEditing(false);
  };

  if (editing) {
    return (
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.ink3}
        autoFocus
        selectTextOnFocus
        onBlur={commit}
        onSubmitEditing={commit}
        style={styles.dateInput}
      />
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.dateTap}>
      <Icon name="clock" size={13} color={colors.ink3} />
      <Text style={styles.dateText}>{value ? fullDateWithWeekday(value) : 'Add date'}</Text>
      <Icon name="pencil" size={13} color={colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  counter: { fontFamily: uiFont(700), fontSize: 13, color: colors.ink2 },
  focus: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusMerchant: { fontFamily: uiFont(700), fontSize: 16, color: colors.ink },
  focusSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  dateTap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start' },
  dateText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },
  dateInput: {
    fontFamily: uiFont(600),
    fontSize: 12.5,
    color: colors.ink,
    marginTop: 6,
    minWidth: 120,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  amountTap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amountEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rmPrefix: { fontFamily: numFont(600), fontSize: 16, color: colors.ink2 },
  amountInput: {
    fontFamily: numFont(700),
    fontSize: 24,
    color: colors.ink,
    minWidth: 96,
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  typeToggle: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: 999, padding: 4, marginTop: 16, borderWidth: 1, borderColor: colors.line2 },
  typeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
  typeBtnOn: { backgroundColor: colors.surface, ...shadowToggle },
  typeText: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink2 },
  typeTextOn: { color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    borderStyle: 'dashed',
    backgroundColor: colors.accentTint,
  },
  addChipText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.accent },
  incomeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  incomeNoteText: { fontFamily: uiFont(600), fontSize: 14, color: colors.accentInk },
  banner: { marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bannerTitle: { fontFamily: uiFont(700), fontSize: 14.5 },
  bannerText: { fontFamily: uiFont(500), fontSize: 14, lineHeight: 20, color: colors.ink, marginBottom: 14 },
  bannerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  ghostText: { fontFamily: uiFont(700), fontSize: 14.5 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
  },
  dropLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 2 },
  dropLinkText: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink2 },
});
