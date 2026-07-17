import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GLOSSARY } from '../lib/glossary';
import { useGlossary } from '../state/glossary';
import { colors, radius, uiFont } from '../theme';

/** Small circular "i" badge that opens the glossary modal for `entry`. Place inline next to a
 *  label/eyebrow (row + gap), same role as LenderConsole's InfoButton (app/shared.tsx). */
export function InfoButton({ entry, color }: { entry: string; color?: string }) {
  const { open } = useGlossary();
  const term = GLOSSARY[entry]?.term ?? 'this';
  return (
    <Pressable
      onPress={() => open(entry)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`What is ${term}?`}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
    >
      <Text style={[styles.badgeText, color ? { color } : null]}>i</Text>
    </Pressable>
  );
}

/** Centered glossary modal, driven by useGlossary(). Renders nothing when no entry is open.
 *  Mount once near the app root (see App.tsx) so any InfoButton can open it. */
export function GlossaryModal() {
  const { openEntry, close } = useGlossary();
  if (!openEntry) return <Modal visible={false} transparent />;
  const entry = GLOSSARY[openEntry];
  if (!entry) return <Modal visible={false} transparent />;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.center, { pointerEvents: 'box-none' }]}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Glossary</Text>
              <Text style={styles.title}>{entry.term}</Text>
            </View>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.short}>{entry.short}</Text>
          <Text style={styles.body}>{entry.body}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(20,40,30,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  badgeText: {
    fontFamily: Platform.select({ ios: 'Georgia-Italic', android: 'serif', default: 'Georgia' }),
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 11,
    color: colors.ink3,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,24,18,0.46)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 20,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  eyebrow: {
    fontFamily: uiFont(700),
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 4,
  },
  title: { fontFamily: uiFont(800), fontSize: 18, color: colors.ink },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 13, color: colors.ink2 },
  short: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.accentInk, lineHeight: 19, marginBottom: 10 },
  body: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, lineHeight: 19 },
});
