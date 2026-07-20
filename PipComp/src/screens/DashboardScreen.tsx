import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BudgetProgressList } from '../components/BudgetProgressList';
import { CoinMascot } from '../components/CoinMascot';
import { FadeIn } from '../components/Motion';
import { Icon, type IconName } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { Pip } from '../components/Pip';
import { ScoreBandBar } from '../components/ScoreBandBar';
import { Amount, BtnLabel, Card, Eyebrow, PrimaryButton } from '../components/ui';
import { TourAnchor } from '../components/TourAnchor';
import { catColorsForHue } from '../lib/catColors';
import { currentMonthKey, txnMonthKey } from '../lib/budget';
import { greeting, longDate, monthName } from '../lib/dates';
import { fmt } from '../lib/format';
import { computeStreak } from '../lib/streak';
import { BORROWER_TOUR_STEPS, clampTourStep } from '../lib/tourSteps';
import type { Category } from '../lib/types';
import { useAppData } from '../state/store';
import { useCreditProfile } from '../state/useCreditProfile';
import { useNow } from '../state/useNow';
import { colors, numFont, platformShadow, shadowCard, uiFont } from '../theme';

const RED = colors.red;
const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };

const dayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function DashboardScreen({
  onScan,
  onOpenCategories,
  onOpenAll,
  onOpenBreakdown,
  onOpenBudget = () => {},
  onOpenRecap = () => {},
  onOpenNetWorth = () => {},
  onOpenCredit = () => {},
  onOpenPassport = () => {},
  onOpenCoach = () => {},
}: {
  onScan: () => void;
  onOpenCategories: () => void;
  onOpenAll: () => void;
  onOpenBreakdown: () => void;
  onOpenBudget?: () => void;
  onOpenRecap?: () => void;
  onOpenNetWorth?: () => void;
  onOpenCredit?: () => void;
  onOpenPassport?: () => void;
  onOpenCoach?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { transactions, catById, allocations, hasBudget, coverage, tourActive, tourStepIndex, startTour, adoptApprovedOffers } = useAppData();
  const { score, dataConfidence } = useCreditProfile();
  const activeTourAnchor = tourActive ? BORROWER_TOUR_STEPS[clampTourStep(tourStepIndex, BORROWER_TOUR_STEPS.length)].anchorId ?? null : null;

  // Poll the approved-offer back-channel on Home focus (approval-notify, 2026-07-19): if an
  // officer approved a referred application since the last visit, this auto-books it and bumps
  // the unseen badge on the Loan tab  so the borrower notices the new financing without
  // needing to open My Financing first. Best-effort; an unreachable console degrades silently.
  useEffect(() => {
    adoptApprovedOffers(score.score).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthTxns = useMemo(() => {
    const cur = currentMonthKey();
    return transactions.filter((t) => txnMonthKey(t) === cur);
  }, [transactions]);
  const monthExpenses = useMemo(() => monthTxns.filter((t) => t.type === 'expense'), [monthTxns]);
  const spent = useMemo(() => monthExpenses.reduce((s, t) => s + t.amount, 0), [monthExpenses]);
  const received = useMemo(
    () => monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [monthTxns]
  );
  const net = received - spent;

  const spentByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthExpenses) m[t.categoryId ?? 'other'] = (m[t.categoryId ?? 'other'] ?? 0) + t.amount;
    return m;
  }, [monthExpenses]);

  const breakdown = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const t of monthExpenses) {
      const id = t.categoryId ?? 'other';
      byCat[id] = (byCat[id] ?? 0) + t.amount;
    }
    return Object.entries(byCat)
      .map(([catId, amt]) => ({ catId, amt }))
      .sort((a, b) => b.amt - a.amt);
  }, [monthExpenses]);

  const empty = transactions.length === 0;
  const streak = useMemo(() => computeStreak(transactions), [transactions]);

  // Last-7-day activity tracker for the streak card.
  const dots = useMemo(() => {
    const active = new Set<string>();
    for (const t of transactions) {
      const k = t.date ?? dayKey(new Date(t.createdAt));
      active.add(k);
    }
    return [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return active.has(dayKey(d));
    });
  }, [transactions]);

  return (
    <FadeIn style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{longDate(now)}</Text>
            <Text style={styles.greeting}>{greeting(now)}</Text>
          </View>
          <View style={styles.headerActions}>
            <HeaderIcon name="trending" onPress={onOpenRecap} />
            <HeaderIcon name="sliders" onPress={onOpenCategories} />
            <Pressable
              style={styles.pipBubble}
              onPress={() => void startTour({ fresh: true })}
              accessibilityRole="button"
              accessibilityLabel="Restart the guided tour"
              hitSlop={8}
            >
              <CoinMascot size={40} float />
            </Pressable>
          </View>
        </View>

        {empty ? (
          <EmptyState />
        ) : (
          <>
            {/* 1  Streak */}
            <TourAnchor id="coverage-chip" activeId={activeTourAnchor}>
              <StreakCard streak={streak} dots={dots} coverage={coverage.daysCovered} onPress={onOpenCoach} />
            </TourAnchor>

            {/* 2  Cash flow + where it goes */}
            <CashFlowCard
              net={net}
              received={received}
              spent={spent}
              breakdown={breakdown}
              catById={catById}
              onSeeAll={onOpenBreakdown}
            />

            {/* 3  Compact credit card */}
            <TourAnchor id="credit-hero-card" activeId={activeTourAnchor}>
              <CreditCompactCard
                score={score.score}
                band={score.band}
                confidence={dataConfidence.confidence}
                onPress={onOpenCredit}
              />
            </TourAnchor>

            {/* Quick actions */}
            <QuickActions
              onOpenCredit={onOpenCredit}
              onOpenBudget={onOpenBudget}
              onOpenNetWorth={onOpenNetWorth}
              onOpenPassport={onOpenPassport}
            />

            {/* This month budget (kept) */}
            <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
              {hasBudget ? (
                <>
                  <View style={styles.sectionHead}>
                    <Eyebrow>This month · {monthName()}</Eyebrow>
                    <Pressable onPress={onOpenBudget} hitSlop={8}>
                      <Text style={styles.seeAll}>Manage</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={onOpenBudget} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
                    <BudgetProgressList allocations={allocations} spentByCat={spentByCat} catById={catById} />
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={onOpenBudget} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
                  <Card style={styles.budgetCta}>
                    <View style={styles.ctaIcon}>
                      <Icon name="wallet" size={22} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ctaTitle}>Set a monthly budget</Text>
                      <Text style={styles.ctaSub}>Plan income and allocate spend per category.</Text>
                    </View>
                    <Icon name="chevronRight" size={18} color={colors.ink3} />
                  </Card>
                </Pressable>
              )}
            </View>

            {/* Ask Pip strip */}
            <AskPipStrip onPress={onOpenCredit} />
          </>
        )}

        {/* Scan CTA (kept  the core capture loop) */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <PrimaryButton onPress={onScan} height={54}>
            <Icon name="camera" size={21} color="#fff" />
            <BtnLabel>Scan a receipt</BtnLabel>
            <Icon name="sparkles" size={16} color="#fff" />
          </PrimaryButton>
        </View>
      </ScrollView>
    </FadeIn>
  );
}

