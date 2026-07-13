// src/screens/RecapScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Icon } from '../components/Icon';
import { Card, CatBadge } from '../components/ui';
import { categoryStatus, monthKey, type CategoryBudgetStatus } from '../lib/budget';
import { monthLabel } from '../lib/dates';
import { fmt } from '../lib/format';
import { availableMonths, computeAdherence, monthlyIncomeStatement, spentByCategory } from '../lib/recap';
import { netWorthSeries } from '../lib/networth';
import type { Category } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, numFont, shadowCard, uiFont } from '../theme';

/** The 'YYYY-MM' before the given one. */
function prevMonthKey(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true };

// ── Design tints (from the approved mockup) ───────────────────────────────────
const TINT = {
  redSoft: '#fce8e6',
  redTint: '#fff0ef',
  amberSoft: '#fdf3dc',
  amberTint: '#fffcf4',
  ncfUp: '#42e893',
  ncfDown: '#ff8a7a',
} as const;

function statusColor(st: CategoryBudgetStatus): string {
  if (st === 'ok') return colors.accent;
  if (st === 'warn') return colors.amber;
  return colors.red;
}
function statusBg(st: CategoryBudgetStatus): string {
  if (st === 'ok') return colors.accentTint;
  if (st === 'warn') return TINT.amberTint;
  return TINT.redTint;
}
function statusBorder(st: CategoryBudgetStatus): string {
  if (st === 'ok') return colors.accentSoft;
  if (st === 'warn') return TINT.amberSoft;
  return TINT.redSoft;
}

// ── Hero gradient (radial sheen approximated by a diagonal linear ramp) ────────
function HeroGradient({ positive }: { positive: boolean }) {
  const stops = positive ? ['#25845e', '#1b6b48', '#0e3d27'] : ['#9b2335', '#7d1c2c', '#4a0e19'];
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id="recapHero" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={stops[0]} />
          <Stop offset="0.52" stopColor={stops[1]} />
          <Stop offset="1" stopColor={stops[2]} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#recapHero)" />
    </Svg>
  );
}

// ── Income-statement hero ─────────────────────────────────────────────────────
function IncomeHero({
  month,
  income,
  expenses,
  net,
  networth,
}: {
  month: string;
  income: number;
  expenses: number;
  net: number;
  networth: { net: number; delta: number } | null;
}) {
  const positive = net >= 0;
  return (
    <View style={[styles.heroShadowWrap, positive ? styles.heroShadowPos : styles.heroShadowNeg]}>
      <View style={styles.hero}>
      <HeroGradient positive={positive} />
      <View style={styles.heroBlob} />

      <Text style={styles.heroEyebrow}>Income Statement · {monthLabel(month)}</Text>

      {/* Income */}
      <View style={[styles.heroLine, styles.heroLineBorder]}>
        <Text style={styles.heroLineLabel}>Income</Text>
        <Text style={styles.heroVal}>RM {fmt(income)}</Text>
      </View>
      {/* Expenses */}
      <View style={[styles.heroLine, styles.heroLineBorder]}>
        <Text style={styles.heroLineLabel}>Expenses</Text>
        <Text style={[styles.heroVal, { color: 'rgba(255,255,255,0.72)' }]}>− RM {fmt(expenses)}</Text>
      </View>
      {/* Net cash flow */}
      <View style={[styles.heroLine, { paddingTop: 12 }]}>
        <Text style={[styles.heroLineLabel, { color: 'rgba(255,255,255,0.60)', fontFamily: uiFont(700) }]}>Net Cash Flow</Text>
        <Text style={[styles.heroNcf, { color: positive ? TINT.ncfUp : TINT.ncfDown }]}>
          {positive ? '+' : '−'} RM {fmt(Math.abs(net))}
        </Text>
      </View>

      {/* Net-worth impact strip */}
      {networth && (
        <View style={styles.nwStrip}>
          <View>
            <Text style={styles.nwLabel}>Month-End Net Worth</Text>
            <Text style={styles.nwVal}>
              {networth.net < 0 ? '− ' : ''}RM {fmt(Math.abs(networth.net))}
            </Text>
          </View>
          <View style={styles.nwDivider} />
          <View>
            <Text style={styles.nwLabel}>vs. last month</Text>
            <View style={styles.nwDeltaRow}>
              <Svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                <Path
                  d={networth.delta >= 0 ? 'M6 10V2M6 2L3 5M6 2L9 5' : 'M6 2v8M6 10L3 7M6 10L9 7'}
                  stroke={networth.delta >= 0 ? TINT.ncfUp : TINT.ncfDown}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={[styles.nwDelta, { color: networth.delta >= 0 ? TINT.ncfUp : TINT.ncfDown }]}>
                {networth.delta >= 0 ? '+' : '−'}RM {fmt(Math.abs(networth.delta))}
              </Text>
            </View>
          </View>
        </View>
      )}
      </View>
    </View>
  );
}

