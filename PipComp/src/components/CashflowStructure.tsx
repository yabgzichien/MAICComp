// src/components/CashflowStructure.tsx
// The two borrower-facing cards that answer "how do I earn?" and "how much of my month is already
// spoken for?" — the questions an uneven earner has and a single average income figure hides.
//
// Everything rendered here is computed on-device from the borrower's own ledger
// (src/lib/incomeFloor.ts, src/lib/spendingProfile.ts). Nothing is self-declared, and nothing here
// feeds the score or the passport: this is insight the borrower was previously never shown, even
// though the lender console has displayed the same underlying signals all along.
//
// Copy register follows the app convention (UI/UX C5: one idea, verdict first, no jargon), and
// deliberately never grades the borrower — uneven income is a shape, not a fault.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FadeIn, useEasedFrom } from './Motion';
import { Icon } from './Icon';
import { InfoButton } from './InfoButton';
import { Card } from './ui';
import { fmt } from '../lib/format';
import { dependableSurplus, serviceableCapacity, type IncomeFloor } from '../lib/incomeFloor';
import type { ExpenseStructure } from '../lib/spendingProfile';
import type { DetectedObligation } from '../lib/obligations';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { numFont, uiFont } from '../theme';

const CHART_HEIGHT = 78;
const SWEEP_MS = 700;

/**
 * The escapability ramp: dark for what cannot move, lightening toward what is genuinely the
 * borrower's to redirect. One hue family, so it reads as an ordered scale rather than three
 * unrelated categories.
 *
 * The steps are separated by LIGHTNESS, which is what actually makes adjacent bar segments
 * distinguishable. Two earlier attempts failed on this and both had to be measured to be caught:
 * ink2/ink3 are near-identical grey-greens, and ink3 against accent sits at a 1.08:1 luminance
 * ratio — visibly different in hue but not in weight, which is no help at a glance or to a
 * colour-blind reader. These three land at roughly 2.7:1 and 2.3:1 between neighbours.
 */
/** Light green, the top of the app's existing band ramp: the borrower's freedom, not a vice. */
const FLEXIBLE_COLOR = '#3ab07a';
// `committed` tracks colorTheme.ink (heaviest, already spoken for) and is resolved inside each
// component below since it needs the live hook. `essential` (deep green: compressible, never
// removable) tracks the user's accent preset, so it is read live via useAccent() at each call
// site below instead of living in this static map.

/** "2026-03" → "Mar". Pure and locale-free (Hermes has locale-data gaps, see lib/format.ts). */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(key: string): string {
  const m = Number(key.slice(5, 7));
  return MONTH_ABBR[m - 1] ?? '';
}

/** Whole ringgit. These are all estimates from a handful of months, so rendering cents would
 *  claim a precision the numbers do not have. */
const rm = (n: number): string => `RM${fmt(Math.round(Math.abs(n))).replace(/\.00$/, '')}`;

/** One month's bar. Months that fell below the floor are marked rather than hidden — the
 *  exceptions are the honest part of the claim. */
function IncomeBar({ total, max, below, delay }: { total: number; max: number; below: boolean; delay: number }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const target = max > 0 ? Math.max(2, (total / max) * CHART_HEIGHT) : 2;
  const h = useEasedFrom(0, target, SWEEP_MS + delay);
  return <View style={[styles.bar, { height: h, backgroundColor: below ? colorTheme.amber : theme.accent }]} />;
}

/**
 * Card A — the income that actually held up.
 *
 * The floor line, not the bars, is the hero: a percentage or an average means nothing on its own,
 * but a line the borrower cleared in 5 of 6 months is a number a lender can underwrite.
 */
