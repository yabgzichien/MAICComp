// Judge guided tour  bottom-pinned step card, v2 (Interactive Judge Tour spec,
// 2026-07-16). Non-modal: it never traps focus or blocks taps on the real app underneath.
// v2 adds the act meter, Pip as narrator, the "your task" treatment for do/mission steps
// (Skip replaces Next  the judge's own tap is the way forward), a transient celebration
// flash, the mission's slim banner variant, and the finale recap. Focus jumps to the card
// on step change (web) so screen readers hear each step announced.
//
// Back is on every step kind, and a step the judge has already cleared (`completed`, i.e. they
// pressed Back onto it) swaps its "your task" affordances for a plain Next: the work is done, so
// there is nothing to wait for and nothing left worth skipping. Back itself stops at `backFloor`
// (App.tsx), one past the last required step already completed  a required beat's artefact
// exists once and for all, so it is never something Back walks the judge back into.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadowCard, uiFont } from '../theme';
import { fillPersona, type TourStep } from '../lib/tourSteps';
import { LENDER_API_BASE } from '../lib/lenderDirectory';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { Pip } from './Pip';

export interface TourActProgress {
  act: number;
  totalActs: number;
  actLabel: string;
}

export interface TourRecapItem {
  label: string;
  done: boolean;
}

function ActMeter({ progress, persona }: { progress: TourActProgress; persona?: { name?: string; role?: string } }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterTrack}>
        {Array.from({ length: progress.totalActs }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.meterSeg,
              { backgroundColor: colorTheme.line },
              i < progress.act - 1 && { backgroundColor: theme.accentSoft },
              i === progress.act - 1 && { backgroundColor: theme.accent },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.meterLabel, { color: colorTheme.ink3 }]}>
        Act {progress.act} of {progress.totalActs} · {fillPersona(progress.actLabel, persona ?? {})}
      </Text>
    </View>
  );
}

/** Brief green flash confirming the judge's own action landed. Announced politely. */
function CelebrateFlash({ text }: { text: string }) {
  const theme = useAccent();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    const fadeIn = () => Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: useNative }).start();
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => (v ? fade.setValue(1) : fadeIn()))
      .catch(fadeIn);
  }, [fade]);
  return (
    <Animated.View style={[styles.celebrate, { backgroundColor: theme.accentTint, opacity: fade }]} accessibilityLiveRegion="polite">
      <Text style={[styles.celebrateText, { color: theme.accentInk }]}>✓ {text}</Text>
    </Animated.View>
  );
}

