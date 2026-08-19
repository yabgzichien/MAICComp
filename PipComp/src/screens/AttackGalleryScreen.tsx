// src/screens/AttackGalleryScreen.tsx
// The Adversarial Attack Gallery: runs a curated corpus of fraud techniques through the real
// Phase-11 integrity rings and reports, per attack, exactly how the deterministic engine responded.
// The numbers are all computed (src/lib/attackGallery.ts); the LLM only narrates the incident report.
//
// The screen is built around one argument a sceptical reader would otherwise have to take on
// trust, so it is made visible instead:
//   1. THE SETUP  every run uses the same deliberately-favourable borrower, stated in the same
//      constants the runner uses, so it is clear that only the data layer can stop the fraud.
//   2. THE CONTROL  an honest ledger through the identical probe, which must come back approved.
//      Without it, "6/6 caught" is equally consistent with an engine that refuses everyone.
//   3. THE ATTACKS  each one measured against the control, so a confidence number reads as a
//      drop from a known baseline rather than as an unanchored percentage.
// The corpus is evaluated once, up front; "Run all attacks" only *reveals* those already-computed
// results (src/lib/attackReveal.ts). Nothing about any outcome depends on the animation.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, useEasedFrom } from '../components/Motion';
import { Icon } from '../components/Icon';
import { Card, TopBar } from '../components/ui';
import { getLLM } from '../llm';
import { ATTACK_SYSTEM_PROMPT, attackFallback, buildAttackPrompt } from '../llm/attackPrompt';
import {
  PROBE,
  runControl,
  runGallery,
  signalLabel,
  type AttackResult,
  type AttackVerdict,
  type ControlResult,
} from '../lib/attackGallery';
import {
  applyRevealEvent,
  armedCards,
  revealPlan,
  MAX_VISIBLE_SIGNALS,
  type CardState,
  type CardStates,
} from '../lib/attackReveal';
import { fmt } from '../lib/format';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { colors, numFont, radius, uiFont } from '../theme';

const NARRATE_TIMEOUT_MS = 12_000;
const COUNTDOWN_MS = 900;
/** The control's card id in the reveal plan. Not an attack: it never scores a catch. */
const CONTROL_ID = 'control';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/** Small circular "i" trigger, visually matching the app's InfoButton (src/components/InfoButton)
 *  so an info affordance looks the same everywhere. Not wired to the shared glossary  the
 *  explanation here runs longer than a glossary entry, so it opens its own modal instead. */
function InfoBadge({ onPress }: { onPress: () => void }) {
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="What is the Attack Gallery?"
      style={({ pressed }) => [styles.infoBadge, pressed && styles.infoBadgePressed]}
    >
      <Text style={[styles.infoBadgeText, { color: colorTheme.ink3 }]}>i</Text>
    </Pressable>
  );
}

/** One line of the verdict legend: a colored dot, the pill word, and what it means for the money. */
function VerdictLegendRow({ color, label, meaning }: { color: string; label: string; meaning: string }) {
  const colorTheme = useThemeColors();
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colorTheme.ink }]}>{label}</Text>
      <Text style={[styles.legendMeaning, { color: colorTheme.ink2 }]}>{meaning}</Text>
    </View>
  );
}

/** What the gallery is and how to read it  opened from the info badge next to the title. Longer
 *  than the app's shared glossary entries, so it is its own modal rather than a GlossaryModal
 *  entry, but kept close to the screen's own visual language (kickers, cards) rather than
 *  borrowing generic modal chrome.
 *
 *  Renders nothing at all when closed, rather than toggling `visible` on an always-mounted
 *  `<Modal>`  react-native-web keeps a Modal's children in the DOM even once `visible` goes
 *  false (it only skips the initial mount), so a still-present sibling with the same screen
 *  position as the trigger badge can absorb the next tap. Matches GlossaryModal's own pattern
 *  (src/components/InfoButton.tsx), which renders an empty `<Modal visible={false} />` closed. */
function AboutModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colorTheme = useThemeColors();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalCenter} pointerEvents="box-none">
        <View style={[styles.modalCard, { backgroundColor: colorTheme.surface }]}>
          <View style={styles.modalHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalEyebrow, { color: colorTheme.ink3 }]}>ABOUT THIS SCREEN</Text>
              <Text style={[styles.modalTitle, { color: colorTheme.ink }]}>A live fraud self-test</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={[styles.modalCloseBtn, { backgroundColor: colorTheme.surface2 }]}>
              <Text style={[styles.modalCloseText, { color: colorTheme.ink2 }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalKicker, { color: colorTheme.ink2 }]}>WHAT IT IS</Text>
            <Text style={[styles.modalBody, { color: colorTheme.ink }]}>
              Six known fraud techniques (a faked salary, an all-P2P income statement, a doctored
              running balance, and three more) run through the app's real fraud-detection engine: the
              same Phase-11 integrity rings and loan-decision code that judges every real applicant.
              None of it is scripted. Press run and the checks fire live, against real data.
            </Text>

            <Text style={[styles.modalKicker, { color: colorTheme.ink2 }]}>WHY IT'S HERE</Text>
            <Text style={[styles.modalBody, { color: colorTheme.ink }]}>
              Any team can claim their fraud defences work. This screen lets you watch it happen
              instead of taking our word for it, including the one honest ledger in the mix, which has
              to get through clean. If it didn't, the six catches next to it would prove nothing.
            </Text>

            <Text style={[styles.modalKicker, { color: colorTheme.ink2 }]}>HOW TO READ IT</Text>
            <Text style={[styles.modalBody, { color: colorTheme.ink }]}>
              Every run uses the identical borrower profile (see "The setup"), so the only variable is
              the ledger behind it. The control card runs first and sets the baseline; each attack's
              confidence bar is measured against that same baseline, not against zero.
            </Text>
            <View style={[styles.legend, { backgroundColor: colorTheme.surface2 }]}>
              <VerdictLegendRow color={colors.accent} label="Caught" meaning="declined, or sent to a human to check" />
              <VerdictLegendRow color={colorTheme.amber} label="Flagged" meaning="approved, but confidence took a real hit" />
              <VerdictLegendRow color={colorTheme.red} label="Missed" meaning="got through clean; the residual we're honest about" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function verdictColor(v: AttackVerdict): string {
  return v === 'caught' ? colors.accent : v === 'flagged' ? colors.amber : colors.red;
}
function verdictLabel(v: AttackVerdict): string {
  return v === 'caught' ? 'Caught' : v === 'flagged' ? 'Flagged' : 'Missed';
}
/** What the loan engine's answer meant for the money actually at stake. */
function outcomeLine(decision: AttackResult['decision']): string {
  const rm = `RM${fmt(PROBE.request)}`;
  return decision === 'approve'
    ? `${rm} would have been paid out`
    : decision === 'refer'
      ? `${rm} held back for a human to check`
      : `${rm} refused`;
}

/** The confidence dial as a bar rather than a bare number, so the reader sees a *distance*: where
 *  honest data lands, where this ledger landed, and how far the checks moved it. Mounted at the
 *  moment its card resolves, so the sweep happens on screen. */