// ── Category row (target vs actual) ───────────────────────────────────────────
function CategoryRow({ cat, spent, alloc, isLast }: { cat: Category; spent: number; alloc: number; isLast: boolean }) {
  const st = categoryStatus(spent, alloc);
  const color = statusColor(st);
  const ratio = alloc > 0 ? spent / alloc : spent > 0 ? 1.45 : 0;
  const pct = Math.round(ratio * 100);
  const over = spent > alloc;
  const diff = Math.abs(spent - alloc);
  const mainPct = Math.min(ratio, 1) * 100;

  return (
    <View style={[styles.catRow, !isLast && styles.divider]}>
      <View style={styles.catTop}>
        <View style={styles.catIconLabel}>
          <CatBadge category={cat} size={30} rad={9} />
          <Text style={styles.catLabel} numberOfLines={1}>{cat.label}</Text>
        </View>
        <View style={styles.catNums}>
          <Text style={styles.catActual}>RM {fmt(spent)}</Text>
          <Text style={styles.catTarget}> / {fmt(alloc)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusBg(st), borderColor: statusBorder(st) }]}>
          <Text style={[styles.badgeText, { color }]}>
            {diff === 0 ? 'On target' : over ? `+${fmt(diff)}` : `−${fmt(diff)}`}
          </Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        {over && <View style={[styles.barFill, { width: '100%', backgroundColor: color, opacity: 0.3 }]} />}
        <View style={[styles.barFill, { width: `${mainPct}%`, backgroundColor: color }]} />
      </View>

      <View style={styles.catFoot}>
        <Text style={[styles.catPct, { color }]}>{pct}% of budget</Text>
        <Text style={styles.catBudget}>budget RM {fmt(alloc)}</Text>
      </View>
    </View>
  );
}

type InsightType = 'good' | 'warn' | 'caution';

// ── Insight row ───────────────────────────────────────────────────────────────
function InsightRow({ type, text, isLast }: { type: InsightType; text: string; isLast: boolean }) {
  const color = type === 'good' ? colors.accent : type === 'warn' ? colors.red : colors.amber;
  const bg = type === 'good' ? colors.accentTint : type === 'warn' ? TINT.redTint : TINT.amberTint;
  const path =
    type === 'good'
      ? 'M3 7l3 3 6-6'
      : type === 'warn'
      ? 'M7 3.5v4M7 9.5h.01'
      : 'M7 4v3.5M7 9h.01';
  return (
    <View style={[styles.insightRow, !isLast && styles.divider]}>
      <View style={[styles.insightIcon, { backgroundColor: bg }]}>
        <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
          <Path d={path} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <Text style={styles.insightText}>{text}</Text>
    </View>
  );
}