export function TourCard({
  step,
  index,
  total,
  progress,
  detail,
  celebrate,
  recap,
  bottomInset = 0,
  topInset = 0,
  placement = 'bottom',
  persona,
  completed = false,
  backFloor = 0,
  handoffReady = false,
  handoffSelfAdvancing = false,
  onNext,
  onBack,
  onExit,
  onSkip,
  onAction,
  onMissionStart,
}: {
  step: TourStep;
  index: number;
  total: number;
  progress: TourActProgress;
  /** Runtime line under the body (e.g. the live coverage delta). */
  detail?: string | null;
  /** Transient celebration text from the just-completed do/mission step. */
  celebrate?: string | null;
  /** Finale only: what the judge personally did (skipped beats show unchecked). */
  recap?: TourRecapItem[] | null;
  bottomInset?: number;
  topInset?: number;
  /** 'top' when the spotlit target sits in the lower half of the screen, so the card
   *  never occludes the control it is asking the judge to tap (found live: the coach's
   *  what-if chips sat behind a bottom card). */
  placement?: 'bottom' | 'top';
  /** Fills the copy's `{name}` / `{role}` tokens with the loaded demo borrower. */
  persona?: { name?: string; role?: string };
  /** The judge has already been past this step and pressed Back onto it. The task is done, so
   *  the card offers a plain Next (there is nothing left to wait for) and drops Skip — skipping
   *  work that is already finished is a control with no meaning. */
  completed?: boolean;
  /** Earliest index Back is allowed to reach  one past the last required step already
   *  completed. The Back button disappears once the judge is standing right on this floor, so a
   *  required beat (the scan, eKYC, the mint, the send) can never be re-entered once its
   *  artefact exists, whether to redo it or to wave a stray Next past it. */
  backFloor?: number;
  /** Handoff steps only: whether the real loan has moved far enough for the script to go on. */
  handoffReady?: boolean;
  /** Handoff steps only: this step is watching the real loan and will advance by itself, so it
   *  renders no Continue button  the waiting line is the whole story. */
  handoffSelfAdvancing?: boolean;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  onSkip: () => void;
  onAction?: () => void;
  onMissionStart?: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const interactive = step.kind !== 'explain';
  const isHandoff = step.kind === 'handoff';
  const title = fillPersona(step.title, persona ?? {});
  const body = fillPersona(step.body, persona ?? {});
  const focusRef = useRef<View>(null);

  /** Open the lender console. Web-only in practice: on a phone there is no second window to
   *  put it in, so the card falls back to the instruction alone and the judge switches
   *  devices themselves. Best-effort  a blocked popup must never break the tour. */
  const openConsole = () => {
    Linking.openURL(LENDER_API_BASE).catch(() => {});
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const t = setTimeout(() => {
      const node = focusRef.current as unknown as { focus?: () => void } | null;
      node?.focus?.();
    }, 120);
    return () => clearTimeout(t);
  }, [step.id]);

  return (
    <View
      style={[
        placement === 'top' ? styles.wrapTop : styles.wrap,
        placement === 'top' ? { paddingTop: 44 + topInset } : { paddingBottom: 14 + bottomInset },
        { pointerEvents: 'box-none' },
      ]}
    >
      <View style={[styles.pipSeat, placement === 'top' && { top: topInset + 10 }]} pointerEvents="none">
        <Pip size={46} expr={step.pip} />
      </View>
      <View
        ref={focusRef}
        focusable
        style={[styles.card, { borderColor: theme.accentSoft, backgroundColor: colorTheme.surface }]}
        accessibilityLabel={`Tour, act ${progress.act} of ${progress.totalActs}. ${title}. ${body}`}
      >
        {celebrate ? <CelebrateFlash text={celebrate} /> : null}
        <ActMeter progress={progress} persona={persona} />
        {interactive && (
          <View style={[styles.turnPill, { backgroundColor: theme.accentTint }]}>
            <Text style={[styles.turnPillText, { color: theme.accentInk }]}>{isHandoff ? 'SWITCH APPS' : completed ? 'DONE' : 'YOUR TASK'}</Text>
          </View>
        )}
        <Text style={[styles.title, { color: colorTheme.ink }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          {title}
        </Text>
        <Text style={[styles.body, { color: colorTheme.ink2 }]}>{body}</Text>
        {detail ? <Text style={[styles.detail, { color: theme.accentInk }]}>{detail}</Text> : null}

        {isHandoff && step.handoff && (
          <View style={styles.handoff}>
            <Pressable
              onPress={openConsole}
              accessibilityRole="link"
              accessibilityLabel="Open the Lender Console in a new tab"
              style={[styles.handoffBtn, { borderColor: theme.accentInk }]}
              hitSlop={4}
            >
              <Text style={[styles.handoffBtnText, { color: theme.accentInk }]}>Open the Lender Console →</Text>
            </Pressable>
            {/* The honest status of the real loan. Announced politely so a screen-reader user
                hears the gate open without having to poll the button's disabled state. */}
            <Text
              style={[styles.handoffStatus, { color: colorTheme.ink3 }, handoffReady && [styles.handoffStatusReady, { color: theme.accentInk }]]}
              accessibilityLiveRegion="polite"
            >
              {handoffReady ? step.handoff.ready : step.handoff.waiting}
            </Text>
          </View>
        )}

        {recap && recap.length > 0 && (
          <View style={styles.recap}>
            {recap.map((item) => (
              <View key={item.label} style={styles.recapRow}>
                <Text style={[styles.recapTick, { color: theme.accentInk }, !item.done && { color: colorTheme.ink3 }]}>{item.done ? '✓' : '·'}</Text>
                <Text style={[styles.recapLabel, { color: colorTheme.ink2 }, !item.done && { color: colorTheme.ink3 }]}>
                  {item.done ? item.label : `${item.label} (skipped)`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {step.kind === 'mission' && onMissionStart && (
          <Pressable onPress={onMissionStart} accessibilityRole="button" accessibilityLabel={step.mission?.cta ?? 'Start'} style={[styles.missionBtn, { backgroundColor: theme.accentInk }]} hitSlop={4}>
            <Text style={styles.missionBtnText}>{step.mission?.cta}</Text>
          </Pressable>
        )}
        {step.actionLabel && onAction && (
          <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={step.actionLabel} style={styles.actionBtn} hitSlop={4}>
            <Text style={[styles.actionText, { color: theme.accentInk }]}>{step.actionLabel} →</Text>
          </Pressable>
        )}

        <View style={styles.row}>
          <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit tour" hitSlop={8}>
            <Text style={[styles.exit, { color: colorTheme.ink3 }]}>Exit</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {/* Back sits on EVERY step kind, not only the explain ones. A judge who wants to re-read
              the beat they just cleared should not have to restart the tour to do it. */}
          {index > backFloor && (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Previous step" style={styles.secondaryBtn} hitSlop={8}>
              <Text style={[styles.secondaryText, { color: colorTheme.ink2 }]}>Back</Text>
            </Pressable>
          )}
          {completed ? (
            // Already done, reached by pressing Back. Nothing to wait for and nothing to skip —
            // one plain Next returns the judge to where they were.
            <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel={index === total - 1 ? 'Finish tour' : 'Next step'} style={[styles.nextBtn, { backgroundColor: theme.accentInk }]} hitSlop={8}>
              <Text style={styles.nextText}>{index === total - 1 ? 'Done' : 'Next'}</Text>
            </Pressable>
          ) : isHandoff ? (
            <>
              <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip this step" style={styles.secondaryBtn} hitSlop={8}>
                <Text style={[styles.secondaryText, { color: colorTheme.ink2 }]}>Skip</Text>
              </Pressable>
              {/* No Continue while the step is watching the real loan: it advances itself the
                  moment the gate opens, and a button asking the judge to confirm the offer they
                  can already see is a click that tells the app nothing. The button IS rendered
                  when the gate was already open on arrival — the `approved` ending, where
                  self-advancing would carry them past the console without ever playing the
                  officer, and `gate: 'none'` steps, which have nothing to wait for. */}
              {!handoffSelfAdvancing && (
                <Pressable
                  onPress={onNext}
                  disabled={!handoffReady}
                  accessibilityRole="button"
                  accessibilityLabel={step.handoff?.cta ?? 'Continue'}
                  accessibilityState={{ disabled: !handoffReady }}
                  style={[
                    styles.nextBtn,
                    { backgroundColor: theme.accentInk },
                    !handoffReady && [styles.nextBtnDisabled, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }],
                  ]}
                  hitSlop={8}
                >
                  <Text style={[styles.nextText, !handoffReady && { color: colorTheme.ink3 }]}>{step.handoff?.cta}</Text>
                </Pressable>
              )}
            </>
          ) : interactive ? (
            // A required step (the scan, eKYC, the mint, the send) offers no Skip at all: what
            // it builds is what every later act reads. Exit, top left, remains the way out.
            step.required ? null : (
              <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip this step" style={styles.secondaryBtn} hitSlop={8}>
                <Text style={[styles.secondaryText, { color: colorTheme.ink2 }]}>Skip</Text>
              </Pressable>
            )
          ) : (
            <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel={index === total - 1 ? 'Finish tour' : 'Next step'} style={[styles.nextBtn, { backgroundColor: theme.accentInk }]} hitSlop={8}>
              <Text style={styles.nextText}>{index === total - 1 ? 'Done' : 'Next'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** Slim banner shown while the judge rides the real scan flow mid-mission. The full card
 *  would smother the flow; this keeps one instruction + escape hatches visible. Pinned to
 *  the TOP: the scan flow's own primary buttons (Sort, Save) live at the bottom, and a
 *  bottom banner was found live to swallow their taps. */
export function MissionBanner({
  instruction,
  phaseIndex,
  phaseCount,
  topInset = 0,
  required = false,
  onSkip,
  onExit,
}: {
  instruction: string;
  phaseIndex: number;
  phaseCount: number;
  topInset?: number;
  /** Mirrors the card: a required mission drops Skip and leaves ✕ (exit) as the only way out. */
  required?: boolean;
  onSkip: () => void;
  onExit: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.wrapTop, { paddingTop: 8 + topInset, pointerEvents: 'box-none' }]}>
      <View style={[styles.banner, { borderColor: theme.accentSoft, backgroundColor: colorTheme.surface }]}>
        <View style={styles.bannerDots}>
          {Array.from({ length: phaseCount }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: colorTheme.line },
                i < phaseIndex && { backgroundColor: theme.accentSoft },
                i === phaseIndex && [styles.dotActive, { backgroundColor: theme.accent }],
              ]}
            />
          ))}
        </View>
        <Text style={[styles.bannerText, { color: colorTheme.ink2 }]} accessibilityLiveRegion="polite" numberOfLines={2}>
          {instruction}
        </Text>
        {!required && (
          <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip the scan mission" hitSlop={8}>
            <Text style={[styles.bannerSkip, { color: colorTheme.ink3 }]}>Skip</Text>
          </Pressable>
        )}
        <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit tour" hitSlop={8}>
          <Text style={[styles.bannerExit, { color: colorTheme.ink3 }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Shown after the tour pauses (the judge tapped into the real app). Tapping resumes at the
 *  same step  the tour never fights the user for control. */
export function TourResumeChip({
  bottomInset = 0,
  progress,
  onResume,
}: {
  bottomInset?: number;
  progress?: TourActProgress | null;
  onResume: () => void;
}) {
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.chipWrap, { bottom: 14 + bottomInset, pointerEvents: 'box-none' }]}>
      <Pressable onPress={onResume} accessibilityRole="button" accessibilityLabel="Resume tour" style={[styles.chip, { backgroundColor: colorTheme.ink }]}>
        <Text style={[styles.chipText, { color: colorTheme.surface }]}>{progress ? `Resume tour · Act ${progress.act} of ${progress.totalActs}` : 'Resume tour'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, zIndex: 40 },
  wrapTop: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 16, zIndex: 40 },
  pipSeat: { position: 'absolute', top: -34, left: 26, zIndex: 41 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 16,
    paddingTop: 14,
    ...shadowCard,
  },
  meterRow: { marginBottom: 10, gap: 5 },
  meterTrack: { flexDirection: 'row', gap: 4 },
  meterSeg: { flex: 1, height: 4, borderRadius: 2 },
  meterLabel: { fontFamily: uiFont(600), fontSize: 11 },
  turnPill: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, marginBottom: 6 },
  turnPillText: { fontFamily: uiFont(800), fontSize: 10, letterSpacing: 0.6 },
  celebrate: { borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 9 },
  celebrateText: { fontFamily: uiFont(700), fontSize: 12.5 },
  title: { fontFamily: uiFont(800), fontSize: 15, marginBottom: 4 },
  body: { fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 19 },
  detail: { fontFamily: uiFont(800), fontSize: 14, marginTop: 8 },
  recap: { marginTop: 10, gap: 5 },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recapTick: { fontFamily: uiFont(800), fontSize: 12.5, width: 14, textAlign: 'center' },
  recapTickSkipped: {},
  recapLabel: { fontFamily: uiFont(600), fontSize: 12.5 },
  recapLabelSkipped: {},
  missionBtn: { marginTop: 12, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  missionBtnText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.onAccent },
  actionBtn: { marginTop: 10, alignSelf: 'flex-start' },
  actionText: { fontFamily: uiFont(700), fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  exit: { fontFamily: uiFont(600), fontSize: 13 },
  secondaryBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  secondaryText: { fontFamily: uiFont(600), fontSize: 13.5 },
  nextBtn: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 20 },
  nextText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.onAccent },
  // Disabled handoff Continue: reads clearly as "not yet" without going so faint it fails
  // contrast (the ink pair here is checked by tools/contrastAudit).
  nextBtnDisabled: { borderWidth: 1 },
  nextTextDisabled: {},
  handoff: { marginTop: 12, gap: 8 },
  handoffBtn: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  handoffBtnText: { fontFamily: uiFont(700), fontSize: 13.5 },
  handoffStatus: { fontFamily: uiFont(500), fontSize: 12.5, textAlign: 'center' },
  handoffStatusReady: { fontFamily: uiFont(800) },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 9,
    paddingHorizontal: 14,
    ...shadowCard,
  },
  bannerDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 14 },
  bannerText: { flex: 1, fontFamily: uiFont(600), fontSize: 12, lineHeight: 16 },
  bannerSkip: { fontFamily: uiFont(700), fontSize: 12.5 },
  bannerExit: { fontFamily: uiFont(700), fontSize: 13, paddingLeft: 2 },
  chipWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 40 },
  chip: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18, ...shadowCard },
  chipText: { fontFamily: uiFont(700), fontSize: 13 },
});