function ConfidenceBar({
  from,
  to,
  color,
  baseline,
  note,
}: {
  from: number;
  to: number;
  color: string;
  /** Draw a marker at the control's score. Omitted on the control card, which *is* the marker. */
  baseline?: number;
  note?: string;
}) {
  const colorTheme = useThemeColors();
  const shown = useEasedFrom(from, to, COUNTDOWN_MS);
  const settled = shown === to;
  const pct = Math.max(0, Math.min(100, shown * 100));

  return (
    <View style={styles.bar}>
      <View style={[styles.barTrack, { backgroundColor: colorTheme.surface2 }]}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
        {baseline !== undefined && (
          <View style={[styles.barTick, { left: `${Math.round(baseline * 100)}%`, backgroundColor: colorTheme.ink3 }]} />
        )}
      </View>
      <View style={styles.barLegend}>
        <Text style={[styles.barValue, { color }]}>
          {Math.round(shown * 100)}% data confidence
          {settled && note ? ` · ${note}` : ''}
        </Text>
        {baseline !== undefined && (
          <Text style={[styles.barBaseline, { color: colorTheme.ink3 }]}>honest data: {Math.round(baseline * 100)}%</Text>
        )}
      </View>
    </View>
  );
}

/** The negative control. It carries the argument the six catches cannot make on their own. */
function ControlCard({ control, state }: { control: ControlResult; state: CardState }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const resolved = state.stage === 'resolved';
  // Verdict color: whether the honest control passed  mirrors approve/refuse decision-color
  // coding elsewhere, so this intentionally stays on the static accent, not the user's theme.
  const color = control.passed ? colors.accent : colors.red;

  return (
    <Card style={[styles.card, styles.controlCard, { borderColor: theme.accentTint }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.controlKicker, { color: theme.accentInk }]}>CONTROL · HONEST LEDGER</Text>
        <View style={[styles.verdictPill, { backgroundColor: `${resolved ? color : colorTheme.ink3}22` }]}>
          <Text style={[styles.verdictText, { color: resolved ? color : colorTheme.ink3 }]}>
            {resolved ? (control.passed ? 'Approved' : 'Refused') : state.stage === 'running' ? 'Running…' : 'Armed'}
          </Text>
        </View>
      </View>
      <Text style={[styles.technique, { color: colorTheme.ink2 }]}>
        Real extracted spending and six months of salary from a registered employer, run through the
        identical borrower profile above. Nothing has been tampered with.
      </Text>

      {resolved && (
        <>
          <ConfidenceBar from={0} to={control.confidence} color={color} />
          <View style={styles.outcome}>
            <Icon name={control.passed ? 'check' : 'x'} size={13} color={color} stroke={2.5} />
            <Text style={[styles.outcomeText, { color }]}>
              {control.passed ? `RM${fmt(control.maxAmount)} approved` : `RM${fmt(PROBE.request)} refused`}
            </Text>
          </View>
          <Text style={[styles.controlWhy, { color: colorTheme.ink2 }]}>
            {control.passed
              ? 'Why this card is here: an engine that refused everyone would also score a perfect run below. Passing it shows the checks can tell real data from faked data, rather than just saying no to everything.'
              : 'The control did not get through. Until that is fixed the catches below prove nothing, because an engine that refuses everyone catches every attack by accident.'}
          </Text>
        </>
      )}
    </Card>
  );
}

