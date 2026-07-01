// src/screens/CalendarScreen.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { fmt } from '../lib/format';
import { monthLabel } from '../lib/dates';
import type { Transaction } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, numFont, shadowCard, uiFont } from '../theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMonths(ym: { year: number; month: number }, delta: number) {
  const d = new Date(ym.year, ym.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthKeyFrom(ym: { year: number; month: number }): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

/** Build a grid of weeks (each week = 7 cells, Mon-first; null = outside month). */
function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  // Convert to Mon-first offset (Mon=0 … Sun=6)
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const total = startOffset + daysInMonth;
  const weeks: (number | null)[][] = [];
  let day = 1;
  for (let week = 0; week < Math.ceil(total / 7); week++) {
    const row: (number | null)[] = [];
    for (let col = 0; col < 7; col++) {
      const cellIndex = week * 7 + col;
      if (cellIndex < startOffset || day > daysInMonth) {
        row.push(null);
      } else {
        row.push(day++);
      }
    }
    weeks.push(row);
  }
  return weeks;
}

/** YYYY-MM-DD for a given year/month/day. */
function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The effective date of a transaction: `date` if present, else `createdAt` truncated. */
function txnDate(t: Transaction): string {
  if (t.date) return t.date.slice(0, 10);
  return t.createdAt.slice(0, 10);
}

interface DayData {
  income: number;
  expense: number;
  net: number;
  txns: Transaction[];
}

interface MonthData {
  totalIncome: number;
  totalExpense: number;
  byDay: Record<string, DayData>;
}

function computeMonthData(transactions: Transaction[], year: number, month: number): MonthData {
  const mk = monthKeyFrom({ year, month });
  let totalIncome = 0;
  let totalExpense = 0;
  const byDay: Record<string, DayData> = {};

  for (const t of transactions) {
    const d = txnDate(t);
    if (!d.startsWith(mk)) continue;
    const dayStr = d; // full YYYY-MM-DD
    if (!byDay[dayStr]) byDay[dayStr] = { income: 0, expense: 0, net: 0, txns: [] };
    byDay[dayStr].txns.push(t);
    if (t.type === 'income') {
      byDay[dayStr].income += t.amount;
      totalIncome += t.amount;
    } else {
      byDay[dayStr].expense += t.amount;
      totalExpense += t.amount;
    }
    byDay[dayStr].net = byDay[dayStr].income - byDay[dayStr].expense;
  }
  return { totalIncome, totalExpense, byDay };
}

/** Format a compact amount for the calendar cell. e.g. 7100 → "7.1K", 245 → "245". */
function compactAmt(n: number): string {
  if (n === 0) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const FULL_WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCards({ income, expense }: { income: number; expense: number }) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryCard, styles.summaryCardIncome]}>
        <View style={styles.summaryDotRow}>
          <View style={[styles.summaryDot, { backgroundColor: colors.accent }]} />
          <Text style={styles.summaryLabel}>INCOME</Text>
        </View>
        <Text style={styles.summaryAmount}>RM{fmt(income)}</Text>
      </View>
      <View style={[styles.summaryCard, styles.summaryCardExpense]}>
        <View style={styles.summaryDotRow}>
          <View style={[styles.summaryDot, { backgroundColor: colors.red }]} />
          <Text style={styles.summaryLabel}>EXPENSE</Text>
        </View>
        <Text style={[styles.summaryAmount, { color: colors.red }]}>RM{fmt(expense)}</Text>
      </View>
    </View>
  );
}

