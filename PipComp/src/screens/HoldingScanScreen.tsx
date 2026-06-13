// src/screens/HoldingScanScreen.tsx
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { TickerSearchModal } from '../components/TickerSearchModal';
import { B, BtnLabel, BubbleText, Card, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { getProvider, llmErrorMessage } from '../llm';
import { searchCrypto, resolveCryptoTickers } from '../prices';
import { configFor, loadSettings } from '../settings/settingsStore';
import type { TickerResult } from '../lib/prices';
import { useAppData } from '../state/store';
import { colors, numFont, radius, uiFont } from '../theme';

type Phase = 'pick' | 'scanning' | 'review' | 'error' | 'needprovider' | 'done';

interface Row {
  key: number;
  ticker: string;
  qty: string;
  coin: TickerResult | null;
}

export function HoldingScanScreen({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const { addHolding } = useAppData();
  const [phase, setPhase] = useState<Phase>('pick');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);
  const [searchKey, setSearchKey] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.base64) { Alert.alert('Hmm', "That image couldn't be read."); return; }
    await run(a.base64, a.mimeType ?? 'image/jpeg');
  };

  const pickGallery = async () => {
    if (busy) return; setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to pick a screenshot.'); return; }
      await handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 }));
    } finally { setBusy(false); }
  };
  const takePhoto = async () => {
    if (busy) return; setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera access to snap your wallet.'); return; }
      await handle(await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 }));
    } finally { setBusy(false); }
  };

  const run = async (base64: string, mime: string) => {
    setPhase('scanning');
    setError('');
    try {
      const c = configFor(await loadSettings(), 'docs');
      const provider = getProvider(c.provider);
      if (!c.apiKey || !provider.extractHoldings) { setPhase('needprovider'); return; }
      const scanned = await provider.extractHoldings({ apiKey: c.apiKey, model: c.model, parts: [{ kind: 'binary', base64, mimeType: mime }] });
      if (scanned.length === 0) { setError("I couldn't find any coin holdings in that screenshot."); setPhase('error'); return; }
      const resolved = await resolveCryptoTickers(scanned);
      setRows(resolved.map((r, i) => ({ key: i, ticker: r.ticker, qty: String(r.quantity), coin: r.coin })));
      setPhase('review');
    } catch (e) {
      setError(llmErrorMessage(e));
      setPhase('error');
    }
  };

  const patch = (key: number, p: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const remove = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key));

  const importable = rows.filter((r) => r.coin && parseFloat(r.qty.replace(/[^0-9.]/g, '')) > 0);

  const confirm = async () => {
    let n = 0;
    for (const r of importable) {
      const q = Math.round(parseFloat(r.qty.replace(/[^0-9.]/g, '')) * 1e8) / 1e8;
      await addHolding(r.coin!.name, 'crypto', r.coin!.id, r.coin!.ticker, q, null);
      n++;
    }
    setCount(n);
    setPhase('done');
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Scan holdings" onBack={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        {phase === 'pick' && (
          <>
            <PipSays expr="curious">
              <BubbleText>Snap or pick a screenshot of your <B>crypto wallet or exchange</B> — I'll pull out each coin and its amount.</BubbleText>
            </PipSays>
            <View style={{ gap: 14, marginTop: 22 }}>
              <SourceButton icon="camera" title="Take a photo" sub="Point at your wallet balances" onPress={takePhoto} disabled={busy} />
              <SourceButton icon="gallery" title="Choose from gallery" sub="Pick an existing screenshot" onPress={pickGallery} disabled={busy} />
            </View>
          </>
        )}

        {phase === 'scanning' && (
          <>
            <PipSays expr="think"><BubbleText>Reading your holdings and matching tickers…</BubbleText></PipSays>
            <Card style={styles.busy}><ActivityIndicator color={colors.accent} /></Card>
          </>
        )}

        {phase === 'needprovider' && (
          <>
            <PipSays expr="curious"><BubbleText>Scanning needs your <B>Google Gemini</B> key. Add it under <B>Settings → Document import</B>, then try again.</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={onOpenSettings}><Icon name="gear" size={18} color="#fff" /><BtnLabel>Open Settings</BtnLabel></PrimaryButton></View>
          </>
        )}

        {phase === 'error' && (
          <>
            <PipSays expr="curious"><BubbleText>{error}</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={() => setPhase('pick')}><Icon name="image" size={18} color="#fff" /><BtnLabel>Try another screenshot</BtnLabel></PrimaryButton></View>
          </>
        )}

        {phase === 'review' && (
          <>
            <PipSays expr="happy"><BubbleText>Found <B>{rows.length}</B> coin{rows.length === 1 ? '' : 's'}. Check each match and amount, then add them.</BubbleText></PipSays>
            <Card style={{ overflow: 'hidden', marginTop: 16 }}>
              {rows.map((r, i) => (
                <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
                  <Pressable onPress={() => setSearchKey(r.key)} style={styles.tickerBox}>
                    <Text style={styles.tickerText}>{(r.coin?.ticker ?? r.ticker).slice(0, 4)}</Text>
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Pressable onPress={() => setSearchKey(r.key)}>
                      <Text style={[styles.coinName, !r.coin && { color: RED }]} numberOfLines={1}>
                        {r.coin ? r.coin.name : `No match for ${r.ticker} · tap to search`}
                      </Text>
                    </Pressable>
                    <View style={styles.qtyRow}>
                      <TextInput value={r.qty} onChangeText={(v) => patch(r.key, { qty: v })} keyboardType="decimal-pad" style={styles.qtyInput} />
                      <Text style={styles.qtyUnit}>{r.coin?.ticker ?? r.ticker}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => remove(r.key)} hitSlop={8} style={styles.removeBtn}><Icon name="x" size={15} color={colors.ink3} /></Pressable>
                </View>
              ))}
            </Card>
            <Text style={styles.hint}>Tap a coin to change the matched ticker. Values update live once added.</Text>
          </>
        )}

        {phase === 'done' && (
          <>
            <PipSays expr="happy"><BubbleText>Added <B>{count} holding{count === 1 ? '' : 's'}</B>. Pull to refresh on the Net Worth screen for live prices.</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={onClose}><Icon name="check" size={18} color="#fff" stroke={2.4} /><BtnLabel>Done</BtnLabel></PrimaryButton></View>
          </>
        )}
      </ScrollView>

      {phase === 'review' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <PrimaryButton onPress={confirm} disabled={importable.length === 0}>
            <Icon name="check" size={19} color="#fff" stroke={2.4} />
            <BtnLabel>Add {importable.length} holding{importable.length === 1 ? '' : 's'}</BtnLabel>
          </PrimaryButton>
        </View>
      )}

      <TickerSearchModal
        visible={searchKey != null}
        title="Match coin"
        placeholder="BTC, ETH, SOL…"
        search={searchCrypto}
        onPick={(coin) => { if (searchKey != null) patch(searchKey, { coin, ticker: coin.ticker }); setSearchKey(null); }}
        onClose={() => setSearchKey(null)}
      />
    </View>
  );
}

function SourceButton({ icon, title, sub, onPress, disabled }: { icon: IconName; title: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.source, { opacity: disabled ? 0.6 : pressed ? 0.9 : 1 }]}>
      <View style={styles.sourceIcon}><Icon name={icon} size={24} color={colors.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sourceTitle}>{title}</Text>
        <Text style={styles.sourceSub}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.ink3} />
    </Pressable>
  );
}

const RED = '#c5402f';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  busy: { marginTop: 22, padding: 24, alignItems: 'center' },
  source: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderStyle: 'dashed' },
  sourceIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  sourceTitle: { fontFamily: uiFont(700), fontSize: 15.5, color: colors.ink },
  sourceSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink3, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  tickerBox: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  tickerText: { fontFamily: uiFont(700), fontSize: 12, color: colors.accent },
  coinName: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  qtyInput: { fontFamily: numFont(700), fontSize: 15, color: colors.ink, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, minWidth: 90 },
  qtyUnit: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink3 },
  removeBtn: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  hint: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink3, marginTop: 10, marginLeft: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line2 },
});