/** The rows the attack actually smuggled in, so the technique is shown and not just described. */
function PayloadSection({ result }: { result: AttackResult }) {
  const colorTheme = useThemeColors();
  const [open, setOpen] = useState(false);
  const { payload } = result;
  const hidden = payload.count - payload.rows.length;

  return (
    <View style={styles.payload}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide the injected rows' : 'Show the injected rows'}
        style={styles.payloadToggle}
        hitSlop={6}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} color={colorTheme.ink2} stroke={2} />
        <Text style={[styles.payloadToggleText, { color: colorTheme.ink2 }]}>{open ? 'Hide the injected rows' : 'Show the injected rows'}</Text>
      </Pressable>

      {open && (
        <FadeIn style={[styles.payloadBody, { backgroundColor: colorTheme.surface2 }]} duration={220} offset={4}>
          <Text style={[styles.payloadCaption, { color: colorTheme.ink2 }]}>{payload.caption}</Text>
          {payload.rows.map((row, i) => (
            <View key={i} style={styles.payloadRow}>
              <View style={styles.payloadRowHead}>
                <Text style={[styles.payloadLabel, { color: colorTheme.ink }]} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text style={[styles.payloadAmount, { color: colorTheme.ink }]}>RM{fmt(row.amount)}</Text>
              </View>
              <Text style={[styles.payloadMeta, { color: colorTheme.ink3 }]}>
                {[
                  row.source,
                  row.type === 'unknown' ? null : row.type,
                  row.date,
                  row.balanceBreak ? 'breaks the running balance' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          ))}
          {hidden > 0 && <Text style={[styles.payloadMore, { color: colorTheme.ink3 }]}>+{hidden} more of the same shape</Text>}
        </FadeIn>
      )}
    </View>
  );
}

function AttackCard({ result, state, baseline }: { result: AttackResult; state: CardState; baseline: number }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [report, setReport] = useState<{ text: string; ai: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const resolved = state.stage === 'resolved';
  const vColor = verdictColor(result.verdict);

  const pill = resolved
    ? { text: verdictLabel(result.verdict), color: vColor }
    : state.stage === 'running'
      ? { text: 'Running…', color: colorTheme.amber }
      : { text: 'Armed', color: colorTheme.ink3 };

  const narrate = async () => {
    setBusy(true);
    try {
      const llm = await getLLM();
      const text = await withTimeout(
        llm.coach({ system: ATTACK_SYSTEM_PROMPT, prompt: buildAttackPrompt(result) }),
        NARRATE_TIMEOUT_MS
      );
      setReport({ text: text.trim(), ai: true });
    } catch {
      setReport({ text: attackFallback(result), ai: false });
    } finally {
      setBusy(false);
    }
  };

  const visible = result.signals.slice(0, Math.min(state.signalsShown, MAX_VISIBLE_SIGNALS));
  const unshown = result.signals.length - visible.length;
  const note = result.floorBreached ? 'integrity floor breached' : result.hardCapped ? 'capped' : '';

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardName, { color: colorTheme.ink }]}>{result.name}</Text>
        <View style={[styles.verdictPill, { backgroundColor: `${pill.color}22` }]}>
          <Text style={[styles.verdictText, { color: pill.color }]}>{pill.text}</Text>
        </View>
      </View>
      <Text style={[styles.technique, { color: colorTheme.ink2 }]}>{result.technique}</Text>

      {resolved && (
        <>
          <ConfidenceBar from={baseline} to={result.confidence} color={vColor} baseline={baseline} note={note} />
          <View style={styles.outcome}>
            <Icon name={result.verdict === 'caught' ? 'check' : 'alert'} size={13} color={vColor} stroke={2.5} />
            <Text style={[styles.outcomeText, { color: vColor }]}>{outcomeLine(result.decision)}</Text>
          </View>
        </>
      )}

      {visible.length > 0 && (
        <View style={[styles.signals, { backgroundColor: colorTheme.surface2 }]}>
          <Text style={[styles.signalsKicker, { color: colorTheme.ink3 }]}>WHICH CHECKS FIRED</Text>
          {visible.map((s, i) => (
            <FadeIn key={i} style={styles.signalRow} duration={240} offset={4}>
              <Icon name="alert" size={12} color={colorTheme.amber} stroke={2} />
              <View style={styles.signalBody}>
                <Text style={[styles.signalLabel, { color: colorTheme.ink }]}>{signalLabel(s.key)}</Text>
                <Text style={[styles.signalText, { color: colorTheme.ink2 }]}>{s.detail}</Text>
              </View>
            </FadeIn>
          ))}
          {resolved && unshown > 0 && (
            <Text style={[styles.signalsMore, { color: colorTheme.ink3 }]}>+{unshown} more check{unshown === 1 ? '' : 's'} also fired</Text>
          )}
        </View>
      )}

      {resolved && <PayloadSection result={result} />}

      {resolved &&
        (report ? (
          <View style={[styles.report, { backgroundColor: theme.accentSoft }]}>
            <View style={styles.reportHead}>
              <Text style={[styles.reportKicker, { color: theme.accentInk }]}>INCIDENT REPORT</Text>
              <View style={[styles.provTag, report.ai ? [styles.provAi, { backgroundColor: theme.accentTint }] : { backgroundColor: colorTheme.surface }]}>
                <Text style={[styles.provText, { color: report.ai ? theme.accent : colorTheme.ink3 }]}>{report.ai ? 'AI' : 'Summary'}</Text>
              </View>
            </View>
            <Text style={[styles.reportText, { color: colorTheme.ink }]}>{report.text}</Text>
          </View>
        ) : (
          <Pressable onPress={narrate} style={[styles.narrateBtn, { borderColor: colorTheme.line }]} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={[styles.narrateText, { color: theme.accent }]}>Explain this in plain English</Text>}
          </Pressable>
        ))}
    </Card>
  );
}