export function IncomeFloorCard({ floor, sourceCount }: { floor: IncomeFloor; sourceCount: number }) {
  const colorTheme = useThemeColors();
  const max = floor.months.reduce((m, x) => Math.max(m, x.total), 0);
  // Fewer months than the floor needs: show what exists, promise nothing.
  if (!floor.reliable) {
    return (
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text style={[styles.kicker, { color: colorTheme.ink2 }]}>HOW YOU EARN</Text>
          <InfoButton entry="income_floor" />
        </View>
        <Text style={[styles.thinTitle, { color: colorTheme.ink }]}>
          {floor.monthsWithIncome === 0
            ? 'No income recorded yet'
            : `${floor.monthsWithIncome} month${floor.monthsWithIncome === 1 ? '' : 's'} recorded`}
        </Text>
        <Text style={[styles.body, { color: colorTheme.ink2 }]}>
          Add a little more history and we can show the income you can count on, not just an average.
        </Text>
      </Card>
    );
  }

  const label =
    `Income floor ${rm(floor.floor)} a month, cleared in ${floor.monthsAtOrAboveFloor} of ` +
    `${floor.monthsWithIncome} months. Average ${rm(floor.average)}, best month ${rm(floor.best)}.`;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: colorTheme.ink2 }]}>HOW YOU EARN</Text>
        <InfoButton entry="income_floor" />
      </View>

      <Text style={[styles.hero, { color: colorTheme.ink }]}>
        {rm(floor.floor)}
        <Text style={[styles.heroSuffix, { color: colorTheme.ink2 }]}> you can count on</Text>
      </Text>
      <Text style={[styles.sub, { color: colorTheme.ink2 }]}>
        Cleared in {floor.monthsAtOrAboveFloor} of your last {floor.monthsWithIncome} months
      </Text>

      <View style={styles.chart} accessible accessibilityLabel={label}>
        <View style={styles.bars}>
          {floor.months.map((m, i) => (
            <View key={m.key} style={styles.barSlot}>
              <IncomeBar total={m.total} max={max} below={m.total < floor.floor} delay={i * 40} />
            </View>
          ))}
          {/* The floor, drawn across every month. Lives INSIDE the plot row, whose height is
              exactly CHART_HEIGHT — anchoring it to the outer container instead would offset it
              by the month-label row and silently draw the line at the wrong level. */}
          <View
            style={[
              styles.floorLine,
              { backgroundColor: colorTheme.ink, bottom: max > 0 ? (floor.floor / max) * CHART_HEIGHT : 0 },
            ]}
          />
        </View>
        <View style={styles.monthRow}>
          {floor.months.map((m) => (
            <Text key={m.key} style={[styles.monthLabel, { color: colorTheme.ink3 }]} numberOfLines={1}>
              {monthLabel(m.key)}
            </Text>
          ))}
        </View>
      </View>

      <Text style={[styles.stats, { color: colorTheme.ink3 }]}>
        Average {rm(floor.average)} · Best {rm(floor.best)} · {sourceCount} source{sourceCount === 1 ? '' : 's'}
      </Text>

      <Text style={[styles.body, { color: colorTheme.ink2 }]}>
        {floor.floor > floor.average
          ? 'One weak month pulls your average below what you normally earn. The floor is the fairer number, and the one a lender can rely on.'
          : 'Your income moves month to month. That is normal for the work you do, and a lender can still underwrite the floor.'}
      </Text>
    </Card>
  );
}