/* ── header utility icon ── */
function HeaderIcon({ name, onPress }: { name: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.headerIcon, pressed && { transform: [{ scale: 0.92 }] }]}>
      <Icon name={name} size={17} color={colors.ink2} />
    </Pressable>
  );
}

/* ── Streak card ── */
function StreakCard({ streak, dots, coverage, onPress }: { streak: number; dots: boolean[]; coverage: number; onPress?: () => void }) {
  // Subtle flame flicker  driven entirely on the native thread (no per-frame JS).
  const flicker = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [flicker]);
  const flameStyle = {
    opacity: flicker.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
    transform: [
      { translateY: flicker.interpolate({ inputRange: [0, 1], outputRange: [0, -1.2] }) },
      { scaleX: flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
      { scaleY: flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) },
    ],
  };
  const card = (
    <Card style={styles.streakCard}>
      <View style={styles.streakLeft}>
        <View style={styles.flameTile}>
          <Animated.View style={flameStyle}>
            <Svg width={18} height={21} viewBox="0 0 18 22" fill="none">
              <Path d="M9 1C9 1 14.5 6.5 14.5 11.5C14.5 15 12 17.5 9 17.5C6 17.5 3.5 15 3.5 11.5C3.5 8.5 5.5 6.5 5.5 6.5C5.5 6.5 6 9.5 9 9.5C9 9.5 7.5 7.5 9 4C9.5 5.5 11.5 7.5 11.5 9.5C13 8 12.5 5.5 11 3.5C14 5.5 15.5 8.5 15.5 11.5C15.5 16.5 12.5 20.5 9 21.5C5.5 20.5 2.5 16.5 2.5 11.5C2.5 5.5 9 1 9 1Z" fill={colors.amber} />
              <Path d="M9 13.5C9 13.5 11 12 11 10.5C10.5 11.5 9 11.5 9 11.5C9 11.5 9.5 10 9 9C8.5 10 7 11.5 7 12.5C7 13.6 7.9 14.5 9 14.5C8.7 14 9 13.5 9 13.5Z" fill="#FAC438" />
            </Svg>
          </Animated.View>
        </View>
        <View>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      </View>
      <View style={styles.streakDivider} />
      <View style={{ flex: 1 }}>
        <View style={styles.dotsRow}>
          {dots.map((done, i) => (
            <View key={i} style={[styles.dot, done ? styles.dotDone : styles.dotTodo]}>
              {done && (
                <Svg width={10} height={8} viewBox="0 0 10 8" fill="none">
                  <Path d="M1 4l2.8 3L9 1" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.streakBest}>
          <Text style={{ color: colors.ink2 }}>Covered </Text>
          <Text style={styles.streakBestNum}>{coverage}/90 days</Text>
        </Text>
      </View>
    </Card>
  );
  if (!onPress) return card;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open the coach's coverage lever">
      {card}
    </Pressable>
  );
}

/* ── Cash-flow card ── */
function CashFlowCard({
  net,
  received,
  spent,
  breakdown,
  catById,
  onSeeAll,
}: {
  net: number;
  received: number;
  spent: number;
  breakdown: { catId: string; amt: number }[];
  catById: Record<string, Category>;
  onSeeAll: () => void;
}) {
  const pos = net >= 0;
  return (
    <Card style={styles.cashCard}>
      <View style={styles.cashTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.eyebrowRow}>
            <Eyebrow>Net cash flow · {monthName()}</Eyebrow>
            <InfoButton entry="net_cash_flow" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
            <Text style={[styles.cashSign, { color: pos ? colors.accent : RED }]}>{pos ? '+' : '−'}</Text>
            <Amount value={Math.abs(net)} size={30} weight={700} color={pos ? colors.accent : RED} />
          </View>
          <Text style={styles.cashSub}>Income − Expenses · this month</Text>
        </View>
        <View style={styles.incomeBadge}>
          <Text style={styles.incomeAmt}>RM {fmt(received)}</Text>
          <Text style={styles.incomeLabel}>income</Text>
        </View>
      </View>

      {breakdown.length > 0 && (
        <>
          <View style={styles.cashDivider} />
          <View style={styles.sectionHead}>
            <View style={styles.eyebrowRow}>
              <Eyebrow>Where it goes</Eyebrow>
              <InfoButton entry="where_it_goes" />
            </View>
            <Pressable onPress={onSeeAll} hitSlop={8}>
              <Text style={styles.seeAll}>See all →</Text>
            </Pressable>
          </View>
          {breakdown.slice(0, 3).map((b) => {
            const cat = catById[b.catId] ?? fallback;
            const col = catColorsForHue(cat.hue);
            const pct = spent > 0 ? Math.round((b.amt / spent) * 100) : 0;
            return (
              <View key={b.catId} style={styles.spendRow}>
                <View style={[styles.spendIcon, { backgroundColor: col.bg }]}>
                  <Icon name={cat.icon as IconName} size={16} color={col.fg} stroke={1.9} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.spendLabelRow}>
                    <Text style={styles.spendLabel} numberOfLines={1}>{cat.label}</Text>
                    <Text style={styles.spendAmt}>RM {fmt(b.amt)}</Text>
                  </View>
                  <View style={styles.spendTrack}>
                    <View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: col.solid }} />
                  </View>
                </View>
                <Text style={styles.spendPct}>{pct}%</Text>
              </View>
            );
          })}
        </>
      )}
    </Card>
  );
}

