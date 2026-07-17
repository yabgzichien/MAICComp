// src/screens/PassportCoachScreen.tsx
// The Passport Builder Coach: a guide-and-simulate surface. Every number shown is computed by
// src/lib/coachPlan.ts re-running the real engines; the LLM only narrates the plan. Degrades to a
// deterministic scripted line when no API key / network / on timeout  the numbers are always real.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoinMascot } from '../components/CoinMascot';
import { FadeIn } from '../components/Motion';
import { Icon } from '../components/Icon';
import { TourAnchor } from '../components/TourAnchor';
import { emitTourSignal } from '../lib/tourSignals';
import { Card, TopBar } from '../components/ui';
import { getProvider } from '../llm';
import { buildCoachPrompt, COACH_SYSTEM_PROMPT, coachPlanFallback } from '../llm/coachPrompt';
import { baseline, buildCoachPlan, type CoachAction, type CoachLever, type CoachSim } from '../lib/coachPlan';
import { fetchLenderDirectory, type LenderDirectory } from '../lib/lenderDirectory';
import { BORROWER_TOUR_STEPS, clampTourStep } from '../lib/tourSteps';
import { configFor, loadSettings } from '../settings/settingsStore';
import { useAppData } from '../state/store';
import { useCreditProfile } from '../state/useCreditProfile';
import { colors, numFont, uiFont } from '../theme';

const COACH_TIMEOUT_MS = 12_000;

function rm(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}
function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
// Mirrors LoansScreen's wording: "Likely" makes clear this is the deterministic loan engine's
// policy projection for a simulated scenario, never an actual approval granted by this screen.
function decisionLabel(d: CoachSim['decisionTo']): string {
  return d === 'approve' ? 'Likely approved' : d === 'refer' ? 'Refer for review' : 'Likely declined';
}

// Short, honest badges for the lender strip  policy projections, never approvals.
const VERDICT_SHORT: Record<CoachSim['decisionTo'], string> = {
  approve: 'Likely eligible',
  refer: 'Manual review',
  decline: 'Not yet',
};

/** Plain-English resilience line for an approved offer under income shocks (feature B). */
function stressLabel(dipPct: number): string {
  if (dipPct >= 20) return `Resilient. This offer holds even a ${dipPct}% income dip`;
  if (dipPct >= 10) return `Holds a ${dipPct}% income dip`;
  return 'Tight. Even a 10% income dip would strain it';
}