/** One segment of the escapability bar. Zero-width segments are dropped entirely by the caller. */
function Segment({ amount, total, color }: { amount: number; total: number; color: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return <View style={[styles.segment, { flexGrow: pct, backgroundColor: color }]} />;
}

/**
 * Card B — how escapable each ringgit of spending is, and what a weak month therefore leaves.
 *
 * A stacked bar rather than a pie, ordered least-escapable → most-escapable: the ordering IS the
 * information, and a pie throws it away.
 */
export function ExpenseStructureCard({
  structure,
  floor,
  obligations,
}: {
  structure: ExpenseStructure;
  floor: IncomeFloor;
  obligations: DetectedObligation[];
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [open, setOpen] = useState(false);

  if (structure.monthlyTotal <= 0) {
    return (
      <Card style={styles.card}>
        <View style={styles.head}>
          <Text style={[styles.kicker, { color: colorTheme.ink2 }]}>HOW YOU SPEND</Text>
          <InfoButton entry="committed_spend" />
        </View>
        <Text style={[styles.thinTitle, { color: colorTheme.ink }]}>No spending recorded yet</Text>
        <Text style={[styles.body, { color: colorTheme.ink2 }]}>Once there is some spending here we can show how much of your month is already spoken for.</Text>
      </Card>
    );
  }

  const surplus = dependableSurplus(floor.floor, structure);
  const capacity = serviceableCapacity(floor.floor, structure);
  const short = surplus < 0;
  const { committed, essentialVariable, flexible, monthlyTotal } = structure;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: colorTheme.ink2 }]}>HOW YOU SPEND</Text>
        <InfoButton entry="committed_spend" />
      </View>

      {floor.reliable ? (
        <>
          <Text style={[styles.hero, { color: colorTheme.ink }, short && { color: colorTheme.amber }]}>
            {rm(surplus)}
            <Text style={[styles.heroSuffix, { color: colorTheme.ink2 }]}>{short ? ' short in a weak month' : ' left over, even in a weak month'}</Text>
          </Text>
          <Text style={[styles.sub, { color: colorTheme.ink2 }]}>
            {short
              ? `In your weakest months, spending runs ahead of income. ${rm(flexible)} of it is flexible.`
              : `Your ${rm(floor.floor)} floor, after ${rm(monthlyTotal)} of typical spending`}
          </Text>
        </>
      ) : (
        <Text style={[styles.hero, { color: colorTheme.ink }]}>
          {rm(monthlyTotal)}
          <Text style={[styles.heroSuffix, { color: colorTheme.ink2 }]}> a month, typically</Text>
        </Text>
      )}

      <View
        style={styles.stack}
        accessible
        accessibilityLabel={
          `Monthly spending ${rm(monthlyTotal)}: committed ${rm(committed)}, essential but variable ` +
          `${rm(essentialVariable)}, flexible ${rm(flexible)}.`
        }
      >
        {committed > 0 && <Segment amount={committed} total={monthlyTotal} color={colorTheme.ink} />}
        {essentialVariable > 0 && <Segment amount={essentialVariable} total={monthlyTotal} color={theme.accentInk} />}
        {flexible > 0 && <Segment amount={flexible} total={monthlyTotal} color={FLEXIBLE_COLOR} />}
      </View>

      <View style={styles.legend}>
        {committed > 0 && <LegendItem color={colorTheme.ink} label="Committed" amount={committed} note="fixed" />}
        {essentialVariable > 0 && <LegendItem color={theme.accentInk} label="Essential" amount={essentialVariable} note="can compress" />}
        {flexible > 0 && <LegendItem color={FLEXIBLE_COLOR} label="Flexible" amount={flexible} note="could redirect" />}
      </View>

      {obligations.length > 0 && (
        <View style={styles.obligations}>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Hide the committed items' : 'Show the committed items'}
            style={styles.obligationsToggle}
            hitSlop={6}
          >
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} color={colorTheme.ink2} stroke={2} />
            <Text style={[styles.obligationsToggleText, { color: colorTheme.ink2 }]}>
              The {rm(committed)} you are committed to ({obligations.length} item{obligations.length === 1 ? '' : 's'})
            </Text>
          </Pressable>
          {open && (
            <FadeIn style={[styles.obligationsBody, { backgroundColor: colorTheme.surface2 }]} duration={220} offset={4}>
              {obligations.map((o, i) => (
                <View key={i} style={styles.obligationRow}>
                  <View style={styles.obligationHead}>
                    <Text style={[styles.obligationLabel, { color: colorTheme.ink }]} numberOfLines={1}>
                      {o.label}
                    </Text>
                    <Text style={[styles.obligationAmount, { color: colorTheme.ink }]}>{rm(o.monthlyAmount)}</Text>
                  </View>
                  <Text style={[styles.obligationMeta, { color: colorTheme.ink3 }]}>
                    {o.kind} · seen in {o.monthsObserved} months
                  </Text>
                </View>
              ))}
            </FadeIn>
          )}
        </View>
      )}

      <Text style={[styles.body, { color: colorTheme.ink2 }]}>
        {committed <= 0
          ? 'Nothing recurring was detected, so none of your month is locked into fixed commitments yet.'
          : `${Math.round(structure.committedRatio * 100)}% of your spending is locked in. ` +
            (structure.committedRatio < 0.35
              ? 'Most of your month can still flex if income dips.'
              : 'That leaves less room to absorb a weak month.')}
        {floor.reliable && flexible > 0 && !short
          ? ` Redirect the flexible part and a weak month could put ${rm(capacity)} toward a repayment.`
          : ''}
      </Text>
    </Card>
  );
}

