// src/components/ScanBalanceButton.tsx
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { getProvider, llmErrorMessage } from '../llm';
import { notify } from '../lib/platformAlert';
import { configFor, loadSettings } from '../settings/settingsStore';
import { colors, uiFont } from '../theme';
import { Icon } from './Icon';

/** Snap or pick a screenshot of a balance; Gemini reads the amount and reports it back. */
export function ScanBalanceButton({ onResult }: { onResult: (amount: number) => void }) {
  const [busy, setBusy] = useState(false);

  const extract = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.base64) { notify('Hmm', "That image couldn't be read."); return; }
    setBusy(true);
    try {
      const c = configFor(await loadSettings(), 'docs');
      const provider = getProvider(c.provider);
      if (!c.apiKey || !provider.extractBalance) {
        notify('Add your Gemini key', 'Scanning needs your Google Gemini key in Settings → Document import.');
        return;
      }
      const amount = await provider.extractBalance({
        apiKey: c.apiKey,
        model: c.model,
        parts: [{ kind: 'binary', base64: a.base64, mimeType: a.mimeType ?? 'image/jpeg' }],
      });
      if (amount == null) notify('Hmm', "I couldn't read a clear amount. Try a clearer screenshot or type it in.");
      else onResult(amount);
    } catch (e) {
      notify('Scan failed', llmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify('Permission needed', 'Allow photo access to pick a screenshot.'); return; }
    await extract(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 }));
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { notify('Permission needed', 'Allow camera access to snap a balance.'); return; }
    await extract(await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 }));
  };

  const start = () => {
    if (busy) return;
    // RN-web has no native action-sheet Alert — go straight to the file picker on web.
    if (Platform.OS === 'web') { pickGallery(); return; }
    Alert.alert('Scan balance', 'Read the amount from a screenshot or photo.', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose from gallery', onPress: pickGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable onPress={start} disabled={busy} style={({ pressed }) => [styles.btn, { opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Icon name="scan" size={15} color={colors.accent} />}
      <Text style={styles.text}>{busy ? 'Reading…' : 'Scan'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentSoft },
  text: { fontFamily: uiFont(700), fontSize: 13, color: colors.accent },
});