export function AttackGalleryScreen({ onBack }: { onBack: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const insets = useSafeAreaInsets();
  // Computed once: the engines run on mount. Only the reveal is staged.
  const results = useMemo(() => runGallery(), []);
  const control = useMemo(() => runControl(), []);
  // The control leads, so the baseline exists before any attack is measured against it.
  const items = useMemo(
    () => [{ id: CONTROL_ID, signalCount: 0 }, ...results.map((r) => ({ id: r.id, signalCount: r.signals.length }))],
    [results]
  );
  const plan = useMemo(() => revealPlan(items), [items]);

  const [phase, setPhase] = useState<'armed' | 'running' | 'done'>('armed');
  const [cards, setCards] = useState<CardStates>(() => armedCards(items));
  const [aboutOpen, setAboutOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // The judge can back out mid-run; nothing may keep firing into an unmounted screen.
  useEffect(() => clearTimers, [clearTimers]);

  const run = useCallback(() => {
    clearTimers();
    setCards(armedCards(items));
    setPhase('running');
    for (const event of plan.events) {
      timers.current.push(setTimeout(() => setCards((prev) => applyRevealEvent(prev, event)), event.at));
    }
    timers.current.push(setTimeout(() => setPhase('done'), plan.totalMs + COUNTDOWN_MS));
  }, [clearTimers, items, plan]);

  // Counted off resolved cards only, so the headline can never claim a catch the engine did not
  // make: a 'flagged' or 'missed' verdict simply never increments it.
  const caught = results.filter((r) => cards[r.id]?.stage === 'resolved' && r.verdict === 'caught').length;
  const controlState = cards[CONTROL_ID] ?? { stage: 'armed' as const, signalsShown: 0 };

  return (
    <FadeIn style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Attack Gallery" onBack={onBack} right={<InfoBadge onPress={() => setAboutOpen(true)} />} />
      </View>
      <AboutModal visible={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <Text style={[styles.heroKicker, { color: colorTheme.ink2 }]}>ADVERSARIAL SELF-TEST</Text>
          <Text style={[styles.heroScore, { color: theme.accent }]}>
            {caught}<Text style={[styles.heroScoreDenom, { color: colorTheme.ink2 }]}>/{results.length} attacks stopped</Text>
          </Text>
          {phase === 'done' && controlState.stage === 'resolved' && control.passed && (
            <Text style={[styles.heroNote, { color: theme.accentInk }]}>…and the honest applicant was still approved.</Text>
          )}

          <View style={[styles.setup, { backgroundColor: colorTheme.surface2 }]}>
            <Text style={[styles.setupKicker, { color: colorTheme.ink2 }]}>THE SETUP</Text>
            <Text style={[styles.setupIntro, { color: colorTheme.ink }]}>
              Every run below uses the same borrower, one any lender would want:
            </Text>
            <View style={styles.setupRow}>
              <Text style={[styles.setupLabel, { color: colorTheme.ink2 }]}>Credit score</Text>
              <Text style={[styles.setupValue, { color: colorTheme.ink }]}>{PROBE.score} · {PROBE.band}</Text>
            </View>
            <View style={styles.setupRow}>
              <Text style={[styles.setupLabel, { color: colorTheme.ink2 }]}>Income claimed</Text>
              <Text style={[styles.setupValue, { color: colorTheme.ink }]}>RM{fmt(PROBE.avgIncome)} / month</Text>
            </View>
            <View style={styles.setupRow}>
              <Text style={[styles.setupLabel, { color: colorTheme.ink2 }]}>Asking for</Text>
              <Text style={[styles.setupValue, { color: colorTheme.ink }]}>RM{fmt(PROBE.request)}</Text>
            </View>
            <Text style={[styles.setupOutro, { color: colorTheme.ink2 }]}>
              Affordability already clears and the history is complete, deliberately. That strips away
              every other reason to say no, so the only thing left that can stop a fraudster here is
              whether the data behind that income is real.
            </Text>
          </View>

          <Pressable
            onPress={run}
            disabled={phase === 'running'}
            accessibilityRole="button"
            accessibilityLabel={phase === 'done' ? 'Run the attacks again' : 'Run the control and all attacks'}
            style={[
              styles.runBtn,
              { backgroundColor: theme.accent },
              phase === 'done' && [styles.runBtnSecondary, { borderColor: colorTheme.line }],
              phase === 'running' && [styles.runBtnBusy, { backgroundColor: theme.accentSoft }],
            ]}
          >
            {phase === 'running' ? (
              <>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={[styles.runText, styles.runTextBusy, { color: theme.accentInk }]}>Running…</Text>
              </>
            ) : (
              <>
                <Icon name={phase === 'done' ? 'return' : 'play'} size={14} color={phase === 'done' ? theme.accent : colorTheme.bg} stroke={2} />
                <Text style={[styles.runText, { color: colorTheme.bg }, phase === 'done' && [styles.runTextSecondary, { color: theme.accent }]]}>
                  {phase === 'done' ? 'Run them again' : 'Run the control, then the attacks'}
                </Text>
              </>
            )}
          </Pressable>
        </Card>

        <ControlCard control={control} state={controlState} />

        {results.map((r) => (
          <AttackCard
            key={r.id}
            result={r}
            state={cards[r.id] ?? { stage: 'armed', signalsShown: 0 }}
            baseline={control.confidence}
          />
        ))}

        <Text style={[styles.footer, { color: colorTheme.ink2 }]}>
          Known residual: a fully self-consistent fabricated ledger behind a verified-looking payer is
          only defeated by source-of-truth income (open banking / MyInvois). On the roadmap.
        </Text>
      </ScrollView>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  infoBadge: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(20,40,30,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgePressed: { opacity: 0.6 },
  infoBadgeText: {
    fontFamily: Platform.select({ ios: 'Georgia-Italic', android: 'serif', default: 'Georgia' }),
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 13,
  },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,24,18,0.46)' },
  modalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, maxHeight: '82%', borderRadius: radius.md, padding: 20 },
  modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  modalEyebrow: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  modalTitle: { fontFamily: uiFont(800), fontSize: 18 },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 13 },
  modalScroll: { flexGrow: 0 },
  modalKicker: { fontFamily: uiFont(600), fontSize: 10.5, letterSpacing: 1, marginTop: 14 },
  modalBody: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 18.5, marginTop: 6 },

  legend: { marginTop: 10, gap: 8, borderRadius: 10, padding: 11 },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  legendLabel: { fontFamily: uiFont(700), fontSize: 12, width: 62 },
  legendMeaning: { fontFamily: uiFont(500), fontSize: 12, flex: 1, lineHeight: 16.5 },

  hero: { padding: 18, borderRadius: 20 },
  heroKicker: { fontFamily: uiFont(600), fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  heroScore: { fontFamily: numFont(700), fontSize: 30 },
  heroScoreDenom: { fontFamily: uiFont(600), fontSize: 15 },
  heroNote: { fontFamily: uiFont(600), fontSize: 12.5, marginTop: 4 },

  setup: { marginTop: 14, borderRadius: 12, padding: 12 },
  setupKicker: { fontFamily: uiFont(600), fontSize: 10.5, letterSpacing: 1 },
  setupIntro: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  setupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  setupLabel: { fontFamily: uiFont(500), fontSize: 12 },
  setupValue: { fontFamily: numFont(700), fontSize: 12.5 },
  setupOutro: { fontFamily: uiFont(500), fontSize: 12, marginTop: 10, lineHeight: 17.5 },

  runBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  runBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1 },
  runBtnBusy: {},
  runText: { fontFamily: uiFont(700), fontSize: 13 },
  runTextSecondary: {},
  runTextBusy: {},

  card: { padding: 16, borderRadius: 16, marginTop: 12 },
  controlCard: { borderWidth: 1 },
  controlKicker: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.8, flex: 1 },
  controlWhy: { fontFamily: uiFont(500), fontSize: 11.5, lineHeight: 17, marginTop: 10 },

  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardName: { fontFamily: uiFont(700), fontSize: 14.5, flex: 1 },
  verdictPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  verdictText: { fontFamily: uiFont(700), fontSize: 11.5 },
  technique: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 18, marginTop: 8 },

  bar: { marginTop: 12 },
  barTrack: { height: 8, borderRadius: 999, overflow: 'visible', position: 'relative' },
  barFill: { height: 8, borderRadius: 999 },
  barTick: { position: 'absolute', top: -3, width: 2, height: 14, borderRadius: 1 },
  barLegend: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7, gap: 8 },
  barValue: { fontFamily: numFont(700), fontSize: 12.5 },
  barBaseline: { fontFamily: uiFont(500), fontSize: 11 },

  outcome: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  outcomeText: { fontFamily: uiFont(700), fontSize: 13 },

  signals: { marginTop: 12, gap: 8, borderRadius: 10, padding: 11 },
  signalsKicker: { fontFamily: uiFont(600), fontSize: 10.5, letterSpacing: 1 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  signalBody: { flex: 1, gap: 1 },
  signalLabel: { fontFamily: uiFont(600), fontSize: 12 },
  signalText: { fontFamily: uiFont(500), fontSize: 11.5, lineHeight: 16 },
  signalsMore: { fontFamily: uiFont(500), fontSize: 11, fontStyle: 'italic' },

  payload: { marginTop: 10 },
  payloadToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  payloadToggleText: { fontFamily: uiFont(600), fontSize: 12 },
  payloadBody: { marginTop: 8, borderRadius: 10, padding: 10, gap: 8 },
  payloadCaption: { fontFamily: uiFont(600), fontSize: 11.5 },
  payloadRow: { gap: 2 },
  payloadRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  payloadLabel: { fontFamily: uiFont(600), fontSize: 12, flex: 1 },
  payloadAmount: { fontFamily: numFont(700), fontSize: 12 },
  payloadMeta: { fontFamily: uiFont(500), fontSize: 11 },
  payloadMore: { fontFamily: uiFont(500), fontSize: 11, fontStyle: 'italic' },

  narrateBtn: { marginTop: 12, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  narrateText: { fontFamily: uiFont(700), fontSize: 12.5 },
  report: { marginTop: 12, borderRadius: 12, padding: 12 },
  reportHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportKicker: { fontFamily: uiFont(600), fontSize: 11, letterSpacing: 1 },
  provTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  provAi: {},
  provText: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.5 },
  reportText: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 18, marginTop: 8 },

  footer: { fontFamily: uiFont(500), fontSize: 11.5, lineHeight: 17, marginTop: 18, fontStyle: 'italic' },
});