/**
 * The monthly-recap variant: ONE month measured against the borrower's own normal.
 *
 * Deliberately not the same card as the credit screen's. The recap already reports this month's
 * income, spending and category breakdown; what it cannot say is whether the month was a good one
 * *for this person*, or how much of it was ever theirs to move. A RM2,400 month means nothing
 * until you know the floor is RM2,015.
 *
 * `structure` must be computed over this month's transactions only, using obligations detected
 * across the FULL history — a single month can never establish that something recurs.
 */
export function MonthVsNormalCard({
  monthIncome,
  floor,
  structure,
}: {
  monthIncome: number;
  floor: IncomeFloor;
  structure: ExpenseStructure;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const hasSpend = structure.monthlyTotal > 0;
  if (!floor.reliable && !hasSpend) return null;

  const delta = monthIncome - floor.floor;
  const above = delta >= 0;
  const { committed, essentialVariable, flexible, monthlyTotal } = structure;

  return (
    <Card style={styles.recapCard}>
      {/* Two InfoButtons, not one: this card covers both the income-floor comparison above and
          the committed/essential/flexible split below, and each has its own glossary entry.
          Same pattern as the score+band pair of (i) buttons under the credit gauge. */}
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: colorTheme.ink2 }]}>AGAINST YOUR NORMAL</Text>
        <View style={styles.headInfoGroup}>
          <InfoButton entry="income_floor" />
          {hasSpend && <InfoButton entry="committed_spend" />}
        </View>
      </View>

      {floor.reliable && monthIncome > 0 && (
        <View
          style={styles.compare}
          accessible
          accessibilityLabel={
            `Income this month ${rm(monthIncome)}, ${rm(delta)} ${above ? 'above' : 'below'} ` +
            `your usual floor of ${rm(floor.floor)}.`
          }
        >
          <Text style={[styles.compareValue, { color: colorTheme.ink }]}>{rm(monthIncome)}</Text>
          <Text style={[styles.compareDelta, { color: above ? theme.accent : colorTheme.amber }]}>
            {above ? '▲' : '▼'} {rm(delta)} {above ? 'above' : 'below'} your usual {rm(floor.floor)}
          </Text>
        </View>
      )}

      {hasSpend && (
        <>
          <View
            style={styles.stack}
            accessible
            accessibilityLabel={
              `Spending this month ${rm(monthlyTotal)}: committed ${rm(committed)}, essential but ` +
              `variable ${rm(essentialVariable)}, flexible ${rm(flexible)}.`
            }
          >
            {committed > 0 && <Segment amount={committed} total={monthlyTotal} color={colorTheme.ink} />}
            {essentialVariable > 0 && <Segment amount={essentialVariable} total={monthlyTotal} color={theme.accentInk} />}
            {flexible > 0 && <Segment amount={flexible} total={monthlyTotal} color={FLEXIBLE_COLOR} />}
          </View>
          {/* Compact legend: the recap is a glance, so the buckets carry a figure each and no
              explanatory note. The credit screen is where the fuller reading lives. */}
          <View style={styles.compactLegend}>
            {committed > 0 && <CompactLegendItem color={colorTheme.ink} label="Committed" amount={committed} />}
            {essentialVariable > 0 && <CompactLegendItem color={theme.accentInk} label="Essential" amount={essentialVariable} />}
            {flexible > 0 && <CompactLegendItem color={FLEXIBLE_COLOR} label="Flexible" amount={flexible} />}
          </View>
        </>
      )}
    </Card>
  );
}

