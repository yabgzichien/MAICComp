// src/screens/ImportScreen.tsx
import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { B, BtnLabel, BubbleText, Card, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { readDocumentParts } from '../lib/fileRead';
import { getProvider, llmErrorMessage } from '../llm';
import { configFor, loadSettings } from '../settings/settingsStore';
import { useAppData } from '../state/store';
import { DROP, type ExtractedTxn } from '../lib/types';
import { colors, uiFont } from '../theme';
import { ImportReviewScreen } from './ImportReviewScreen';

type Phase = 'reading' | 'extracting' | 'review' | 'saving' | 'done' | 'error' | 'empty' | 'needprovider';

// File types offered to the document picker.
const ACCEPT = [
  'application/pdf',
  'image/*',
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function ImportScreen({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const { commitCategorized } = useAppData();
  const [phase, setPhase] = useState<Phase>('reading');
  const [fileName, setFileName] = useState('');
  const [extracted, setExtracted] = useState<ExtractedTxn[]>([]);
  const [count, setCount] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ACCEPT, copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) {
      onClose();
      return;
    }
    const asset = res.assets[0];
    setFileName(asset.name);
    await run({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null });
  };

  const run = async (file: { uri: string; name: string; mimeType: string | null }) => {
    setPhase('reading');
    setError('');
    try {
      const c = configFor(await loadSettings(), 'docs');
      const provider = getProvider(c.provider);
      if (!c.apiKey || !provider.extractDocument) {
        setPhase('needprovider');
        return;
      }

      const { kind, parts } = await readDocumentParts(file);
      if (kind === 'unsupported' || parts.length === 0) {
        setError("That file type isn't supported. Try a PDF, image, CSV, Excel, or Word file.");
        setPhase('error');
        return;
      }

      setPhase('extracting');
      const items = await provider.extractDocument({ apiKey: c.apiKey, model: c.model, parts });
      if (items.length === 0) {
        // The file was read fine  it just has no transactions (e.g. a statement
        // for a period with no account activity). Not an error.
        setPhase('empty');
        return;
      }

      setExtracted(items);
      setPhase('review');
    } catch (e) {
      setError(llmErrorMessage(e));
      setPhase('error');
    }
  };

  // Confirmed from the review screen: excluded rows arrive as DROP and are skipped.
  const commitReviewed = async (items: ExtractedTxn[], assignments: (string | null)[]) => {
    setPhase('saving');
    try {
      const { created } = await commitCategorized(items, assignments, 'imported');
      setCount(created.length);
      setSkipped(assignments.filter((a) => a === DROP).length);
      setPhase('done');
    } catch (e) {
      setError(llmErrorMessage(e));
      setPhase('error');
    }
  };

  if (phase === 'review') {
    return <ImportReviewScreen items={extracted} onCancel={onClose} onConfirm={commitReviewed} />;
  }

  const busy = phase === 'reading' || phase === 'extracting' || phase === 'saving';

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Import data" onBack={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        {busy && (
          <>
            <PipSays expr="think">
              <BubbleText>
                {phase === 'reading' && 'Opening your file…'}
                {phase === 'extracting' && (
                  <>
                    Reading <B>{fileName}</B> and pulling out transactions…
                  </>
                )}
                {phase === 'saving' && 'Saving your transactions…'}
              </BubbleText>
            </PipSays>
            <Card style={styles.busyCard}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.busyText}>This can take a moment for long statements.</Text>
            </Card>
          </>
        )}

        {phase === 'needprovider' && (
          <>
            <PipSays expr="curious">
              <BubbleText>
                Importing files needs your <B>Google Gemini</B> key. Add it under <B>Settings → Document import</B>, then try again.
              </BubbleText>
            </PipSays>
            <View style={{ marginTop: 22 }}>
              <PrimaryButton onPress={onOpenSettings}>
                <Icon name="gear" size={18} color="#fff" />
                <BtnLabel>Open Settings</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}

        {phase === 'error' && (
          <>
            <PipSays expr="curious">
              <BubbleText>{error}</BubbleText>
            </PipSays>
            <View style={{ marginTop: 22 }}>
              <PrimaryButton onPress={pick}>
                <Icon name="image" size={18} color="#fff" />
                <BtnLabel>Choose another file</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}

        {phase === 'empty' && (
          <>
            <PipSays expr="curious">
              <BubbleText>
                I read <B>{fileName}</B>, but it has <B>no transactions</B> to import  this statement shows no account activity for its period. Try one that covers a month with transactions.
              </BubbleText>
            </PipSays>
            <View style={{ marginTop: 22 }}>
              <PrimaryButton onPress={pick}>
                <Icon name="image" size={18} color="#fff" />
                <BtnLabel>Choose another file</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}

        {phase === 'done' && (
          <>
            <PipSays expr="happy">
              <BubbleText>
                Done! Imported <B>{count} transaction{count === 1 ? '' : 's'}</B>
                {skipped > 0 ? (
                  <>
                    {' '}and skipped <B>{skipped}</B> duplicate{skipped === 1 ? '' : 's'}.
                  </>
                ) : (
                  '.'
                )}
              </BubbleText>
            </PipSays>
            <Card style={styles.doneCard}>
              <Text style={styles.doneText}>
                Categories were filled in from what I’ve learned. Tweak any of them from your transactions list.
              </Text>
            </Card>
            <View style={{ marginTop: 22 }}>
              <PrimaryButton onPress={onClose}>
                <Icon name="check" size={18} color="#fff" stroke={2.4} />
                <BtnLabel>Done</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  busyCard: { marginTop: 22, padding: 22, alignItems: 'center', gap: 12 },
  busyText: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, textAlign: 'center' },
  doneCard: { marginTop: 16, padding: 16 },
  doneText: { fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 19, color: colors.ink2 },
});