export function RecapScreen({ onBack, onOpenCalendar }: { onBack: () => void; onOpenCalendar?: (month: string) => void }) {
  const insets = useSafeAreaInsets();
  const { transactions, catById, snapshots, accounts, balanceEntries } = useAppData();

  const snapshotMonths = useMemo(() => Object.keys(snapshots), [snapshots]);
  const months = useMemo(
    () => availableMonths(transactions, snapshotMonths),
    [transactions, snapshotMonths]
  );
  // Oldest → newest for the picker, so the most-recent month sits on the right.
  const displayMonths = useMemo(() => [...months].reverse(), [months]);
  const [selected, setSelected] = useState<string>(() => monthKey(new Date().toISOString())!);
  const [pickerOpen, setPickerOpen] = useState(false);
  const month = months.includes(selected) ? selected : months[0];

  const statement = useMemo(() => monthlyIncomeStatement(transactions, month), [transactions, month]);
  const spentByCat = useMemo(() => spentByCategory(transactions, month), [transactions, month]);
  const snapshot = snapshots[month];
  const allocations = snapshot?.allocations ?? {};
  const adherence = useMemo(() => computeAdherence(allocations, spentByCat), [allocations, spentByCat]);
  const hasBudget = Object.keys(allocations).length > 0;
  const budgetedIds = useMemo(() => Object.keys(allocations), [allocations]);
  const unbudgetedSpent = useMemo(
    () => Object.entries(spentByCat).filter(([id]) => !budgetedIds.includes(id)).reduce((s, [, v]) => s + v, 0),
    [spentByCat, budgetedIds]
  );

  // Month-end net worth for the selected month and the one before it.
  const networth = useMemo(() => {
    if (accounts.length === 0) return null;
    const [prev, curr] = netWorthSeries(accounts, balanceEntries, [prevMonthKey(month), month]);
    return { net: curr.net, delta: curr.net - prev.net };
  }, [accounts, balanceEntries, month]);

  // Insights, mapped from the deterministic adherence result.
  const insights = useMemo<{ type: InsightType; text: string }[]>(() => {
    const out: { type: InsightType; text: string }[] = [];
    out.push({
      type: adherence.overspends.length === 0 ? 'good' : 'caution',
      text: `Stayed within budget in ${adherence.withinCount} of ${adherence.totalBudgeted} categories.`,
    });
    if (adherence.overspends.length === 0) {
      out.push({ type: 'good', text: 'Nothing went over target this month. 🎉' });
    } else {
      for (const o of adherence.overspends.slice(0, 3)) {
        const cat = catById[o.catId] ?? fallback;
        out.push({
          type: 'warn',
          text: `${cat.label} over by RM ${fmt(o.over)}  RM ${fmt(o.spent)} of ${fmt(o.allocated)}${o.allocated > 0 ? ` (${o.pct}%)` : ''}.`,
        });
      }
    }
    return out;
  }, [adherence, catById]);

  const stripRef = useRef<ScrollView>(null);

  return (
    <View style={styles.root}>
      {/* Nav bar */}
      <View style={[styles.nav, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={onBack} style={styles.navBtn}>
          <Svg width={10} height={17} viewBox="0 0 10 17" fill="none">
            <Path d="M8.5 1.5L1.5 8.5l7 7" stroke={colors.ink2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Text style={styles.navTitle}>Monthly Recap</Text>
        <Pressable onPress={() => setPickerOpen(true)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Select month">
          <Svg width={17} height={17} viewBox="0 0 18 18" fill="none" stroke={colors.ink2} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Rect x={3} y={4} width={12} height={11} rx={2} />
            <Path d="M3 7.5h12M6.5 2.5v3M11.5 2.5v3M6.5 11l1.6 1.6L11.5 9" />
          </Svg>
        </Pressable>
        {onOpenCalendar && (
          <Pressable
            onPress={() => onOpenCalendar(month)}
            style={[styles.navBtn, { marginLeft: 6 }]}
            accessibilityRole="button"
            accessibilityLabel="Open calendar view"
          >
            <Svg width={17} height={17} viewBox="0 0 18 18" fill="none" stroke={colors.accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <Rect x={3} y={3} width={12} height={12} rx={2} />
              <Path d="M3 7h12M6.5 1.5v3M11.5 1.5v3" />
              <Path d="M6 10.5h2M10 10.5h2M6 13h2M10 13h2" />
            </Svg>
          </Pressable>
        )}
      </View>

      {/* Month picker  most-recent on the right */}
      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => stripRef.current?.scrollToEnd({ animated: false })}
        style={styles.monthScroll}
        contentContainerStyle={styles.monthStrip}
      >
        {displayMonths.map((mk) => {
          const on = mk === month;
          return (
            <Pressable key={mk} onPress={() => setSelected(mk)} style={[styles.monthChip, on && styles.monthChipOn]}>
              <Text style={[styles.monthChipText, on && styles.monthChipTextOn]}>{monthLabel(mk, false)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <IncomeHero
          month={month}
          income={statement.income}
          expenses={statement.expenses}
          net={statement.net}
          networth={networth}
        />

        {hasBudget ? (
          <>
            {/* Spending breakdown */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>Spending</Text>
              <Text style={styles.sectionSub}>RM {fmt(statement.expenses)}</Text>
            </View>
            <Card style={styles.listCard}>
              {budgetedIds.map((id, i) => (
                <CategoryRow
                  key={id}
                  cat={catById[id] ?? fallback}
                  spent={spentByCat[id] ?? 0}
                  alloc={allocations[id]}
                  isLast={i === budgetedIds.length - 1 && unbudgetedSpent <= 0}
                />
              ))}
              {unbudgetedSpent > 0 && (
                <View style={[styles.catRow, styles.divider]}>
                  <View style={styles.catIconLabel}>
                    <View style={styles.unbudgetedIcon}>
                      <Icon name="dots" size={16} color={colors.ink3} />
                    </View>
                    <Text style={styles.catLabel}>Unbudgeted</Text>
                  </View>
                  <Text style={styles.catActual}>RM {fmt(unbudgetedSpent)}</Text>
                </View>
              )}
            </Card>

            {/* Where to improve */}
            <View style={styles.improveHead}>
              <View style={styles.improveTab} />
              <Text style={styles.sectionLabel}>Where to improve</Text>
              <View style={styles.signalPill}>
                <Text style={styles.signalText}>{insights.length} signals</Text>
              </View>
            </View>
            <Card style={styles.listCard}>
              {insights.map((it, i) => (
                <InsightRow key={i} type={it.type} text={it.text} isLast={i === insights.length - 1} />
              ))}
            </Card>
          </>
        ) : (
          <View style={styles.emptyPad}>
            <Text style={styles.emptyText}>Category breakdown not available for this month.</Text>
          </View>
        )}

        <View style={{ height: 8 }} />
      </ScrollView>

      {/* Month dropdown  reliable selector on every platform (web mouse can't drag the strip) */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select month</Text>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {months.map((mk) => {
                const on = mk === month;
                return (
                  <Pressable
                    key={mk}
                    onPress={() => {
                      setSelected(mk);
                      setPickerOpen(false);
                    }}
                    style={[styles.monthOption, on && styles.monthOptionOn]}
                  >
                    <Text style={[styles.monthOptionText, on && styles.monthOptionTextOn]}>{monthLabel(mk)}</Text>
                    {on && (
                      <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                        <Path d="M3 8.5l3.2 3.2L13 5" stroke={colors.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const HERO_NUM = numFont(700);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // nav
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadowCard },
  navTitle: { flex: 1, textAlign: 'center', fontFamily: uiFont(700), fontSize: 16, color: colors.ink },

  // month picker  keep the strip its natural height; pills must not stretch vertically
  monthScroll: { flexGrow: 0, flexShrink: 0 },
  monthStrip: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10, gap: 6, alignItems: 'center' },
  monthChip: { paddingHorizontal: 17, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, ...shadowCard },
  monthChipOn: { backgroundColor: colors.accent, borderColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  monthChipText: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2 },
  monthChipTextOn: { fontFamily: uiFont(700), color: '#fff' },

  // hero
  // Split in two: the shadow (incl. Android `elevation`) lives on this outer,
  // unclipped wrapper, while `hero` below clips the gradient/blob to the
  // rounded corners. Combining overflow:'hidden' with elevation on the same
  // View clips Android's shadow into a glitchy rectangular offset  this
  // wrapper/content split is the standard fix.
  heroShadowWrap: { marginHorizontal: 16, borderRadius: 26 },
  hero: { borderRadius: 26, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, overflow: 'hidden' },
  heroShadowPos: { shadowColor: '#0c2214', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  heroShadowNeg: { shadowColor: '#5a0a14', shadowOpacity: 0.32, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  heroBlob: { position: 'absolute', top: -50, right: -40, width: 160, height: 160, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' },
  heroEyebrow: { fontFamily: uiFont(600), fontSize: 10, letterSpacing: 1.1, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 16 },
  heroLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  heroLineBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)', paddingTop: 10 },
  heroLineLabel: { fontFamily: uiFont(600), fontSize: 9.5, letterSpacing: 0.9, textTransform: 'uppercase', color: 'rgba(255,255,255,0.46)' },
  heroVal: { fontFamily: HERO_NUM, fontSize: 20, color: '#fff' },
  heroNcf: { fontFamily: HERO_NUM, fontSize: 28 },

  // net-worth strip
  nwStrip: { marginTop: 16, backgroundColor: 'rgba(0,0,0,0.20)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  nwLabel: { fontFamily: uiFont(500), fontSize: 9.5, letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 3 },
  nwVal: { fontFamily: HERO_NUM, fontSize: 18, color: '#fff' },
  nwDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.12)' },
  nwDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nwDelta: { fontFamily: HERO_NUM, fontSize: 18 },

  // section headers
  sectionHead: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionLabel: { fontFamily: uiFont(700), fontSize: 12, letterSpacing: 0.3, color: colors.ink2 },
  sectionSub: { fontFamily: numFont(600), fontSize: 12, color: colors.ink3 },
  improveHead: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 9 },
  improveTab: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.accent },
  signalPill: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9, backgroundColor: colors.accentSoft },
  signalText: { fontFamily: uiFont(700), fontSize: 9.5, color: colors.accentInk },

  listCard: { marginHorizontal: 16, marginTop: 4, borderRadius: 20, overflow: 'hidden' },

  // category row
  catRow: { paddingHorizontal: 16, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  catIconLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  catLabel: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink, flexShrink: 1 },
  catNums: { flexDirection: 'row', alignItems: 'baseline' },
  catActual: { fontFamily: numFont(700), fontSize: 13.5, color: colors.ink },
  catTarget: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1 },
  badgeText: { fontFamily: uiFont(700), fontSize: 10 },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(20,40,30,0.07)', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  catFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  catPct: { fontFamily: uiFont(600), fontSize: 9.5 },
  catBudget: { fontFamily: uiFont(400), fontSize: 9.5, color: colors.ink3 },
  unbudgetedIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },

  // insight row
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  insightIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  insightText: { flex: 1, fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 19, color: colors.ink },

  // empty
  emptyPad: { paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontFamily: uiFont(500), fontSize: 13, lineHeight: 21, color: colors.ink3, textAlign: 'center' },

  // month dropdown
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(16,32,24,0.35)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 999, backgroundColor: colors.line, marginBottom: 12 },
  modalTitle: { fontFamily: uiFont(700), fontSize: 13, letterSpacing: 0.3, color: colors.ink2, marginBottom: 6, paddingHorizontal: 4 },
  monthOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14 },
  monthOptionOn: { backgroundColor: colors.accentTint },
  monthOptionText: { fontFamily: uiFont(600), fontSize: 15, color: colors.ink },
  monthOptionTextOn: { fontFamily: uiFont(700), color: colors.accentInk },
});
