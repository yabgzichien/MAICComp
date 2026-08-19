// src/components/LenderRequirements.tsx (lender requirements + rates, 2026-08-03)
// One panel, three screens: the Credit Passport (before a request is sent), My Financing, and
// Build my score all show the SAME published criteria for a lender, from the same pure module
// (lib/lenderCriteria.ts). A borrower comparing lenders on one screen and applying on another
// must not be shown two different sets of bars.
//
// Collapsed it is a single line of rate + entry bar, so it costs almost no vertical space on a
// screen that already has a lot to say; expanded it is the full requirement list and rate table.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  aprPct,
  aprRangeLabel,
  criteriaBarsSummary,
  criteriaSummary,
  lenderCriteria,
  reachableTier,
  requirementRows,
  tenorRangeLabel,
  tierRows,
  type BorrowerStanding,
  type RequirementStatus,
} from '../lib/lenderCriteria';
import type { LenderProfile } from '../lib/lenderDirectory';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { numFont, uiFont } from '../theme';
import { Icon } from './Icon';

/** An unmet bar is amber, never red: it is something to work toward (that is what Build my
 *  score is for), not a rejection. */
function StatusDot({ status }: { status: RequirementStatus }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  if (status === 'info') return <Icon name="dots" size={7} color={colorTheme.ink3} />;
  if (status === 'met') return <Icon name="check" size={13} color={theme.accentInk} stroke={2.6} />;
  return <Icon name="alert" size={13} color={colorTheme.amber} stroke={2.2} />;
}

export function LenderRequirements({
  lender,
  you,
  initiallyOpen = false,
  style,
}: {
  lender: LenderProfile;
  /** The borrower's standing, so each bar can be marked met or not yet. Omit to show bars only. */
  you?: BorrowerStanding;
  initiallyOpen?: boolean;
  style?: any;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const statusColor: Record<RequirementStatus, string> = {
    met: theme.accentInk,
    unmet: colorTheme.amber,
    info: colorTheme.ink3,
  };
  const criteria = lenderCriteria(lender);
  const rows = requirementRows(criteria, you);
  const tiers = tierRows(criteria, you);
  // Score AND coverage, the same two gates the engine applies, so a rung is only called
  // "yours today" when the console would in fact put the borrower on it today.
  const yourTier = you ? reachableTier(criteria, you) : null;

  return (
    <View style={[styles.box, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, style]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${lender.name} requirements and rates. ${criteriaSummary(criteria)}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colorTheme.ink }]} numberOfLines={1}>
            What {lender.name} looks for
          </Text>
          <Text style={[styles.summary, { color: colorTheme.ink2 }]} numberOfLines={2}>
            {criteriaBarsSummary(criteria)}
          </Text>
        </View>
        <View style={[styles.rateChip, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
          <Text style={[styles.rateChipText, { color: theme.onTint }]}>{aprRangeLabel(criteria)}</Text>
        </View>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={15} color={colorTheme.ink3} />
      </Pressable>

      {open && (
        <View style={[styles.body, { borderTopColor: colorTheme.line2 }]}>
          <Text style={[styles.sectionLabel, { color: colorTheme.ink2 }]}>THEIR REQUIREMENTS</Text>
          {rows.map((r) => (
            <View key={r.id} style={styles.reqRow}>
              <View style={styles.reqIcon}>
                <StatusDot status={r.status} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reqLabel, { color: colorTheme.ink }]}>{r.label}</Text>
                {r.detail && <Text style={[styles.reqDetail, { color: statusColor[r.status] }]}>{r.detail}</Text>}
              </View>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { color: colorTheme.ink2 }, { marginTop: 14 }]}>THEIR RATES</Text>
          {tiers.map((t) => (
            <View key={t.id} style={[styles.tierRow, { borderTopColor: colorTheme.line2 }, yourTier?.id === t.id && { backgroundColor: theme.accentTint, borderRadius: 8, paddingHorizontal: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tierLabel, { color: colorTheme.ink }]} numberOfLines={1}>
                  {t.label}
                  {yourTier?.id === t.id ? ' · your tier today' : ''}
                </Text>
                <Text style={[styles.tierTerms, { color: colorTheme.ink2 }]}>
                  Score {t.minScore}+ · RM{Math.round(t.minAmount).toLocaleString('en-MY')}–
                  {Math.round(t.maxAmount).toLocaleString('en-MY')} · {t.tenorMonths} months
                </Text>
              </View>
              <Text style={[styles.tierApr, { color: theme.accentInk }, you && !t.qualified && { color: colorTheme.ink3 }]}>{aprPct(t.apr)}</Text>
            </View>
          ))}
          <Text style={[styles.foot, { color: colorTheme.ink3 }]}>
            Published by {lender.name}. Repayment terms run {tenorRangeLabel(criteria)}. Your rate is the tier your
            score and recorded history reach, and the amount is capped by what your cash flow supports.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 11 },
  title: { fontFamily: uiFont(700), fontSize: 12.5 },
  summary: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2, lineHeight: 15 },
  rateChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  rateChipText: { fontFamily: numFont(700), fontSize: 11 },

  body: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1 },
  sectionLabel: { fontFamily: uiFont(700), fontSize: 10.5, letterSpacing: 0.9, marginTop: 12, marginBottom: 6 },

  reqRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  reqIcon: { width: 15, alignItems: 'center', paddingTop: 2 },
  reqLabel: { fontFamily: uiFont(500), fontSize: 12, lineHeight: 17 },
  reqDetail: { fontFamily: uiFont(600), fontSize: 11.5, marginTop: 1 },

  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1 },
  tierLabel: { fontFamily: uiFont(700), fontSize: 12 },
  tierTerms: { fontFamily: uiFont(500), fontSize: 11, marginTop: 2, lineHeight: 15 },
  tierApr: { fontFamily: numFont(700), fontSize: 13.5 },

  foot: { fontFamily: uiFont(500), fontSize: 11, lineHeight: 15, marginTop: 10 },
});
