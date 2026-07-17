// src/screens/CreditScreen.tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CoinMascot } from '../components/CoinMascot';
import { FadeIn } from '../components/Motion';
import { CreditGauge } from '../components/CreditGauge';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { Card, TopBar } from '../components/ui';
import { TourAnchor } from '../components/TourAnchor';
import { BORROWER_TOUR_STEPS, clampTourStep } from '../lib/tourSteps';
import { useAppData } from '../state/store';
import { useCreditProfile } from '../state/useCreditProfile';
import { colors, numFont, uiFont } from '../theme';

const TICK = colors.accent;
const CROSS = colors.red;

function verifiedLabel(c: number): string {
  if (c >= 0.7) return 'Verified';
  if (c >= 0.4) return 'Partially Verified';
  return 'Unverified';
}

function factorColor(score: number): string {
  if (score >= 70) return colors.accent;
  if (score >= 50) return colors.amber;
  return colors.red;
}

export function CreditScreen({
  onBack,
  onOpenLoans = () => {},
  onOpenPassport = () => {},
  onOpenCoach = () => {},
}: {
  onBack: () => void;
  onOpenLoans?: () => void;
  onOpenPassport?: () => void;
  onOpenCoach?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { score, dataConfidence, coverage, momentum } = useCreditProfile();
  const { tourActive, tourStepIndex } = useAppData();
  const capped = score.confidenceCapped;
  const confidence = dataConfidence.confidence;
  const activeTourAnchor = tourActive ? BORROWER_TOUR_STEPS[clampTourStep(tourStepIndex, BORROWER_TOUR_STEPS.length)].anchorId ?? null : null;

  const avg = Math.round(score.factors.reduce((s, f) => s + f.subScore, 0) / Math.max(score.factors.length, 1));
  const barColor = confidence >= 0.4 ? colors.accent : colors.red;

  return (
    <FadeIn style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title="Credit Profile"
          onBack={onBack}
          right={
            <Pressable onPress={onOpenPassport} style={styles.navIcon} hitSlop={6}>
              <Icon name="scan" size={18} color={colors.accent} />
            </Pressable>
          }
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* Gauge + confidence */}
        <Card style={styles.gaugeCard}>
          <View style={{ alignItems: 'center', paddingTop: 6 }}>
            <TourAnchor id="credit-gauge" activeId={activeTourAnchor}>
              <CreditGauge score={score.score} band={score.band} size={300} />
            </TourAnchor>
            <View style={styles.gaugeInfoRow}>
              <InfoButton entry="score" />
              <InfoButton entry="band" />
            </View>
          </View>
          <View style={styles.confBadge}>
            <View style={styles.confHead}>
              <Svg width={19} height={21} viewBox="0 0 19 21" fill="none">
                <Path d="M9.5 1L1.5 5v6.5C1.5 16 5 19.5 9.5 20c4.5-.5 8-4 8-8.5V5L9.5 1z" fill={colors.accentSoft} stroke={colors.accent} strokeWidth={1.5} strokeLinejoin="round" />
                <Path d="M6.5 11l2.5 2.5L13 8.5" stroke={colors.accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <View style={{ flex: 1 }}>
                <View style={styles.confTitleRow}>
                  <View style={styles.confTitleGroup}>
                    <Text style={styles.confTitle}>{verifiedLabel(confidence)}</Text>
                    <InfoButton entry="confidence" />
                  </View>
                  <Text style={styles.confPct}>{Math.round(confidence * 100)}%</Text>
                </View>
                <View style={styles.confTrack}>
                  <View style={{ height: '100%', width: `${Math.round(confidence * 100)}%`, borderRadius: 5, backgroundColor: barColor }} />
                </View>
              </View>
            </View>
            <Text style={styles.confCaption}>
              {coverage.daysCovered}/90 days covered. Add more sources to raise confidence.
            </Text>
            {momentum && momentum.direction !== 'flat' && (
              <View style={[styles.momentumRow, momentum.direction === 'falling' && styles.momentumRowDown]}>
                <Text style={[styles.momentumArrow, momentum.direction === 'falling' && { color: colors.red }]}>
                  {momentum.direction === 'rising' ? '↑' : '↓'}
                </Text>
                <Text style={styles.momentumText}>
                  {momentum.direction === 'rising' ? 'Rising' : 'Falling'} · {momentum.scoreFrom}→{momentum.scoreTo} · coverage{' '}
                  {momentum.coverageDaysFrom}→{momentum.coverageDaysTo} days over {momentum.lookbackDays}d
                </Text>
              </View>
            )}
            {capped && (
              <View style={styles.cappedRow}>
                <InfoButton entry="confidence" />
                <Text style={styles.cappedNote}>Your band is limited by data confidence. Verify more to unlock your full score.</Text>
              </View>
            )}
            <View style={{ marginTop: 10, gap: 6 }}>
              {dataConfidence.reasons.map((r) => (
                <View key={r.key} style={styles.reasonRow}>
                  <Icon name={r.ok ? 'check' : 'x'} size={14} color={r.ok ? TICK : CROSS} stroke={2.2} />
                  <Text style={styles.reasonText}>{r.detail}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        {/* Loans + Passport entry points (kept) */}
        <Pressable onPress={onOpenLoans} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
          <Card style={styles.cta}>
            <View style={styles.ctaIcon}><Icon name="wallet" size={22} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Loans</Text>
              <Text style={styles.ctaSub}>See offers, apply, and track repayments</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.ink3} />
          </Card>
        </Pressable>
        <Pressable onPress={onOpenPassport} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
          <Card style={styles.cta}>
            <View style={styles.ctaIcon}><Icon name="scan" size={22} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Credit Passport</Text>
              <Text style={styles.ctaSub}>Generate a signed credential to share with lenders</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.ink3} />
          </Card>
        </Pressable>
        <TourAnchor id="build-score-cta" activeId={activeTourAnchor}>
          <Pressable onPress={onOpenCoach} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
            <Card style={styles.cta}>
              <View style={styles.ctaIcon}><Icon name="trending" size={22} color={colors.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaTitle}>Build my score</Text>
                <Text style={styles.ctaSub}>See what unlocks a bigger loan, with live simulations</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.ink3} />
            </Card>
          </Pressable>
        </TourAnchor>

        {/* Factors */}
        <Card style={styles.factorsCard}>
          <View style={styles.factorsHead}>
            <View style={styles.factorsHeadLabelRow}>
              <Text style={styles.factorsHeadLabel}>Score Factors · {score.factors.length}</Text>
              <InfoButton entry="score" />
            </View>
            <Text style={styles.factorsHeadAvg}>Avg {avg}/100</Text>
          </View>
          {score.factors.map((f, idx) => {
            const c = f.notYetScored ? colors.ink3 : factorColor(f.subScore);
            return (
              <View key={f.key} style={[styles.factorRow, idx < score.factors.length - 1 && styles.factorDivider]}>
                <View style={styles.factorLabelRow}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  {f.notYetScored ? (
                    <Text style={[styles.factorScore, { color: c }]}>Not yet scored</Text>
                  ) : (
                    <Text style={[styles.factorScore, { color: c }]}>
                      {Math.round(f.subScore)}
                      <Text style={styles.factorScoreDenom}>/100</Text>
                    </Text>
                  )}
                </View>
                <View style={styles.factorTrack}>
                  <View
                    style={{
                      height: '100%',
                      width: f.notYetScored ? '100%' : `${Math.round(f.subScore)}%`,
                      borderRadius: 5,
                      backgroundColor: c,
                      opacity: f.notYetScored ? 0.25 : 1,
                    }}
                  />
                </View>
                <Text style={styles.factorEvidence}>{f.evidence}</Text>
                <Text style={styles.factorExplanation}>{f.explanation}</Text>
              </View>
            );
          })}
        </Card>
      </ScrollView>

      {/* Ask Pip bar → opens the Passport Builder Coach */}
      <Pressable onPress={onOpenCoach} style={[styles.askBar, { paddingBottom: insets.bottom + 12 }]}>
        <CoinMascot size={40} float />
        <View style={{ flex: 1 }}>
          <Text style={styles.askTitle}>Build my score with Pip</Text>
          <Text style={styles.askSub}>Simulate what unlocks a bigger loan</Text>
        </View>
        <View style={styles.askBtn}>
          <Text style={styles.askBtnText}>Open</Text>
        </View>
      </Pressable>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  navIcon: { width: 36, height: 36, borderRadius: 999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },

  gaugeCard: { borderRadius: 26, padding: 0, paddingTop: 18, overflow: 'hidden' },
  gaugeInfoRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  confBadge: { margin: 16, marginTop: 8, borderRadius: 16, backgroundColor: colors.accentSoft, padding: 14 },
  confHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  confTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confTitle: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk },
  confPct: { fontFamily: numFont(700), fontSize: 13, color: colors.accent },
  confTrack: { height: 5, borderRadius: 5, backgroundColor: 'rgba(20,40,30,0.10)', overflow: 'hidden' },
  confCaption: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 9, lineHeight: 16 },
  momentumRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, backgroundColor: colors.accentTint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  momentumRowDown: { backgroundColor: 'rgba(192,57,43,0.08)' },
  momentumArrow: { fontFamily: numFont(700), fontSize: 15, color: colors.accent },
  momentumText: { fontFamily: uiFont(600), fontSize: 11.5, color: colors.accentInk, flex: 1, lineHeight: 15 },
  cappedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 8 },
  cappedNote: { fontFamily: uiFont(600), fontSize: 11.5, color: '#a05c00', lineHeight: 16, flex: 1 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reasonText: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, flex: 1 },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginTop: 12 },
  ctaIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontFamily: uiFont(700), fontSize: 15, color: colors.ink },
  ctaSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 1 },

  factorsCard: { marginTop: 12, paddingHorizontal: 18, paddingBottom: 8, overflow: 'hidden' },
  factorsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  factorsHeadLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factorsHeadLabel: { fontFamily: uiFont(600), fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink2 },
  factorsHeadAvg: { fontFamily: numFont(600), fontSize: 12, color: colors.ink2 },
  factorRow: { paddingVertical: 11 },
  factorDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  factorLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  factorLabel: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink, flex: 1, marginRight: 8 },
  factorScore: { fontFamily: numFont(700), fontSize: 12.5 },
  factorScoreDenom: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2 },
  factorTrack: { height: 5, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden', marginBottom: 5 },
  factorEvidence: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, lineHeight: 16 },
  factorExplanation: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 2, lineHeight: 16 },

  askBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingTop: 12 },
  askTitle: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk, marginBottom: 1 },
  askSub: { fontFamily: uiFont(500), fontSize: 11, color: colors.ink2 },
  askBtn: { backgroundColor: colors.accentInk, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 9, minWidth: 76, alignItems: 'center', justifyContent: 'center' },
  askBtnText: { fontFamily: uiFont(700), fontSize: 12, color: colors.onAccent },
});
