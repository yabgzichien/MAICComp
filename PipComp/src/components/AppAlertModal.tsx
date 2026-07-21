// src/components/AppAlertModal.tsx
// The on-brand replacement for the bare OS alert/confirm dialog (window.alert/window.confirm
// on web, Alert.alert on native  all three read as a generic system prompt, off-brand and
// visually jarring next to the rest of the app). Driven by useAlertHost(); renders nothing
// when no request is pending. Mount once near the app root (App.tsx), same placement as
// GlossaryModal.
import React, { useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAlertHost } from '../state/alertHost';
import { colors, radius, shadowCard, uiFont } from '../theme';
import { Icon } from './Icon';

export function AppAlertModal() {
  const { request, dismiss } = useAlertHost();
  const [busy, setBusy] = React.useState(false);
  // Guards a fast double-tap on the confirm button from running onConfirm twice (same class of
  // bug as the passport send-button spam fix): a ref flips synchronously, state doesn't.
  const confirmingRef = useRef(false);

  if (!request) return <Modal visible={false} transparent />;

  const destructive = request.kind === 'confirm';

  const handleConfirm = async () => {
    if (request.kind !== 'confirm' || confirmingRef.current) return;
    confirmingRef.current = true;
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      confirmingRef.current = false;
      setBusy(false);
      dismiss();
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : dismiss} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={[styles.iconCircle, destructive && styles.iconCircleDanger]}>
            <Icon name={destructive ? 'alert' : 'check'} size={18} color={destructive ? colors.red : colors.accent} stroke={2.4} />
          </View>
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}

          {request.kind === 'confirm' ? (
            <View style={styles.row}>
              <Pressable
                onPress={dismiss}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.btnCancel, (pressed || busy) && { opacity: 0.85 }]}
                accessibilityRole="button"
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.btnDanger, (pressed || busy) && { opacity: 0.9 }]}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.btnDangerText}>{request.confirmLabel}</Text>}
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={dismiss} style={({ pressed }) => [styles.btn, styles.btnOk, pressed && { opacity: 0.9 }]} accessibilityRole="button">
              <Text style={styles.btnOkText}>OK</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,24,18,0.46)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 22,
    alignItems: 'center',
    ...shadowCard,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconCircleDanger: { backgroundColor: colors.red + '1a' },
  title: { fontFamily: uiFont(800), fontSize: 17, color: colors.ink, textAlign: 'center', marginBottom: 6 },
  message: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  btn: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  btnCancelText: { fontFamily: uiFont(700), fontSize: 14, color: colors.ink2 },
  btnDanger: { backgroundColor: colors.red },
  btnDangerText: { fontFamily: uiFont(700), fontSize: 14, color: colors.onAccent },
  btnOk: { backgroundColor: colors.accentInk, width: '100%', marginTop: 4 },
  btnOkText: { fontFamily: uiFont(700), fontSize: 14, color: colors.onAccent },
});
