// Judge guided tour  bottom-pinned step card, v2 (Interactive Judge Tour spec,
// 2026-07-16). Non-modal: it never traps focus or blocks taps on the real app underneath.
// v2 adds the act meter, Pip as narrator, the "your turn" treatment for do/mission steps
// (Skip replaces Next  the judge's own tap is the way forward), a transient celebration
// flash, the mission's slim banner variant, and the finale recap. Focus jumps to the card
// on step change (web) so screen readers hear each step announced.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadowCard, uiFont } from '../theme';
import type { TourStep } from '../lib/tourSteps';
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

function ActMeter({ progress }: { progress: TourActProgress }) {
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterTrack}>
        {Array.from({ length: progress.totalActs }).map((_, i) => (
          <View
            key={i}
            style={[styles.meterSeg, i < progress.act - 1 && styles.meterSegDone, i === progress.act - 1 && styles.meterSegActive]}
          />
        ))}
      </View>
      <Text style={styles.meterLabel}>
        Act {progress.act} of {progress.totalActs} · {progress.actLabel}
      </Text>
    </View>
  );
}

/** Brief green flash confirming the judge's own action landed. Announced politely. */
function CelebrateFlash({ text }: { text: string }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    const fadeIn = () => Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: useNative }).start();
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => (v ? fade.setValue(1) : fadeIn()))
      .catch(fadeIn);
  }, [fade]);
  return (
    <Animated.View style={[styles.celebrate, { opacity: fade }]} accessibilityLiveRegion="polite">
      <Text style={styles.celebrateText}>✓ {text}</Text>
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
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  onSkip: () => void;
  onAction?: () => void;
  onMissionStart?: () => void;
}) {
  const interactive = step.kind !== 'explain';
  const focusRef = useRef<View>(null);

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
        style={styles.card}
        accessibilityLabel={`Tour, act ${progress.act} of ${progress.totalActs}. ${step.title}. ${step.body}`}
      >
        {celebrate ? <CelebrateFlash text={celebrate} /> : null}
        <ActMeter progress={progress} />
        {interactive && (
          <View style={styles.turnPill}>
            <Text style={styles.turnPillText}>YOUR TURN</Text>
          </View>
        )}
        <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
          {step.title}
        </Text>
        <Text style={styles.body}>{step.body}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}

        {recap && recap.length > 0 && (
          <View style={styles.recap}>
            {recap.map((item) => (
              <View key={item.label} style={styles.recapRow}>
                <Text style={[styles.recapTick, !item.done && styles.recapTickSkipped]}>{item.done ? '✓' : '·'}</Text>
                <Text style={[styles.recapLabel, !item.done && styles.recapLabelSkipped]}>
                  {item.done ? item.label : `${item.label} (skipped)`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {step.kind === 'mission' && onMissionStart && (
          <Pressable onPress={onMissionStart} accessibilityRole="button" accessibilityLabel={step.mission?.cta ?? 'Start'} style={styles.missionBtn} hitSlop={4}>
            <Text style={styles.missionBtnText}>{step.mission?.cta}</Text>
          </Pressable>
        )}
        {step.actionLabel && onAction && (
          <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={step.actionLabel} style={styles.actionBtn} hitSlop={4}>
            <Text style={styles.actionText}>{step.actionLabel} →</Text>
          </Pressable>
        )}

        <View style={styles.row}>
          <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit tour" hitSlop={8}>
            <Text style={styles.exit}>Exit</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {interactive ? (
            <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip this step" style={styles.secondaryBtn} hitSlop={8}>
              <Text style={styles.secondaryText}>Skip</Text>
            </Pressable>
          ) : (
            <>
              {index > 0 && (
                <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Previous step" style={styles.secondaryBtn} hitSlop={8}>
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
              )}
              <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel={index === total - 1 ? 'Finish tour' : 'Next step'} style={styles.nextBtn} hitSlop={8}>
                <Text style={styles.nextText}>{index === total - 1 ? 'Done' : 'Next'}</Text>
              </Pressable>
            </>
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
  onSkip,
  onExit,
}: {
  instruction: string;
  phaseIndex: number;
  phaseCount: number;
  topInset?: number;
  onSkip: () => void;
  onExit: () => void;
}) {
  return (
    <View style={[styles.wrapTop, { paddingTop: 8 + topInset, pointerEvents: 'box-none' }]}>
      <View style={styles.banner}>
        <View style={styles.bannerDots}>
          {Array.from({ length: phaseCount }).map((_, i) => (
            <View key={i} style={[styles.dot, i < phaseIndex && styles.dotDone, i === phaseIndex && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.bannerText} accessibilityLiveRegion="polite" numberOfLines={2}>
          {instruction}
        </Text>
        <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip the scan mission" hitSlop={8}>
          <Text style={styles.bannerSkip}>Skip</Text>
        </Pressable>
        <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit tour" hitSlop={8}>
          <Text style={styles.bannerExit}>✕</Text>
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
  return (
    <View style={[styles.chipWrap, { bottom: 14 + bottomInset, pointerEvents: 'box-none' }]}>
      <Pressable onPress={onResume} accessibilityRole="button" accessibilityLabel="Resume tour" style={styles.chip}>
        <Text style={styles.chipText}>{progress ? `Resume tour · Act ${progress.act} of ${progress.totalActs}` : 'Resume tour'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, zIndex: 40 },
  wrapTop: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 16, zIndex: 40 },
  pipSeat: { position: 'absolute', top: -34, left: 26, zIndex: 41 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    padding: 16,
    paddingTop: 14,
    ...shadowCard,
  },
  meterRow: { marginBottom: 10, gap: 5 },
  meterTrack: { flexDirection: 'row', gap: 4 },
  meterSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  meterSegDone: { backgroundColor: colors.accentSoft },
  meterSegActive: { backgroundColor: colors.accent },
  meterLabel: { fontFamily: uiFont(600), fontSize: 11, color: colors.ink3 },
  turnPill: { alignSelf: 'flex-start', backgroundColor: colors.accentTint, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, marginBottom: 6 },
  turnPillText: { fontFamily: uiFont(800), fontSize: 10, letterSpacing: 0.6, color: colors.accentInk },
  celebrate: { backgroundColor: colors.accentTint, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 9 },
  celebrateText: { fontFamily: uiFont(700), fontSize: 12.5, color: colors.accentInk },
  title: { fontFamily: uiFont(800), fontSize: 15, color: colors.ink, marginBottom: 4 },
  body: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, lineHeight: 19 },
  detail: { fontFamily: uiFont(800), fontSize: 14, color: colors.accentInk, marginTop: 8 },
  recap: { marginTop: 10, gap: 5 },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recapTick: { fontFamily: uiFont(800), fontSize: 12.5, color: colors.accentInk, width: 14, textAlign: 'center' },
  recapTickSkipped: { color: colors.ink3 },
  recapLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },
  recapLabelSkipped: { color: colors.ink3 },
  missionBtn: { marginTop: 12, backgroundColor: colors.accentInk, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  missionBtnText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.onAccent },
  actionBtn: { marginTop: 10, alignSelf: 'flex-start' },
  actionText: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  exit: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink3 },
  secondaryBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  secondaryText: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink2 },
  nextBtn: { backgroundColor: colors.accentInk, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 20 },
  nextText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.onAccent },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    paddingVertical: 9,
    paddingHorizontal: 14,
    ...shadowCard,
  },
  bannerDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotDone: { backgroundColor: colors.accentSoft },
  dotActive: { backgroundColor: colors.accent, width: 14 },
  bannerText: { flex: 1, fontFamily: uiFont(600), fontSize: 12, color: colors.ink2, lineHeight: 16 },
  bannerSkip: { fontFamily: uiFont(700), fontSize: 12.5, color: colors.ink3 },
  bannerExit: { fontFamily: uiFont(700), fontSize: 13, color: colors.ink3, paddingLeft: 2 },
  chipWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 40 },
  chip: { backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18, ...shadowCard },
  chipText: { fontFamily: uiFont(700), fontSize: 13, color: colors.surface },
});
