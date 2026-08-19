import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Benchmark } from '../lib/belanjawanku';
import type { BenchmarkGap } from '../lib/belanjawankuBudget';
import { fmt } from '../lib/format';
import { useThemeColors } from '../state/colorScheme';
import { uiFont } from '../theme';
import { Icon } from './Icon';
import { InfoButton } from './InfoButton';
import { Card, Eyebrow } from './ui';

/** One-line summary shown while the card is collapsed. */
function summaryOf(gaps: BenchmarkGap[]): string {
  if (gaps.length === 0) return 'Within the guide in every category it covers';
  const flexible = gaps.filter((g) => g.kind === 'flexible').length;
  const total = gaps.length;
  const noun = `${total} categor${total === 1 ? 'y' : 'ies'} above the guide`;
  return flexible > 0 ? `${noun}, ${flexible} you could trim` : noun;
}

/**
 * How this borrower's spending sits against Malaysia's national reference budget.
 *
 * Only over-guide lines are listed, which is a deliberate one-sidedness: `benchmarkGaps` cannot
 * produce a claim the guide does not support, so nothing here can read as "you are under-spending
 * on healthcare, treat yourself". The guide is a floor for essentials, not a target to hit.
 *
 * Collapsible because the card can run to several rows once both groups are present, and it sits
 * below the month's own progress list where the screen's core question already got answered.
 */
export function BenchmarkCard({
  benchmark,
  gaps,
  onChangeHousehold,
}: {
  benchmark: Benchmark;
  gaps: BenchmarkGap[];
  onChangeHousehold: () => void;
}) {
  const [open, setOpen] = useState(true);
  const colorTheme = useThemeColors();
  const flexible = gaps.filter((g) => g.kind === 'flexible');
  const essential = gaps.filter((g) => g.kind !== 'flexible');

  return (
    <Card style={styles.card}>
      {/* The info badge is a SIBLING of the collapse toggle, never nested inside it. Nesting one
          pressable in another leaves the outer responder free to claim the tap, and in practice
          neither fired. */}
      <View style={styles.eyebrowRow}>
        <Eyebrow>Against the national guide</Eyebrow>
        <InfoButton entry="belanjawanku" />
      </View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Collapse guide comparison' : 'Expand guide comparison'}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.household, { color: colorTheme.ink }]}>
            {benchmark.profileLabel} · {benchmark.cityLabel}
          </Text>
          {!open && <Text style={[styles.summary, { color: colorTheme.ink2 }]}>{summaryOf(gaps)}</Text>}
        </View>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={17} color={colorTheme.ink3} />
      </Pressable>

      {open && (
        <>
          {/* The comparison is against a three-month average, not this month alone. Saying so
              prevents the reasonable "but I did not spend that this month" objection. */}
          <Text style={[styles.window, { color: colorTheme.ink3 }]}>Your average of the last 3 months, against the guide.</Text>

          {gaps.length === 0 ? (
            <View style={styles.okRow}>
              <Icon name="check" size={16} color="#1f8a5b" stroke={2.4} />
              <Text style={[styles.okText, { color: colorTheme.ink2 }]}>
                Your spending is within the guide in every category it covers.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 4 }}>
              {flexible.length > 0 && (
                <>
                  <Text style={[styles.group, { color: colorTheme.ink2 }]}>Where you could trim</Text>
                  {flexible.map((g) => (
                    <GapRow key={g.lineId} gap={g} tone="action" />
                  ))}
                </>
              )}
              {essential.length > 0 && (
                <>
                  <Text style={[styles.group, { color: colorTheme.ink2 }]}>Above the guide minimum</Text>
                  {essential.map((g) => (
                    <GapRow key={g.lineId} gap={g} tone="neutral" />
                  ))}
                  {/* The guide's essential figures are a floor, not a ceiling. Someone with a real
                      health need or a longer commute belongs above it, and the app must not imply
                      otherwise just because a number is larger. */}
                  <Text style={[styles.essentialNote, { color: colorTheme.ink2 }]}>
                    These are essentials, and the guide only sets the minimum for a decent standard
                    of living. Being above it is normal if it reflects a real need.
                  </Text>
                </>
              )}
            </View>
          )}

          <View style={styles.footer}>
            <Text style={[styles.source, { color: colorTheme.ink3 }]}>{benchmark.source}</Text>
            <Pressable
              onPress={onChangeHousehold}
              style={({ pressed }) => [
                styles.changeBtn,
                { borderColor: colorTheme.line, backgroundColor: colorTheme.surface2 },
                { opacity: pressed ? 0.75 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.changeText, { color: colorTheme.ink2 }]}>Change</Text>
            </Pressable>
          </View>
        </>
      )}
    </Card>
  );
}

function GapRow({ gap, tone }: { gap: BenchmarkGap; tone: 'action' | 'neutral' }) {
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.gapRow, { borderTopColor: colorTheme.line2 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.gapLabel, { color: colorTheme.ink }]}>{gap.label}</Text>
        <Text style={[styles.gapDetail, { color: colorTheme.ink2 }]}>
          You spend RM {fmt(gap.actualAmount)}, the guide sets aside RM {fmt(gap.guideAmount)}
        </Text>
      </View>
      <Text style={[styles.gapOver, tone === 'neutral' && { color: colorTheme.ink2 }]}>
        +RM {fmt(gap.overBy)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  household: { fontFamily: uiFont(700), fontSize: 14.5 },
  summary: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 3 },
  window: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 8 },
  group: {
    fontFamily: uiFont(700),
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 2,
  },
  essentialNote: { fontFamily: uiFont(500), fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  okText: { flex: 1, fontFamily: uiFont(500), fontSize: 13, lineHeight: 18 },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  gapLabel: { fontFamily: uiFont(600), fontSize: 14 },
  gapDetail: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2 },
  gapOver: { fontFamily: uiFont(700), fontSize: 13.5, color: '#c5402f' },
  footer: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 12 },
  source: { flex: 1, fontFamily: uiFont(500), fontSize: 11, lineHeight: 15 },
  changeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: { fontFamily: uiFont(700), fontSize: 12.5 },
});