function CompactLegendItem({ color, label, amount }: { color: string; label: string; amount: number }) {
  const colorTheme = useThemeColors();
  return (
    <View style={styles.compactLegendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.compactLegendLabel, { color: colorTheme.ink2 }]}>{label}</Text>
      <Text style={[styles.compactLegendAmount, { color: colorTheme.ink }]}>{rm(amount)}</Text>
    </View>
  );
}

function LegendItem({ color, label, amount, note }: { color: string; label: string; amount: number; note: string }) {
  const colorTheme = useThemeColors();
  return (
    <View style={styles.legendItem}>
      <View style={styles.legendHead}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={[styles.legendLabel, { color: colorTheme.ink2 }]}>{label}</Text>
      </View>
      <Text style={[styles.legendAmount, { color: colorTheme.ink }]}>{rm(amount)}</Text>
      <Text style={[styles.legendNote, { color: colorTheme.ink3 }]}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Deliberately NOT right-aligned: every other card's InfoButton sits packed right after its
  // kicker text (see `head` above), and this should read the same way, just with two icons.
  headInfoGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { fontFamily: uiFont(600), fontSize: 10.5, letterSpacing: 1 },

  hero: { fontFamily: numFont(700), fontSize: 26, marginTop: 10 },
  heroSuffix: { fontFamily: uiFont(600), fontSize: 13 },
  sub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  thinTitle: { fontFamily: uiFont(700), fontSize: 15, marginTop: 10 },
  body: { fontFamily: uiFont(500), fontSize: 12, marginTop: 10, lineHeight: 17.5 },
  stats: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 10 },

  chart: { marginTop: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT, gap: 4, position: 'relative' },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: 3, width: '100%' },
  floorLine: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1 },
  monthRow: { flexDirection: 'row', gap: 4, marginTop: 5 },
  monthLabel: { flex: 1, textAlign: 'center', fontFamily: uiFont(500), fontSize: 9.5 },

  stack: { flexDirection: 'row', height: 12, borderRadius: 999, overflow: 'hidden', marginTop: 14, gap: 2 },
  segment: { flexBasis: 0, height: 12 },

  legend: { flexDirection: 'row', marginTop: 10, gap: 10 },
  legendItem: { flex: 1, gap: 1 },
  legendHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { fontFamily: uiFont(600), fontSize: 11 },
  legendAmount: { fontFamily: numFont(700), fontSize: 12.5 },
  legendNote: { fontFamily: uiFont(500), fontSize: 10 },

  // Recap variant: the screen lays its own cards out with horizontal margins, so this one
  // carries them rather than relying on a parent's padding.
  recapCard: { marginHorizontal: 16, marginTop: 4, padding: 16, borderRadius: 20 },
  compactLegend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, columnGap: 16, rowGap: 6 },
  compactLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactLegendLabel: { fontFamily: uiFont(500), fontSize: 12 },
  compactLegendAmount: { fontFamily: numFont(700), fontSize: 12 },
  compare: { marginTop: 10 },
  compareValue: { fontFamily: numFont(700), fontSize: 24 },
  compareDelta: { fontFamily: uiFont(600), fontSize: 12.5, marginTop: 3 },

  obligations: { marginTop: 12 },
  obligationsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  obligationsToggleText: { fontFamily: uiFont(600), fontSize: 12, flex: 1 },
  obligationsBody: { marginTop: 8, borderRadius: 10, padding: 10, gap: 8 },
  obligationRow: { gap: 2 },
  obligationHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  obligationLabel: { fontFamily: uiFont(600), fontSize: 12, flex: 1 },
  obligationAmount: { fontFamily: numFont(700), fontSize: 12 },
  obligationMeta: { fontFamily: uiFont(500), fontSize: 10.5 },
});