/** Where "Start now" deep-links for each lever (feature G). */
const START_LABEL: Record<CoachLever, string> = {
  coverage: 'Scan more history',
  surplus: 'Set a budget',
  track: 'See loan offers',
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** One before→after row inside a delta card. */
function DeltaRow({ label, from, to, highlight }: { label: string; from: string; to: string; highlight?: boolean }) {
  const changed = from !== to;
  return (
    <View style={styles.deltaRow}>
      <Text style={styles.deltaLabel}>{label}</Text>
      <View style={styles.deltaValues}>
        <Text style={styles.deltaFrom}>{from}</Text>
        <Icon name="chevronRight" size={13} color={colors.ink3} />
        <Text style={[styles.deltaTo, changed && highlight && { color: colors.accent }]}>{to}</Text>
      </View>
    </View>
  );
}

function SimCard({
  action,
  tone,
  onStart,
}: {
  action: CoachAction;
  tone: 'plan' | 'whatif';
  onStart?: (lever: CoachLever) => void;
}) {
  const s = action.sim;
  return (
    <Card style={tone === 'whatif' ? [styles.simCard, styles.simCardWhatIf] : styles.simCard}>
      <View style={styles.simHead}>
        <Text style={styles.simLabel}>{action.label}</Text>
        <View style={styles.magPill}>
          <Text style={styles.magText}>{action.magnitude}</Text>
        </View>
      </View>
      <DeltaRow label="Score" from={String(s.scoreFrom)} to={String(s.scoreTo)} highlight />
      <DeltaRow label="Confidence" from={pct(s.confidenceFrom)} to={pct(s.confidenceTo)} highlight />
      <DeltaRow label="Policy outcome" from={decisionLabel(s.decisionFrom)} to={decisionLabel(s.decisionTo)} highlight />
      <DeltaRow label="Amount" from={rm(s.maxAmountFrom)} to={rm(s.maxAmountTo)} highlight />
      {!action.changed && action.note && <Text style={styles.flatNote}>{action.note}</Text>}
      {action.survivesDipPct !== undefined && (
        <View style={styles.stressRow}>
          <Icon name="alert" size={13} color={action.survivesDipPct >= 20 ? colors.accent : colors.amber} stroke={2} />
          <Text style={[styles.stressText, { color: action.survivesDipPct >= 20 ? colors.accentInk : '#a05c00' }]}>
            {stressLabel(action.survivesDipPct)}
          </Text>
        </View>
      )}
      {tone === 'plan' && onStart && (
        <Pressable onPress={() => onStart(action.lever)} style={styles.startBtn}>
          <Text style={styles.startBtnText}>{START_LABEL[action.lever]}</Text>
          <Icon name="chevronRight" size={15} color={colors.onAccent} stroke={2.4} />
        </Pressable>
      )}
    </Card>
  );
}

export function PassportCoachScreen({
  onBack,
  onStart = () => {},
}: {
  onBack: () => void;
  onStart?: (lever: CoachLever) => void;
}) {
  const insets = useSafeAreaInsets();
  const { coachInput } = useCreditProfile();
  const { tourActive, tourStepIndex } = useAppData();
  const activeTourAnchor = tourActive ? BORROWER_TOUR_STEPS[clampTourStep(tourStepIndex, BORROWER_TOUR_STEPS.length)].anchorId ?? null : null;

  // Lender Match flywheel: the console's published ladders, fetched once. Only public
  // criteria travel (lender → borrower); the simulation below never leaves the device.
  const [dir, setDir] = useState<LenderDirectory | null>(null);
  const [lenderId, setLenderId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchLenderDirectory().then((d) => {
      if (!live) return;
      setDir(d);
      setLenderId(d.lenders[0]?.id ?? null);
    });
    return () => {
      live = false;
    };
  }, []);

  const selectedLender = useMemo(
    () => dir?.lenders.find((l) => l.id === lenderId) ?? dir?.lenders[0] ?? null,
    [dir, lenderId]
  );
  // The lender's ladder AND its published thresholds (Brief N): "what this lender would
  // say" simulates under the policy their console actually decides with.
  const planInput = useMemo(
    () => (selectedLender ? { ...coachInput, products: selectedLender.products, policy: selectedLender.policy } : coachInput),
    [coachInput, selectedLender]
  );
  const plan = useMemo(() => buildCoachPlan(planInput), [planInput]);
  // Per-lender verdict badges: the cheap baseline evaluation only, never a full plan per card.
  const verdicts = useMemo(
    () =>
      new Map(
        (dir?.lenders ?? []).map((l) => [l.id, baseline({ ...coachInput, products: l.products, policy: l.policy }).loan.decision])
      ),
    [dir, coachInput]
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [narration, setNarration] = useState<{ at: string; text: string; ai: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // Narration is keyed on lender + score so switching lenders re-narrates the new plan.
  const planKey = `${selectedLender?.id ?? 'base'}:${plan.baseline.score}`;

  const runCoach = async () => {
    setBusy(true);
    try {
      const c = configFor(await loadSettings(), 'general');
      const text = await withTimeout(
        getProvider(c.provider).coach({
          apiKey: c.apiKey,
          model: c.model,
          system: COACH_SYSTEM_PROMPT,
          prompt: buildCoachPrompt(plan),
        }),
        COACH_TIMEOUT_MS
      );
      setNarration({ at: planKey, text: text.trim(), ai: true });
    } catch {
      // Graceful degradation: real numbers, scripted prose.
      setNarration({ at: planKey, text: coachPlanFallback(plan), ai: false });
    } finally {
      setBusy(false);
    }
  };

  // Auto-run once per lender+score; waits for the directory so the first narration
  // already describes the selected lender's ladder. Falls back instantly without an LLM.
  useEffect(() => {
    if (dir && narration?.at !== planKey) runCoach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, dir]);

  const b = plan.baseline;
  const activeWhatIf = selected !== null ? plan.whatIfs[selected] : null;

  // When no spending cut can move the offer (e.g. blocked by the coverage gate), collapse the
  // surplus chips into one honest line instead of showing several identical flat chips.
  const surplusWhatIfs = plan.whatIfs.filter((w) => w.lever === 'surplus');
  const surplusAllFlat = surplusWhatIfs.length > 0 && surplusWhatIfs.every((s) => !s.changed);
  const chips = plan.whatIfs
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !(w.lever === 'surplus' && surplusAllFlat));

  return (
    <FadeIn style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Build my score" onBack={onBack} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* Baseline */}
        <Card style={styles.baseCard}>
          <Text style={styles.baseKicker}>WHERE YOU STAND</Text>
          <View style={styles.baseRow}>
            <Text style={styles.baseBand}>{b.band}</Text>
            <Text style={styles.baseScore}>{b.score}<Text style={styles.baseScoreDenom}>/900</Text></Text>
          </View>
          <Text style={styles.baseSub}>
            {pct(b.confidence)} data confidence · current policy outcome: {decisionLabel(b.decision).toLowerCase()}
            {b.maxAmount > 0 ? ` up to ${rm(b.maxAmount)}` : ''}
          </Text>
          {plan.diagnosis.constraint !== 'none' && (
            <View style={styles.blockerRow}>
              <Text style={styles.blockerLabel}>BIGGEST BLOCKER</Text>
              <Text style={styles.blockerText}>{plan.diagnosis.label}</Text>
            </View>
          )}
        </Card>

        {/* Lender strip  the flywheel: pick whose published criteria to coach against */}
        {dir && selectedLender && (
          <>
            <Text style={styles.sectionLabel}>COACHING AGAINST</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lenderRow}>
              {dir.lenders.map((l) => {
                const active = l.id === selectedLender.id;
                const v = verdicts.get(l.id) ?? 'refer';
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => {
                      setLenderId(l.id);
                      setSelected(null); // what-if chips are ladder-specific
                    }}
                    style={[styles.lenderCard, active && styles.lenderCardActive]}
                  >
                    <View style={styles.lenderHead}>
                      <View style={[styles.lenderDot, { backgroundColor: l.brandColor }]} />
                      <Text style={[styles.lenderName, active && styles.lenderNameActive]} numberOfLines={2}>
                        {l.name}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.verdictPill,
                        v === 'approve' ? styles.verdictPillOk : v === 'refer' ? styles.verdictPillRefer : styles.verdictPillNo,
                      ]}
                    >
                      <Text
                        style={[
                          styles.verdictText,
                          { color: v === 'approve' ? colors.accentInk : v === 'refer' ? '#a05c00' : colors.red },
                        ]}
                      >
                        {VERDICT_SHORT[v]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {dir.offline ? (
              <Text style={styles.offlineNote}>Lender directory unreachable. Coaching against the generic Pip ladder.</Text>
            ) : (
              <Text style={styles.lenderBlurb}>{selectedLender.blurb}</Text>
            )}
          </>
        )}

        {/* Pip's take (AI narration, provenance-tagged) */}
        <Card style={styles.pipCard}>
          <View style={styles.pipHead}>
            <CoinMascot size={34} float />
            <Text style={styles.pipTitle}>Pip's take</Text>
            <View style={[styles.provTag, narration?.ai ? styles.provAi : styles.provComputed]}>
              <Text style={[styles.provText, { color: narration?.ai ? colors.accent : colors.ink3 }]}>
                {busy ? '…' : narration?.ai ? 'AI' : 'Summary'}
              </Text>
            </View>
          </View>
          {busy && !narration ? (
            <ActivityIndicator size="small" color={colors.accent} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
          ) : (
            <Text style={styles.pipText}>{narration?.text ?? coachPlanFallback(plan)}</Text>
          )}
        </Card>

        {/* Ranked plan */}
        {plan.actions.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>YOUR NEXT STEPS</Text>
            {plan.actions.map((a, i) =>
              i === 0 ? (
                <TourAnchor key={a.lever} id="coach-hero-card" activeId={activeTourAnchor}>
                  <SimCard action={a} tone="plan" onStart={onStart} />
                </TourAnchor>
              ) : (
                <SimCard key={a.lever} action={a} tone="plan" onStart={onStart} />
              )
            )}
          </>
        ) : (
          <Card style={styles.doneCard}>
            <Icon name="check" size={20} color={colors.accent} stroke={2.4} />
            <Text style={styles.doneText}>You're making the most of your current data. Keep logging new transactions to hold your standing.</Text>
          </Card>
        )}

        {/* What-if chips */}
        {plan.whatIfs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>TRY A WHAT-IF</Text>
            <TourAnchor id="whatif-chips" activeId={activeTourAnchor}>
              <View style={styles.chipRow}>
                {chips.map(({ w, i }) => (
                  <Pressable
                    key={`${w.lever}-${w.magnitude}`}
                    onPress={() => {
                      setSelected(selected === i ? null : i);
                      emitTourSignal('coach-chip-tapped');
                    }}
                    style={[styles.chip, selected === i && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, selected === i && styles.chipTextActive]}>{w.magnitude}</Text>
                  </Pressable>
                ))}
              </View>
            </TourAnchor>
            {surplusAllFlat && <Text style={styles.blockedNote}>{surplusWhatIfs[0].note}</Text>}
            {activeWhatIf && <SimCard action={activeWhatIf} tone="whatif" />}
          </>
        )}
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  baseCard: { padding: 18, borderRadius: 20 },
  baseKicker: { fontFamily: uiFont(600), fontSize: 11, letterSpacing: 1, color: colors.ink2, marginBottom: 8 },
  baseRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  baseBand: { fontFamily: uiFont(700), fontSize: 22, color: colors.ink },
  baseScore: { fontFamily: numFont(700), fontSize: 22, color: colors.accent },
  baseScoreDenom: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2 },
  baseSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 8, lineHeight: 17 },
  blockerRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  blockerLabel: { fontFamily: uiFont(600), fontSize: 11, letterSpacing: 1, color: colors.ink2, marginBottom: 3 },
  blockerText: { fontFamily: uiFont(700), fontSize: 14, color: colors.red },

  lenderRow: { gap: 8, paddingRight: 4 },
  lenderCard: { width: 150, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, padding: 12, gap: 10, justifyContent: 'space-between' },
  lenderCardActive: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  lenderHead: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  lenderDot: { width: 10, height: 10, borderRadius: 999, marginTop: 3 },
  lenderName: { flex: 1, fontFamily: uiFont(700), fontSize: 12.5, color: colors.ink, lineHeight: 16 },
  lenderNameActive: { color: colors.accentInk },
  verdictPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  verdictPillOk: { backgroundColor: colors.accentSoft },
  verdictPillRefer: { backgroundColor: '#fdf1dc' },
  verdictPillNo: { backgroundColor: '#fdeaea' },
  verdictText: { fontFamily: uiFont(700), fontSize: 11 },
  lenderBlurb: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 8, lineHeight: 16 },
  offlineNote: { fontFamily: uiFont(500), fontSize: 11.5, color: '#a05c00', marginTop: 8, lineHeight: 16 },

  pipCard: { padding: 16, borderRadius: 18, marginTop: 12, backgroundColor: colors.accentSoft },
  pipHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pipTitle: { fontFamily: uiFont(700), fontSize: 14, color: colors.accentInk, flex: 1 },
  provTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  provAi: { backgroundColor: colors.accentTint },
  provComputed: { backgroundColor: colors.surface },
  provText: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.5 },
  pipText: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink, lineHeight: 19, marginTop: 10 },

  sectionLabel: { fontFamily: uiFont(600), fontSize: 11, letterSpacing: 1, color: colors.ink2, marginTop: 20, marginBottom: 8 },

  simCard: { padding: 16, borderRadius: 16, marginBottom: 10 },
  simCardWhatIf: { borderWidth: 1.5, borderColor: colors.accent, marginTop: 4 },
  simHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  simLabel: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.ink, flex: 1, marginRight: 10 },
  magPill: { backgroundColor: colors.accentTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  magText: { fontFamily: numFont(700), fontSize: 11.5, color: colors.accent },

  deltaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  deltaLabel: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2 },
  deltaValues: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deltaFrom: { fontFamily: numFont(600), fontSize: 12.5, color: colors.ink2 },
  deltaTo: { fontFamily: numFont(700), fontSize: 13, color: colors.ink },
  flatNote: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 8, fontStyle: 'italic' },
  stressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  stressText: { fontFamily: uiFont(600), fontSize: 11.5, flex: 1, lineHeight: 15 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.accentInk, borderRadius: 12, paddingVertical: 11, marginTop: 12 },
  startBtnText: { fontFamily: uiFont(700), fontSize: 13, color: colors.onAccent },

  doneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, marginTop: 8 },
  doneText: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, flex: 1, lineHeight: 18 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.accentInk, borderColor: colors.accentInk },
  chipText: { fontFamily: numFont(600), fontSize: 12.5, color: colors.ink2 },
  chipTextActive: { color: colors.onAccent },
  blockedNote: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 4, lineHeight: 17 },
});
