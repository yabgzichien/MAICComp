import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { Icon } from '../components/Icon';
import { SplitSheet } from '../components/SplitSheet';
import { Amount, B, BtnLabel, BubbleText, Card, CategoryChip, PipSays, PrimaryButton, ProgressTrack, TopBar } from '../components/ui';
import { applyDateEdit, fullDateWithWeekday, ISO_DATE_RE, isValidIsoDate, shortDate } from '../lib/dates';
import { findDuplicate, todayISO } from '../lib/duplicates';
import { fmt } from '../lib/format';
import { CLASS_BY_ID } from '../lib/networth';
import { suggestSettlement } from '../lib/split';
import { DROP, type Category, type CategorySuggestion, type ExtractedTxn, type SplitDraft, type TxnType } from '../lib/types';
import type { IconName } from '../components/Icon';
import { useAccent, useAccentAlert } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { numFont, shadowToggle, uiFont } from '../theme';

/**
 * An inbound row the user confirmed is a friend paying them back. It is deliberately NOT saved
 * as a transaction: being repaid is a receivable turning into cash, not income, so the row is
 * dropped from the batch and this settles the share instead.
 */
export interface PendingSettlement {
  shareId: string;
  amount: number;
  paidOn: string;
  merchant: string;
  personName: string;
}