function DayCell({
  day,
  dayData,
  selected,
  isToday,
  onPress,
}: {
  day: number | null;
  dayData: DayData | null;
  selected: boolean;
  isToday: boolean;
  onPress: (day: number) => void;
}) {
  if (day === null) return <View style={styles.cellEmpty} />;

  const hasIncome = dayData && dayData.income > 0;
  const hasExpense = dayData && dayData.expense > 0;
  const net = dayData ? dayData.net : 0;
  const netPositive = net >= 0;

  return (
    <Pressable
      style={[
        styles.cell,
        selected && styles.cellSelected,
        isToday && !selected && styles.cellToday,
        hasIncome && !hasExpense && styles.cellIncomeOnly,
        hasExpense && !hasIncome && styles.cellExpenseOnly,
      ]}
      onPress={() => onPress(day)}
      accessibilityRole="button"
      accessibilityLabel={`Day ${day}`}
    >
      <Text style={[styles.cellDay, selected && styles.cellDaySelected]}>
        {day}
      </Text>
      {hasIncome && (
        <Text style={[styles.cellIncome]}>{compactAmt(dayData!.income)}</Text>
      )}
      {hasExpense && (
        <Text style={[styles.cellExpense]}>{compactAmt(dayData!.expense)}</Text>
      )}
      {(hasIncome || hasExpense) && (
        <View style={[styles.cellNet, { backgroundColor: netPositive ? colors.accentSoft : '#fce8e6' }]}>
          <Text style={[styles.cellNetText, { color: netPositive ? colors.accentInk : colors.red }]}>
            {netPositive ? '+' : '−'}{compactAmt(Math.abs(net))}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function DayTransactionList({
  year, month, day, dayData,
}: {
  year: number; month: number; day: number; dayData: DayData | null;
}) {
  // e.g. "Tue, May 26"
  const d = new Date(year, month - 1, day);
  const weekdayIdx = (d.getDay() + 6) % 7; // Mon-first
  const dateLabel = `${FULL_WEEKDAY[weekdayIdx]}, ${MONTHS_SHORT[month - 1]} ${day}`;

  return (
    <View style={styles.daySection}>
      <Text style={styles.daySectionTitle}>{dateLabel}</Text>
      {!dayData || dayData.txns.length === 0 ? (
        <View style={styles.emptyDay}>
          <Text style={styles.emptyDayText}>No transactions</Text>
        </View>
      ) : (
        <View style={styles.txnList}>
          {dayData.txns.map((t) => (
            <View key={t.id} style={styles.txnRow}>
              <View style={styles.txnLeft}>
                <View style={[styles.txnDot, { backgroundColor: t.type === 'income' ? colors.accent : colors.red }]} />
                <Text style={styles.txnMerchant} numberOfLines={1}>{t.merchantRaw}</Text>
              </View>
              <Text style={[styles.txnAmount, { color: t.type === 'income' ? colors.accentInk : colors.red }]}>
                {t.type === 'income' ? '+' : '−'} RM {fmt(t.amount)}
              </Text>
            </View>
          ))}
          {/* Net for the day */}
          <View style={styles.dayNetRow}>
            <Text style={styles.dayNetLabel}>Net</Text>
            <Text style={[styles.dayNetVal, { color: dayData.net >= 0 ? colors.accentInk : colors.red }]}>
              {dayData.net >= 0 ? '+' : '−'} RM {fmt(Math.abs(dayData.net))}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function CalendarScreen({ onBack, initialMonth }: { onBack: () => void; initialMonth?: string }) {
  const insets = useSafeAreaInsets();
  const { transactions } = useAppData();

  // Initialise to the passed month or the current month
  const initYM = useMemo(() => {
    if (initialMonth) {
      const m = initialMonth.match(/^(\d{4})-(\d{2})$/);
      if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [initialMonth]);

  const [ym, setYm] = useState(initYM);
  const today = new Date();

  const monthData = useMemo(
    () => computeMonthData(transactions, ym.year, ym.month),
    [transactions, ym]
  );
  const grid = useMemo(() => buildCalendarGrid(ym.year, ym.month), [ym]);

  const [selectedDay, setSelectedDay] = useState<number>(() => {
    // Default to today if in this month, else day 1
    if (today.getFullYear() === ym.year && today.getMonth() + 1 === ym.month) {
      return today.getDate();
    }
    return 1;
  });

  const selectedIso = toIsoDate(ym.year, ym.month, selectedDay);
  const selectedDayData = monthData.byDay[selectedIso] ?? null;

  const isCurrentMonth = today.getFullYear() === ym.year && today.getMonth() + 1 === ym.month;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Nav bar ── */}
      <View style={styles.nav}>
        <Pressable onPress={onBack} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Svg width={10} height={17} viewBox="0 0 10 17" fill="none">
            <Path d="M8.5 1.5L1.5 8.5l7 7" stroke={colors.ink2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Text style={styles.navTitle}>Cash Flow Calendar</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        {/* ── Month navigator ── */}
        <View style={styles.monthNav}>
          <Pressable
            onPress={() => setYm((prev) => addMonths(prev, -1))}
            style={styles.monthNavBtn}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
              <Path d="M7 1L1 7l6 6" stroke={colors.ink2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel(monthKeyFrom(ym))}</Text>
          <Pressable
            onPress={() => setYm((prev) => addMonths(prev, 1))}
            style={styles.monthNavBtn}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
              <Path d="M1 1l6 6-6 6" stroke={colors.ink2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        </View>

        {/* ── Summary cards ── */}
        <SummaryCards income={monthData.totalIncome} expense={monthData.totalExpense} />

        {/* ── Weekday header ── */}
        <View style={styles.weekdayHeader}>
          {WEEKDAY_LABELS.map((w) => (
            <Text key={w} style={styles.weekdayLabel}>{w}</Text>
          ))}
        </View>

        {/* ── Calendar grid ── */}
        <View style={styles.calGrid}>
          {grid.map((week, wi) => (
            <View key={wi} style={styles.calWeek}>
              {week.map((day, di) => {
                const iso = day ? toIsoDate(ym.year, ym.month, day) : null;
                const dayData = iso ? (monthData.byDay[iso] ?? null) : null;
                const isTodayCell = isCurrentMonth && day === today.getDate();
                return (
                  <DayCell
                    key={di}
                    day={day}
                    dayData={dayData}
                    selected={day === selectedDay}
                    isToday={isTodayCell}
                    onPress={(d) => setSelectedDay(d)}
                  />
                );
              })}
            </View>
          ))}
        </View>

        {/* ── Selected day transactions ── */}
        <DayTransactionList
          year={ym.year}
          month={ym.month}
          day={selectedDay}
          dayData={selectedDayData}
        />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CELL_INCOME_BG = '#e8f5ee';
const CELL_EXPENSE_BG = '#fce8e6';
const CELL_SELECTED_BG = colors.accent;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // nav
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: uiFont(700),
    fontSize: 16,
    color: colors.ink,
  },
  navSpacer: { width: 36 },

  // month navigator
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  monthLabel: {
    fontFamily: uiFont(700),
    fontSize: 15,
    color: colors.ink,
    minWidth: 130,
    textAlign: 'center',
  },

  // summary cards
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.line2,
    ...shadowCard,
  },
  summaryCardIncome: { borderTopWidth: 3, borderTopColor: colors.accent },
  summaryCardExpense: { borderTopWidth: 3, borderTopColor: colors.red },
  summaryDotRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  summaryDot: { width: 6, height: 6, borderRadius: 3 },
  summaryLabel: {
    fontFamily: uiFont(700),
    fontSize: 9.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  summaryAmount: {
    fontFamily: numFont(700),
    fontSize: 16,
    color: colors.ink,
  },

  // weekday header
  weekdayHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: uiFont(700),
    fontSize: 9.5,
    letterSpacing: 0.6,
    color: colors.ink3,
  },

  // calendar grid
  calGrid: { paddingHorizontal: 10, gap: 4 },
  calWeek: { flexDirection: 'row', gap: 4 },

  // cells
  cell: {
    flex: 1,
    minHeight: 62,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 5,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: colors.line2,
    gap: 1,
  },
  cellEmpty: { flex: 1, minHeight: 62 },
  cellIncomeOnly: { backgroundColor: CELL_INCOME_BG, borderColor: colors.accentSoft },
  cellExpenseOnly: { backgroundColor: CELL_EXPENSE_BG, borderColor: '#f5ceca' },
  cellToday: { borderColor: colors.accent, borderWidth: 1.5 },
  cellSelected: { backgroundColor: CELL_SELECTED_BG, borderColor: CELL_SELECTED_BG },
  cellDay: {
    fontFamily: uiFont(600),
    fontSize: 12,
    color: colors.ink,
    lineHeight: 16,
  },
  cellDaySelected: { color: '#fff', fontFamily: uiFont(700) },
  cellIncome: {
    fontFamily: numFont(600),
    fontSize: 9,
    color: colors.accentInk,
    lineHeight: 12,
  },
  cellExpense: {
    fontFamily: numFont(600),
    fontSize: 9,
    color: colors.red,
    lineHeight: 12,
  },
  cellNet: {
    marginTop: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  cellNetText: {
    fontFamily: numFont(700),
    fontSize: 8,
    lineHeight: 11,
  },

  // day section
  daySection: {
    marginTop: 18,
    marginHorizontal: 16,
  },
  daySectionTitle: {
    fontFamily: uiFont(700),
    fontSize: 14,
    color: colors.ink,
    marginBottom: 10,
  },
  emptyDay: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line2,
    paddingVertical: 28,
    alignItems: 'center',
    ...shadowCard,
  },
  emptyDayText: {
    fontFamily: uiFont(500),
    fontSize: 13.5,
    color: colors.ink3,
  },
  txnList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line2,
    overflow: 'hidden',
    ...shadowCard,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line2,
  },
  txnLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  txnDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  txnMerchant: {
    fontFamily: uiFont(500),
    fontSize: 13,
    color: colors.ink,
    flex: 1,
  },
  txnAmount: {
    fontFamily: numFont(700),
    fontSize: 13,
    marginLeft: 10,
  },
  dayNetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface2,
  },
  dayNetLabel: {
    fontFamily: uiFont(700),
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.ink2,
    textTransform: 'uppercase',
  },
  dayNetVal: {
    fontFamily: numFont(700),
    fontSize: 14,
  },
});