/* ── Compact credit card ── */
function CreditCompactCard({
  score,
  band,
  confidence,
  onPress,
}: {
  score: number;
  band: string;
  confidence: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]}>
      <Card style={styles.creditCard}>
        <View style={styles.creditTop}>
          <Text style={styles.creditEyebrow}>Credit Score</Text>
          <View style={styles.confChip}>
            <View style={styles.confDot} />
            <Text style={styles.confText}>{Math.round(confidence * 100)}% data confidence</Text>
          </View>
        </View>
        <View style={styles.creditMain}>
          <View style={styles.creditScoreCol}>
            <Text style={styles.creditScore}>{score}</Text>
            <View style={[styles.bandPill, { backgroundColor: colors.accentSoft }]}>
              <Text style={styles.bandPillText}>{band}</Text>
            </View>
          </View>
          <View style={styles.creditVDivider} />
          <View style={{ flex: 1 }}>
            <ScoreBandBar band={band as any} />
            <View style={styles.viewProfile}>
              <Text style={styles.viewProfileText}>View credit profile</Text>
              <Icon name="chevronRight" size={14} color={colors.accent} />
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/* ── Quick actions ── */
function QuickActions({
  onOpenCredit,
  onOpenBudget,
  onOpenNetWorth,
  onOpenPassport,
}: {
  onOpenCredit: () => void;
  onOpenBudget: () => void;
  onOpenNetWorth: () => void;
  onOpenPassport: () => void;
}) {
  const items: { label: string; icon: IconName; onPress: () => void }[] = [
    { label: 'Credit', icon: 'scale', onPress: onOpenCredit },
    { label: 'Budget', icon: 'wallet', onPress: onOpenBudget },
    { label: 'Net Worth', icon: 'trending', onPress: onOpenNetWorth },
    { label: 'Passport', icon: 'scan', onPress: onOpenPassport },
  ];
  return (
    <Card style={styles.quickCard}>
      {items.map((it) => (
        <Pressable key={it.label} onPress={it.onPress} style={styles.quickItem}>
          <View style={[styles.quickIcon, styles.quickIconIdle]}>
            <Icon name={it.icon} size={21} color={colors.accent} />
          </View>
          <Text style={[styles.quickLabel, { color: colors.ink2, fontFamily: uiFont(500) }]}>{it.label}</Text>
        </Pressable>
      ))}
    </Card>
  );
}