export function CategorizeScreen({
  extracted,
  suggestions,
  categories,
  linkId = null,
  onBack,
  onComplete,
}: {
  extracted: ExtractedTxn[];
  suggestions: (CategorySuggestion | null)[];
  categories: Category[];
  /** Account the whole scanned batch is linked to, if any — shown on each card. */
  linkId?: string | null;
  onBack: () => void;
  onComplete: (
    assignments: (string | null)[],
    items: ExtractedTxn[],
    splitDrafts: (SplitDraft | null)[],
    settlements: (PendingSettlement | null)[]
  ) => void;
}) {
  const insets = useSafeAreaInsets();
  const { transactions, accounts, openShares } = useAppData();
  // The ledger as it stood when this batch opened. Deliberately frozen: `commitCategorized`
  // writes the batch on the last Finish tap, the store's `transactions` then updates while this
  // screen is still mounted, and every row suddenly matches ITSELF — which is what flashed the
  // yellow "possible duplicate" banner for one frame before the parent swapped in All sorted.
  // A row can only duplicate something that was already there when the judge started sorting.
  const ledgerAtOpen = useRef(transactions).current;
  const linkedAccount = useMemo(() => (linkId ? accounts.find((a) => a.id === linkId) ?? null : null), [linkId, accounts]);
  const theme = useAccent();
  const colorTheme = useThemeColors();
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
  const [splitting, setSplitting] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<(SplitDraft | null)[]>(() => extracted.map(() => null));
  const [settlements, setSettlements] = useState<(PendingSettlement | null)[]>(() => extracted.map(() => null));
  /** Inbound rows the user has told us are NOT a repayment, so we stop asking. */
  const [notRepayment, setNotRepayment] = useState<Record<number, boolean>>({});

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

  const dup = item ? findDuplicate(ledgerAtOpen, { merchant: item.merchant, amount: item.amount, date: item.date }, today) : null;
  const showBanner = !!dup && !acked[originalIndex];
  const dupDay = dup ? shortDate(dup.date ?? dup.createdAt) : '';
  const keptCount = stepIndices.filter((i) => assignments[i] !== DROP).length;

  const activeSplit = hasSteps ? splitDrafts[originalIndex] : null;

  // Only inbound rows can be a repayment, and only while the duplicate banner is not already
  // holding the screen. Recomputed per step rather than up front so an amount edit re-matches.
  const settlementHit = useMemo(() => {
    if (!item || item.type !== 'income' || showBanner || notRepayment[originalIndex]) return null;
    return suggestSettlement(openShares, { merchant: item.merchant, amount: item.amount, date: item.date }, today);
  }, [item, showBanner, notRepayment, originalIndex, openShares, today]);
  const showSettlement = !!settlementHit;

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
  const setRemark = (remark: string | null) => {
    setItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], remark };
      return next;
    });
  };

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

  // The overrides matter on the LAST step: state updates have not landed by the time this
  // finishes the batch, so whatever the caller just decided has to be handed over directly.
  const advanceOrFinish = (
    nextAssignments: (string | null)[],
    nextSettlements: (PendingSettlement | null)[] = settlements
  ) => {
    if (isLast) onComplete(nextAssignments, items, splitDrafts, nextSettlements);
    else setStep((s) => s + 1);
  };

  const dropCurrent = () => {
    const next = [...assignments];
    next[originalIndex] = DROP;
    setAssignments(next);
    advanceOrFinish(next);
  };

  const applySplit = (draft: SplitDraft | null) => {
    setSplitDrafts((prev) => {
      const next = [...prev];
      next[originalIndex] = draft;
      return next;
    });
    setSplitting(false);
  };

  /**
   * Confirm an inbound row is a repayment. The row is dropped from the batch (no income
   * transaction is written) and the share is settled after the commit instead.
   */
  const acceptSettlement = () => {
    if (!settlementHit) return;
    const nextSettlements = [...settlements];
    nextSettlements[originalIndex] = {
      shareId: settlementHit.share.shareId,
      amount: settlementHit.amount,
      paidOn: item!.date ?? today,
      merchant: item!.merchant,
      personName: settlementHit.share.personName,
    };
    setSettlements(nextSettlements);

    const nextAssignments = [...assignments];
    nextAssignments[originalIndex] = DROP;
    setAssignments(nextAssignments);
    advanceOrFinish(nextAssignments, nextSettlements);
  };

  const addAnyway = () => setAcked((a) => ({ ...a, [originalIndex]: true }));

  const go = (dir: number) => {
    if (dir > 0 && isLast) {
      onComplete(assignments, items, splitDrafts, settlements);
      return;
    }
    if (dir < 0 && safeStep === 0) {
      onBack();
      return;
    }
    setStep((s) => s + dir);
  };

  if (!hasSteps) {
    return <View style={[styles.root, { backgroundColor: colorTheme.bg }]} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title="Categorize"
          onBack={() => go(-1)}
          right={
            <Text style={[styles.counter, { color: colorTheme.ink2 }]}>
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
              <Text style={[styles.focusMerchant, { color: colorTheme.ink }]} numberOfLines={1}>
                {item!.merchant}
              </Text>
              {linkedAccount ? (
                <View style={styles.acctRow}>
                  <Icon name={(CLASS_BY_ID[linkedAccount.cls]?.icon ?? 'wallet') as IconName} size={12} color={colorTheme.ink3} />
                  <Text style={[styles.focusSub, { color: colorTheme.ink2 }]} numberOfLines={1}>{linkedAccount.name}</Text>
                </View>
              ) : item!.method ? (
                <Text style={[styles.focusSub, { color: colorTheme.ink2 }]}>{item!.method}</Text>
              ) : null}
              <DateEditor value={item!.date} onChange={setDate} />
              <RemarkEditor value={item!.remark ?? null} onChange={setRemark} />
            </View>
            <AmountEditor value={item!.amount} income={isIncome} onChange={setAmount} />
          </Card>

          {!isIncome && !showBanner && (
            <Pressable
              onPress={() => setSplitting(true)}
              style={[styles.splitRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}
              hitSlop={4}
            >
              <Icon name="gift" size={17} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.splitTitle, { color: colorTheme.ink }]}>
                  {activeSplit ? `Your share: RM ${fmt(activeSplit.ownShare)}` : 'Split with friends'}
                </Text>
                <Text style={[styles.splitSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                  {activeSplit
                    ? `RM ${fmt(activeSplit.gross - activeSplit.ownShare)} owed back to you`
                    : 'Paid for the table? Record only your share'}
                </Text>
              </View>
              <Icon name="chevronRight" size={17} color={colorTheme.ink3} />
            </Pressable>
          )}

          {showBanner ? (
            <View style={[styles.banner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.bannerHead}>
                <Icon name="alert" size={18} color={theme.accentInk} stroke={2} />
                <Text style={[styles.bannerTitle, { color: theme.onTint }]}>Possible duplicate</Text>
              </View>
              <Text style={[styles.bannerText, { color: colorTheme.ink }]}>
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
          ) : showSettlement ? (
            <View style={[styles.banner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.bannerHead}>
                <Icon name="gift" size={18} color={theme.accentInk} stroke={2} />
                <Text style={[styles.bannerTitle, { color: theme.onTint }]}>
                  {settlementHit!.partial ? 'Part of a repayment?' : 'Paying you back?'}
                </Text>
              </View>
              <Text style={[styles.bannerText, { color: colorTheme.ink }]}>
                This looks like <B>{settlementHit!.share.personName}</B> settling{' '}
                {settlementHit!.partial ? 'part of ' : ''}what they owe you for{' '}
                <B>{settlementHit!.share.merchant}</B> (RM {fmt(settlementHit!.share.outstanding)} outstanding).
                {'\n'}It clears the debt instead of counting as income.
              </Text>
              <View style={styles.bannerBtns}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton onPress={acceptSettlement} height={48}>
                    <Icon name="check" size={17} color="#fff" stroke={2.4} />
                    <BtnLabel>Yes, they paid me back</BtnLabel>
                  </PrimaryButton>
                </View>
                <Pressable
                  onPress={() => setNotRepayment((m) => ({ ...m, [originalIndex]: true }))}
                  style={styles.ghostBtn}
                >
                  <Text style={[styles.ghostText, { color: theme.accentInk }]}>No, it’s income</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View style={[styles.typeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
                {(['expense', 'income'] as TxnType[]).map((k) => {
                  const on = item!.type === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setType(k)}
                      style={[styles.typeBtn, on && styles.typeBtnOn, on && { backgroundColor: colorTheme.surface }]}
                    >
                      <Text style={[styles.typeText, { color: colorTheme.ink2 }, on && styles.typeTextOn, on && { color: colorTheme.ink }]}>
                        {k === 'expense' ? 'Expense' : 'Income'}
                      </Text>
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
                <Pressable
                  onPress={() => setAdding(true)}
                  style={[styles.addChip, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}
                >
                  <Icon name="plus" size={16} color={theme.accent} stroke={2.2} />
                  <Text style={[styles.addChipText, { color: theme.accent }]}>New category</Text>
                </Pressable>
              </View>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {!showBanner && !showSettlement && (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 16, backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2 },
          ]}
        >
          <Pressable onPress={dropCurrent} style={styles.dropLink} hitSlop={6}>
            <Icon name="x" size={14} color={colorTheme.ink3} />
            <Text style={[styles.dropLinkText, { color: colorTheme.ink2 }]}>Don’t record this one</Text>
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

      <SplitSheet
        visible={splitting}
        gross={item?.amount ?? 0}
        merchant={item?.merchant}
        initial={activeSplit}
        onClose={() => setSplitting(false)}
        onApply={applySplit}
        onRemove={activeSplit ? () => applySplit(null) : undefined}
      />
    </View>
  );
}

/** Tap the amount to edit it inline. */
function AmountEditor({ value, income, onChange }: { value: number; income: boolean; onChange: (n: number) => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
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
        <Text style={[styles.rmPrefix, { color: colorTheme.ink2 }]}>RM</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
          onBlur={commit}
          onSubmitEditing={commit}
          style={[styles.amountInput, { borderColor: theme.accent, color: colorTheme.ink, backgroundColor: colorTheme.surface2 }]}
        />
      </View>
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.amountTap}>
      <Amount value={value} size={26} weight={700} color={income ? theme.accent : colorTheme.ink} />
      <Icon name="pencil" size={15} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** Tap the date to edit it inline, as a `YYYY-MM-DD` string (mirrors AmountEditor). */
function DateEditor({ value, onChange }: { value: string | null; onChange: (d: string | null) => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
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
        placeholderTextColor={colorTheme.ink3}
        autoFocus
        selectTextOnFocus
        onBlur={commit}
        onSubmitEditing={commit}
        style={[styles.dateInput, { borderColor: theme.accent, color: colorTheme.ink, backgroundColor: colorTheme.surface2 }]}
      />
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.dateTap}>
      <Icon name="clock" size={13} color={colorTheme.ink3} />
      <Text style={[styles.dateText, { color: colorTheme.ink2 }]}>{value ? fullDateWithWeekday(value) : 'Add date'}</Text>
      <Icon name="pencil" size={13} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** Tap to add or edit a short free-text remark (mirrors DateEditor). Never extracted from the
 *  screenshot; purely something the user types during review. */
function RemarkEditor({ value, onChange }: { value: string | null; onChange: (r: string | null) => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    if (!editing) setText(value ?? '');
  }, [value, editing]);

  const commit = () => {
    const trimmed = text.trim();
    onChange(trimmed || null);
    setEditing(false);
  };

  if (editing) {
    return (
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Add a remark"
        placeholderTextColor={colorTheme.ink3}
        autoFocus
        onBlur={commit}
        onSubmitEditing={commit}
        style={[styles.remarkInput, { borderColor: theme.accent, color: colorTheme.ink, backgroundColor: colorTheme.surface2 }]}
      />
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.dateTap}>
      <Icon name="pencil" size={13} color={colorTheme.ink3} />
      <Text style={[styles.dateText, { color: colorTheme.ink2 }]} numberOfLines={1}>{value || 'Add a remark'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  counter: { fontFamily: uiFont(700), fontSize: 13 },
  focus: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusMerchant: { fontFamily: uiFont(700), fontSize: 16 },
  focusSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 2, flexShrink: 1 },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dateTap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  dateText: { fontFamily: uiFont(600), fontSize: 12.5, flexShrink: 1 },
  remarkInput: {
    fontFamily: uiFont(600),
    fontSize: 12.5,
    marginTop: 6,
    minWidth: 160,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateInput: {
    fontFamily: uiFont(600),
    fontSize: 12.5,
    marginTop: 6,
    minWidth: 120,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  amountTap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amountEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rmPrefix: { fontFamily: numFont(600), fontSize: 16 },
  amountInput: {
    fontFamily: numFont(700),
    fontSize: 24,
    minWidth: 96,
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeToggle: { flexDirection: 'row', borderRadius: 999, padding: 4, marginTop: 16, borderWidth: 1 },
  typeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
  typeBtnOn: { ...shadowToggle },
  typeText: { fontFamily: uiFont(600), fontSize: 13.5 },
  typeTextOn: {},
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
    borderStyle: 'dashed',
  },
  addChipText: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  splitTitle: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitSub: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2 },
  incomeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  incomeNoteText: { fontFamily: uiFont(600), fontSize: 14 },
  banner: { marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bannerTitle: { fontFamily: uiFont(700), fontSize: 14.5 },
  bannerText: { fontFamily: uiFont(500), fontSize: 14, lineHeight: 20, marginBottom: 14 },
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
    borderTopWidth: 1,
  },
  dropLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 2 },
  dropLinkText: { fontFamily: uiFont(600), fontSize: 13.5 },
});
