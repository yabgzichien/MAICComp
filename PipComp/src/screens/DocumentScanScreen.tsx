// src/screens/DocumentScanScreen.tsx
// Guided camera capture of an IC / passport with a bounding-box overlay. On capture the photo
// is sent to the vision model (extractIdentity) and the parsed fields are returned to KycScreen.
// The photo is not stored.
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { llmErrorMessage } from '../llm';
import type { IdentityExtraction } from '../llm/ekycPrompt';
import { scanIdentityImage } from '../ekyc/scan';
import { colors, uiFont } from '../theme';

const DIM = 'rgba(0,0,0,0.55)';
const CARD_ASPECT = 1.586; // ID-1 / CR80 card ratio (85.6mm × 54mm)

export function DocumentScanScreen({
  onCancel,
  onResult,
}: {
  onCancel: () => void;
  onResult: (r: IdentityExtraction) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const boxW = width * 0.86;
  const boxH = boxW / CARD_ASPECT;

  async function capture() {
    if (!camRef.current || busy) return;
    setBusy(true);
    setError('');
    try {
      const photo = await camRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error('Could not capture the photo.');
      onResult(await scanIdentityImage(photo.base64, 'image/jpeg'));
    } catch (e) {
      setError(llmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Permission states
  if (!permission) {
    return <View style={styles.permRoot}><ActivityIndicator color={colors.accent} /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={[styles.permRoot, { padding: 24 }]}>
        <Icon name="alert" size={30} color={colors.accent} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>Allow camera access to scan your IC or passport.</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant access</Text>
        </Pressable>
        <Pressable style={styles.permCancel} onPress={onCancel}>
          <Text style={styles.permCancelText}>Enter details manually instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Overlay: dim surround with an undimmed framed window */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.dim, { flex: 0.85 }]} />
        <View style={{ height: boxH, flexDirection: 'row' }}>
          <View style={[styles.dim, { flex: 1 }]} />
          <View style={[styles.frame, { width: boxW, height: boxH }]}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <View style={[styles.dim, { flex: 1 }]} />
        </View>
        <View style={[styles.dim, styles.bottom, { flex: 1.15 }]}>
          <Text style={styles.guidance}>Place your IC or passport inside the frame</Text>
          {error !== '' && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.shutter} onPress={capture} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.accent} /> : <View style={styles.shutterInner} />}
          </Pressable>
          {busy && <Text style={styles.reading}>Reading document…</Text>}
        </View>
      </View>

      {/* Cancel */}
      <Pressable style={[styles.close, { top: insets.top + 8 }]} onPress={onCancel}>
        <Icon name="x" size={20} color="#fff" stroke={2.4} />
      </Pressable>
    </View>
  );
}

const ACCENT = '#fff';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  dim: { backgroundColor: DIM },
  bottom: { alignItems: 'center', paddingTop: 26 },
  frame: { borderColor: ACCENT, borderWidth: 2, borderRadius: 14, backgroundColor: 'transparent' },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: colors.accent, borderWidth: 4 },
  tl: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  tr: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  bl: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  br: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  guidance: { fontFamily: uiFont(600), fontSize: 14, color: '#fff', textAlign: 'center', paddingHorizontal: 24 },
  error: { fontFamily: uiFont(500), fontSize: 13, color: '#ffb3a8', textAlign: 'center', paddingHorizontal: 24, marginTop: 10 },
  shutter: {
    width: 72, height: 72, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 22,
  },
  shutterInner: { width: 54, height: 54, borderRadius: 999, backgroundColor: '#fff' },
  reading: { fontFamily: uiFont(500), fontSize: 13, color: '#fff', marginTop: 12 },
  close: {
    position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },

  // Permission states
  permRoot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  permTitle: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink, marginTop: 6 },
  permBody: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, textAlign: 'center', lineHeight: 19 },
  permBtn: { height: 48, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 14 },
  permBtnText: { fontFamily: uiFont(700), fontSize: 15, color: colors.onAccent },
  permCancel: { marginTop: 14 },
  permCancelText: { fontFamily: uiFont(600), fontSize: 13.5, color: colors.ink2 },
});
