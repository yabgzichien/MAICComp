// Judge guided tour  bottom-pinned step card (Judge Tour spec, 2026-07-12). Non-modal: it
// never traps focus or blocks taps on the real app underneath  the real screen behind it
// stays fully operable, which is how "tap elsewhere pauses the tour" works without any
// special-case handling in this component.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadowCard, uiFont } from '../theme';
import type { TourStep } from '../lib/tourSteps';

export function TourCard({
  step,
  index,
  total,
  bottomInset = 0,
  onNext,
  onBack,
  onExit,
  onAction,
}: {
  step: TourStep;
  index: number;
  total: number;
  bottomInset?: number;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  onAction?: () => void;
}) {
  return (
    <View style={[styles.wrap, { paddingBottom: 14 + bottomInset, pointerEvents: 'box-none' }]}>
      <View style={styles.card} accessibilityRole="none">
        <View style={styles.dots}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
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
          {index > 0 && (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Previous step" style={styles.secondaryBtn} hitSlop={8}>
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
          )}
          <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel={index === total - 1 ? 'Finish tour' : 'Next step'} style={styles.nextBtn} hitSlop={8}>
            <Text style={styles.nextText}>{index === total - 1 ? 'Done' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Shown after the tour pauses (the judge tapped into the real app). Tapping resumes at the
 *  same step  the tour never fights the user for control. */
export function TourResumeChip({ bottomInset = 0, onResume }: { bottomInset?: number; onResume: () => void }) {
  return (
    <View style={[styles.chipWrap, { bottom: 14 + bottomInset, pointerEvents: 'box-none' }]}>
      <Pressable onPress={onResume} accessibilityRole="button" accessibilityLabel="Resume tour" style={styles.chip}>
        <Text style={styles.chipText}>Resume tour</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, zIndex: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    padding: 16,
    ...shadowCard,
  },
  dots: { flexDirection: 'row', gap: 5, marginBottom: 9 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.accent, width: 16 },
  title: { fontFamily: uiFont(800), fontSize: 15, color: colors.ink, marginBottom: 4 },
  body: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, lineHeight: 19 },
  actionBtn: { marginTop: 10, alignSelf: 'flex-start' },
  actionText: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  exit: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink3 },
  secondaryBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  secondaryText: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink2 },
  nextBtn: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 20 },
  nextText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.onAccent },
  chipWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 40 },
  chip: { backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18, ...shadowCard },
  chipText: { fontFamily: uiFont(700), fontSize: 13, color: colors.surface },
});
