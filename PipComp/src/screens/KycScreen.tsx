// src/screens/KycScreen.tsx
// Identity verification (eKYC) capture. DEMO/MOCK: validates the Malaysian IC structure and
// extracts real DOB/gender/state, but does not check it against any registry. A real provider
// (MyDigital ID / CTOS / Innov8tif) swaps in behind the same store action.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Card, Eyebrow, TopBar } from '../components/ui';
import * as ImagePicker from 'expo-image-picker';
import { parseNric, validateNric } from '../lib/ekyc';
import { llmErrorMessage } from '../llm';
import type { IdentityExtraction } from '../llm/ekycPrompt';
import { scanIdentityImage } from '../ekyc/scan';
import { useAppData } from '../state/store';
import { colors, uiFont } from '../theme';
import { DocumentScanScreen } from './DocumentScanScreen';

export function KycScreen({ onBack, onDone }: { onBack: () => void; onDone?: () => void }) {
  const insets = useSafeAreaInsets();
  const { kyc, verifyIdentity } = useAppData();
  const finish = onDone ?? onBack;

  const [name, setName] = useState('');
  const [nric, setNric] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(kyc != null);
  const [scanning, setScanning] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);

  function handleScan(r: IdentityExtraction) {
    setScanning(false);
    if (r.fullName) setName(r.fullName);
    if (r.idNumber) setNric(r.idNumber);
    setError(r.fullName || r.idNumber ? '' : "Couldn't read the document — please enter your details manually.");
  }

  async function pickFromGallery() {
    if (scanBusy) return;
    setError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Allow photo access to upload your IC or passport.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset.base64) {
      setError('Could not read that image. Try another, or enter your details manually.');
      return;
    }
    setScanBusy(true);
    try {
      handleScan(await scanIdentityImage(asset.base64, asset.mimeType ?? 'image/jpeg'));
    } catch (e) {
      setError(llmErrorMessage(e));
    } finally {
      setScanBusy(false);
    }
  }

  // Live preview proves the IC is structurally parsed (not just accepted).
  const preview = useMemo(() => (validateNric(nric).valid ? parseNric(nric) : null), [nric]);
  const canVerify = name.trim().length >= 2 && validateNric(nric).valid && !busy;

  async function handleVerify() {
    setBusy(true);
    setError('');
    const result = await verifyIdentity(name, nric);
    setBusy(false);
    if (result.verified) setDone(true);
    else setError(result.reason ?? 'Verification failed.');
  }

  if (scanning) {
    return <DocumentScanScreen onCancel={() => setScanning(false)} onResult={handleScan} />;
  }

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Verify identity" onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        <Card style={styles.noteCard}>
          <Text style={styles.noteText}>
            Demo verification (mock) — we validate your MyKad structure and read its details.
            A production build verifies against MyDigital ID / CTOS with document + liveness checks.
          </Text>
        </Card>

        {done && kyc ? (
          <Card style={styles.successCard}>
            <View style={styles.successHead}>
              <View style={styles.checkCircle}>
                <Icon name="check" size={14} color="#fff" stroke={2.6} />
              </View>
              <Text style={styles.successTitle}>Identity verified</Text>
            </View>
            <Text style={styles.successName}>{kyc.fullName}</Text>
            <Text style={styles.successSub}>{kyc.nricMasked} · {kyc.provider}</Text>
            <Pressable style={styles.doneBtn} onPress={finish}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            <View style={styles.scanRow}>
              <Pressable style={styles.scanBtn} onPress={() => setScanning(true)} disabled={scanBusy}>
                <Icon name="camera" size={18} color={colors.accent} />
                <Text style={styles.scanBtnText}>Scan with camera</Text>
              </Pressable>
              <Pressable style={styles.scanBtn} onPress={pickFromGallery} disabled={scanBusy}>
                {scanBusy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Icon name="image" size={18} color={colors.accent} />
                    <Text style={styles.scanBtnText}>Upload from gallery</Text>
                  </>
                )}
              </Pressable>
            </View>
            <Text style={styles.scanHint}>or enter your details manually below</Text>

            <Eyebrow style={{ marginBottom: 8, marginTop: 6 }}>Full name (as in IC)</Eyebrow>
            <TextInput
              style={styles.input}
              placeholder="e.g. Aisyah binti Rahman"
              placeholderTextColor={colors.ink3}
              value={name}
              onChangeText={setName}
            />

            <Eyebrow style={{ marginBottom: 8, marginTop: 16 }}>IC number (MyKad)</Eyebrow>
            <TextInput
              style={styles.input}
              placeholder="e.g. 900115-10-5678"
              placeholderTextColor={colors.ink3}
              keyboardType="numbers-and-punctuation"
              value={nric}
              onChangeText={setNric}
            />

            {preview && (
              <Card style={styles.previewCard}>
                <Text style={styles.previewRow}>Date of birth: <Text style={styles.previewVal}>{preview.dob}</Text></Text>
                <Text style={styles.previewRow}>Gender: <Text style={styles.previewVal}>{preview.gender === 'M' ? 'Male' : 'Female'}</Text></Text>
                <Text style={styles.previewRow}>State of birth: <Text style={styles.previewVal}>{preview.stateOfBirth}</Text></Text>
              </Card>
            )}

            {error !== '' && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.verifyBtn, !canVerify && styles.verifyBtnDisabled]}
              disabled={!canVerify}
              onPress={handleVerify}
            >
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.verifyBtnText}>Verify identity</Text>}
            </Pressable>

            <Text style={styles.privacyNote}>
              Your IC number is validated on-device. Only a masked version (last 4 digits) is stored or shared.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  noteCard: { padding: 14, marginBottom: 16, backgroundColor: '#fffbf0', borderColor: '#f5d78a' },
  noteText: { fontFamily: uiFont(500), fontSize: 12.5, color: '#7a4d00', lineHeight: 18 },
  scanRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  scanBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 50, borderRadius: 14, backgroundColor: colors.accentTint,
    borderWidth: 1, borderColor: colors.accentSoft, paddingHorizontal: 8,
  },
  scanBtnText: { fontFamily: uiFont(700), fontSize: 13, color: colors.accent },
  scanHint: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 8 },
  input: {
    fontFamily: uiFont(500), fontSize: 15, color: colors.ink,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  previewCard: { padding: 14, marginTop: 14, backgroundColor: colors.accentTint, borderColor: colors.accentSoft },
  previewRow: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, marginVertical: 2 },
  previewVal: { fontFamily: uiFont(700), color: colors.ink },
  errorText: { fontFamily: uiFont(600), fontSize: 13, color: '#c0392b', marginTop: 14 },
  verifyBtn: {
    alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 999,
    backgroundColor: colors.accent, marginTop: 18,
  },
  verifyBtnDisabled: { opacity: 0.45 },
  verifyBtnText: { fontFamily: uiFont(700), fontSize: 15, color: colors.onAccent },
  privacyNote: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, lineHeight: 17, marginTop: 12, textAlign: 'center' },

  successCard: { padding: 18, marginTop: 6, backgroundColor: colors.accentTint, borderColor: colors.accentSoft },
  successHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkCircle: { width: 24, height: 24, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontFamily: uiFont(700), fontSize: 16, color: colors.accentInk },
  successName: { fontFamily: uiFont(700), fontSize: 18, color: colors.ink, marginTop: 14 },
  successSub: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, marginTop: 3 },
  doneBtn: { alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 999, backgroundColor: colors.accent, marginTop: 18 },
  doneBtnText: { fontFamily: uiFont(700), fontSize: 14.5, color: colors.onAccent },
});
