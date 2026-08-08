import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { savingsStepUp, type SavingsHabit } from '../lib/savingsHabit';
import { fmt } from '../lib/format';
import { colors, numFont, radius, uiFont } from '../theme';
import { Card, Eyebrow, ProgressTrack } from './ui';
import { InfoButton } from './InfoButton';

/**
 * The pay-yourself-first habit: a small fixed amount kept back the moment income lands.
 *
 * Motivation only, exactly like the recording streak. Nothing shown here reaches the credit score
 * or a loan decision, and the copy deliberately never implies it does, because a target the
 * borrower sets for themselves would be trivially gameable if it scored.
 */
export function SavingsHabitCard({
  habit,
  guideSuggestion,
  onSetTarget,
}: {
  habit: SavingsHabit;
  /** What Belanjawanku recommends this household save monthly, if anything. */
  guideSuggestion?: number;
  onSetTarget: (amount: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(habit.target));
  const stepUp = savingsStepUp(habit, guideSuggestion);

  const save = () => {
    const parsed = Math.max(0, parseFloat(draft.replace(/[^0-9.]/g, '')) || 0);
    onSetTarget(parsed);
    setEditing(false);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <View style={styles.eyebrowRow}>
            <Eyebrow>Pay yourself first</Eyebrow>
            <InfoButton entry="pay_yourself_first" />
          </View>
          <Text style={styles.target}>RM {fmt(habit.target)} a month</Text>
        </View>
        {habit.monthsKept > 0 && (
          <View style={styles.streak}>
            <Text style={styles.flame}>{'\u{1F525}'}</Text>
            <Text style={styles.streakText}>
              {habit.monthsKept} month{habit.monthsKept === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: 12 }}>
        <ProgressTrack pct={habit.thisMonthProgress * 100} />
        <Text style={styles.progress}>
          {habit.thisMonthSaved >= 0
            ? `RM ${fmt(habit.thisMonthSaved)} kept back this month`
            : `RM ${fmt(-habit.thisMonthSaved)} more spent than earned this month`}
          {habit.thisMonthMet ? '. Target met.' : ''}
        </Text>
      </View>

      {habit.monthsKept === 0 && habit.bestRun > 0 && (
        <Text style={styles.best}>
          Your best run so far is {habit.bestRun} month{habit.bestRun === 1 ? '' : 's'}.
        </Text>
      )}

      {/* The "increase gradually" half of the advice, offered only once the borrower has proved
          they can hold the smaller amount. Never auto-applied: raising it is their call. */}
      {stepUp !== null && !editing && (
        <View style={styles.stepUp}>
          <Text style={styles.stepUpText}>
            You have kept this up {habit.monthsKept} month{habit.monthsKept === 1 ? '' : 's'} in a
            row. The national guide suggests RM {fmt(stepUp)} for your household.
          </Text>
          <Pressable
            onPress={() => onSetTarget(stepUp)}
            style={({ pressed }) => [styles.stepUpBtn, { opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={styles.stepUpBtnText}>Raise to RM {fmt(stepUp)}</Text>
          </Pressable>
        </View>
      )}

      {editing ? (
        <View style={styles.editRow}>
          <Text style={styles.rm}>RM</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            keyboardType="decimal-pad"
            style={styles.input}
            autoFocus
            accessibilityLabel="Monthly savings target"
          />
          <Pressable onPress={save} style={styles.saveBtn} accessibilityRole="button">
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setDraft(String(habit.target));
            setEditing(true);
          }}
          style={({ pressed }) => [styles.changeBtn, { opacity: pressed ? 0.75 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={styles.changeText}>Change target</Text>
        </Pressable>
      )}

      <Text style={styles.note}>
        A habit tracker, not a credit signal. Your real surplus already counts towards your score.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  target: { fontFamily: uiFont(700), fontSize: 16, color: colors.ink, marginTop: 3 },
  stepUp: {
    marginTop: 12,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  stepUpText: { fontFamily: uiFont(500), fontSize: 12.5, lineHeight: 18, color: colors.accentInk },
  stepUpBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  stepUpBtnText: { fontFamily: uiFont(700), fontSize: 12.5, color: colors.accentInk },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flame: { fontSize: 15 },
  streakText: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk },
  progress: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 7 },
  best: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 6 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  rm: { fontFamily: numFont(600), fontSize: 14, color: colors.ink2 },
  input: {
    flex: 1,
    fontFamily: numFont(700),
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.accent },
  saveText: { fontFamily: uiFont(700), fontSize: 13, color: colors.accentInk },
  changeBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  changeText: { fontFamily: uiFont(700), fontSize: 12.5, color: colors.ink2 },
  note: { fontFamily: uiFont(500), fontSize: 11, lineHeight: 15, color: colors.ink3, marginTop: 12 },
});