/* ── Ask Pip strip ── */
function AskPipStrip({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.askWrap}>
      <View style={styles.askStrip}>
        <CoinMascot size={44} float />
        <View style={{ flex: 1 }}>
          <Text style={styles.askTitle}>Lift your score with Pip's tips.</Text>
          <Text style={styles.askSub}>Personalised, from your real data.</Text>
        </View>
        <Pressable onPress={onPress} style={styles.askBtn}>
          <Text style={styles.askBtnText}>Ask Pip</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <Card style={{ marginHorizontal: 16, marginTop: 8, padding: 26, alignItems: 'center' }}>
      <Pip size={88} expr="curious" float />
      <Text style={styles.emptyTitle}>No spending yet</Text>
      <Text style={styles.emptySub}>
        Tap “Scan a receipt”, attach a transaction screenshot, and I’ll pull out each line for you to file.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  date: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2, marginBottom: 2 },
  greeting: { fontFamily: uiFont(800), fontSize: 23, color: colors.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { width: 36, height: 36, borderRadius: 999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadowCard },
  pipBubble: { width: 44, height: 44, borderRadius: 999, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seeAll: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.accent },

  /* streak */
  streakCard: { marginHorizontal: 16, marginTop: 2, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flameTile: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(217,138,0,0.10)', alignItems: 'center', justifyContent: 'center' },
  streakNum: { fontFamily: numFont(700), fontSize: 24, color: colors.ink, lineHeight: 26 },
  streakLabel: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2 },
  streakDivider: { width: 1, height: 38, backgroundColor: colors.line },
  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dot: { width: 23, height: 23, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.accent },
  dotTodo: { borderWidth: 2, borderColor: colors.ink3, borderStyle: 'dashed' },
  streakBest: { fontFamily: uiFont(500), fontSize: 11, textAlign: 'right' },
  streakBestNum: { fontFamily: numFont(600), color: colors.ink2 },

  /* cash flow */
  cashCard: { marginHorizontal: 16, marginTop: 10, padding: 16 },
  cashTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cashSign: { fontFamily: numFont(700), fontSize: 24, marginRight: 1 },
  cashSub: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2, marginTop: 4 },
  incomeBadge: { backgroundColor: colors.accentSoft, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7, alignItems: 'center' },
  incomeAmt: { fontFamily: numFont(700), fontSize: 13, color: colors.accentInk },
  incomeLabel: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2, marginTop: 1 },
  cashDivider: { height: 1, backgroundColor: colors.line, marginVertical: 11 },
  spendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  spendIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  spendLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  spendLabel: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink, flex: 1, marginRight: 8 },
  spendAmt: { fontFamily: numFont(600), fontSize: 12.5, color: colors.ink },
  spendTrack: { height: 4, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  spendPct: { fontFamily: numFont(500), fontSize: 11, color: colors.ink2, width: 28, textAlign: 'right' },

  /* compact credit */
  creditCard: { marginHorizontal: 16, marginTop: 10, padding: 14, paddingHorizontal: 18 },
  creditTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  creditEyebrow: { fontFamily: uiFont(600), fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink2 },
  confChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accentTint, borderRadius: 20, paddingVertical: 3, paddingLeft: 7, paddingRight: 9 },
  confDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.accent },
  confText: { fontFamily: uiFont(600), fontSize: 11, color: colors.accentInk },
  creditMain: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  creditScoreCol: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  creditScore: { fontFamily: numFont(700), fontSize: 46, color: colors.ink, lineHeight: 48 },
  bandPill: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 3, marginBottom: 6 },
  bandPillText: { fontFamily: uiFont(700), fontSize: 11.5, color: colors.accentInk },
  creditVDivider: { width: 1, height: 48, backgroundColor: colors.line },
  viewProfile: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  viewProfileText: { fontFamily: uiFont(600), fontSize: 11.5, color: colors.accent },

  /* quick actions */
  quickCard: { marginHorizontal: 16, marginTop: 10, paddingVertical: 14, paddingHorizontal: 6, flexDirection: 'row', justifyContent: 'space-around' },
  quickItem: { flex: 1, alignItems: 'center', gap: 7 },
  quickIcon: { width: 50, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  quickIconIdle: { backgroundColor: colors.accentTint },
  quickLabel: { fontSize: 11, textAlign: 'center' },

  /* ask pip */
  askWrap: { paddingHorizontal: 16, marginTop: 10 },
  askStrip: { borderRadius: 22, backgroundColor: colors.accentSoft, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  askTitle: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk, marginBottom: 2 },
  askSub: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2 },
  askBtn: { backgroundColor: colors.accentInk, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, ...platformShadow(colors.accent, 0.32, 16, { width: 0, height: 8 }, 3) },
  askBtnText: { fontFamily: uiFont(700), fontSize: 12, color: colors.onAccent },

  /* generic cta */
  budgetCta: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  ctaIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontFamily: uiFont(700), fontSize: 15, color: colors.ink },
  ctaSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 1 },

  emptyTitle: { fontFamily: uiFont(700), fontSize: 19, color: colors.ink, marginTop: 14 },
  emptySub: { fontFamily: uiFont(500), fontSize: 14, lineHeight: 20, color: colors.ink2, textAlign: 'center', marginTop: 6 },
});
