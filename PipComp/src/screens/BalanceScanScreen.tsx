// src/screens/BalanceScanScreen.tsx
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { InstitutionBadge } from '../components/InstitutionBadge';
import { TickerSearchModal } from '../components/TickerSearchModal';
import { B, BtnLabel, BubbleText, Card, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { getLLM, llmErrorMessage } from '../llm';
import { fmt } from '../lib/format';
import { todayISO } from '../lib/duplicates';
import { findMatchingAccounts, matchInstitution, type Institution } from '../lib/institutions';
import { classesFor } from '../lib/networth';
import { notify } from '../lib/platformAlert';
import { searchCrypto, resolveCryptoTickers } from '../prices';
import type { TickerResult } from '../lib/prices';
import type { Account, AccountKind } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, numFont, radius, uiFont } from '../theme';

type Phase = 'pick' | 'scanning' | 'balance' | 'holdings' | 'error' | 'needprovider' | 'done';

interface HoldingRow {
  key: number;
  ticker: string;
  qty: string;
  coin: TickerResult | null;
}

const parseAmount = (s: string): number => Math.max(0, parseFloat(s.replace(/[^0-9.]/g, '')) || 0);

export function BalanceScanScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { accounts, accountValues, addAccount, addHolding, setBalance } = useAppData();
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  // ── holdings-review state (crypto wallet screenshots) ──────────────────────
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [searchKey, setSearchKey] = useState<number | null>(null);

  // ── balance-decision state (bank/e-wallet/loan screenshots) ────────────────
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [rawProvider, setRawProvider] = useState<string | null>(null);
  const [detectedKind, setDetectedKind] = useState<AccountKind>('asset');
  const [amountText, setAmountText] = useState('');
  const [matches, setMatches] = useState<Account[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [forceCreate, setForceCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCls, setNewCls] = useState('cash');

  const handle = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.base64) { notify('Hmm', "That image couldn't be read."); return; }
    await run(a.base64, a.mimeType ?? 'image/jpeg');
  };

  const pickGallery = async () => {
    if (busy) return; setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { notify('Permission needed', 'Allow photo access to pick a screenshot.'); return; }
      await handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 }));
    } finally { setBusy(false); }
  };
  const takePhoto = async () => {
    if (busy) return; setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { notify('Permission needed', 'Allow camera access to snap a screenshot.'); return; }
      await handle(await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 }));
    } finally { setBusy(false); }
  };

  const resetBalanceState = () => {
    setInstitution(null); setRawProvider(null); setDetectedKind('asset'); setAmountText('');
    setMatches([]); setSelectedMatchId(null); setForceCreate(false); setNewName(''); setNewCls('cash');
  };

  const run = async (base64: string, mime: string) => {
    setPhase('scanning');
    setError('');
    resetBalanceState();
    try {
      const llm = await getLLM();
      if (!llm.can('extractSnapshot')) { setPhase('needprovider'); return; }
      const snap = await llm.extractSnapshot({ parts: [{ kind: 'binary', base64, mimeType: mime }] });

      if (snap.kind === 'unknown') {
        setError("I couldn't tell what this screenshot shows. Try a clearer screenshot of a bank/e-wallet balance, a loan statement, or a crypto wallet.");
        setPhase('error');
        return;
      }

      if (snap.kind === 'holdings') {
        if (snap.holdings.length === 0) {
          setError("I couldn't find any coin holdings in that screenshot.");
          setPhase('error');
          return;
        }
        const resolved = await resolveCryptoTickers(snap.holdings);
        setRows(resolved.map((r, i) => ({ key: i, ticker: r.ticker, qty: String(r.quantity), coin: r.coin })));
        setPhase('holdings');
        return;
      }

      // kind === 'balance'
      const inst = matchInstitution(snap.provider);
      const ak: AccountKind = snap.accountKind ?? 'asset';
      const found = findMatchingAccounts(accounts, inst, snap.provider);
      setInstitution(inst);
      setRawProvider(snap.provider);
      setDetectedKind(ak);
      setAmountText(snap.amount != null ? String(snap.amount) : '');
      setMatches(found);
      setSelectedMatchId(found.length === 1 ? found[0].id : null);
      setNewName(inst?.name ?? snap.provider ?? '');
      setNewCls(ak === 'liability' ? classesFor('liability')[0].id : 'cash');
      setPhase('balance');
    } catch (e) {
      setError(llmErrorMessage(e));
      setPhase('error');
    }
  };

  // ── holdings-review actions ─────────────────────────────────────────────
  const patch = (key: number, p: Partial<HoldingRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const remove = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key));
  const importable = rows.filter((r) => r.coin && parseFloat(r.qty.replace(/[^0-9.]/g, '')) > 0);
  const confirmHoldings = async () => {
    let n = 0;
    for (const r of importable) {
      const q = Math.round(parseFloat(r.qty.replace(/[^0-9.]/g, '')) * 1e8) / 1e8;
      await addHolding(r.coin!.name, 'crypto', r.coin!.id, r.coin!.ticker, q, null);
      n++;
    }
    setDoneMsg(`Added ${n} holding${n === 1 ? '' : 's'}. Pull to refresh on the Net Worth screen for live prices.`);
    setPhase('done');
  };

  // ── balance-decision actions ────────────────────────────────────────────
  const selectedAccount = selectedMatchId ? accounts.find((a) => a.id === selectedMatchId) ?? null : null;
  const amount = parseAmount(amountText);
  const currentVal = selectedAccount ? (accountValues[selectedAccount.id] ?? 0) : 0;

  const doReplace = async () => {
    if (!selectedAccount || amount <= 0) return;
    await setBalance(selectedAccount.id, Math.round(amount * 100) / 100, todayISO());
    setDoneMsg(`Updated ${selectedAccount.name}'s balance to RM ${fmt(amount)}.`);
    setPhase('done');
  };
  const doAddInto = async () => {
    if (!selectedAccount || amount <= 0) return;
    const next = Math.round((currentVal + amount) * 100) / 100;
    await setBalance(selectedAccount.id, next, todayISO());
    setDoneMsg(`Added RM ${fmt(amount)} to ${selectedAccount.name}. New balance RM ${fmt(next)}.`);
    setPhase('done');
  };
  const doCreate = async () => {
    if (!newName.trim() || amount <= 0) return;
    await addAccount(newName.trim(), detectedKind, newCls, Math.round(amount * 100) / 100, todayISO());
    setDoneMsg(`Added ${newName.trim()} with an opening balance of RM ${fmt(amount)}.`);
    setPhase('done');
  };

  const showingExisting = !forceCreate && !!selectedAccount;
  const showingCreate = forceCreate || matches.length === 0;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Scan Balance" onBack={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        {phase === 'pick' && (
          <>
            <PipSays expr="curious">
              <BubbleText>Snap or pick a screenshot of a <B>bank account, e-wallet, loan statement, or crypto wallet</B>. I'll read it and figure out what to do with it.</BubbleText>
            </PipSays>
            <View style={{ gap: 14, marginTop: 22 }}>
              <SourceButton icon="camera" title="Take a photo" sub="Point at your balance" onPress={takePhoto} disabled={busy} />
              <SourceButton icon="gallery" title="Choose from gallery" sub="Pick an existing screenshot" onPress={pickGallery} disabled={busy} />
            </View>
          </>
        )}

        {phase === 'scanning' && (
          <>
            <PipSays expr="think"><BubbleText>Reading the screenshot…</BubbleText></PipSays>
            <Card style={styles.busy}><ActivityIndicator color={colors.accent} /></Card>
          </>
        )}

        {phase === 'needprovider' && (
          <>
            <PipSays expr="curious"><BubbleText>Scanning isn't available right now. Try again in a moment.</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={onClose}><Icon name="chevronLeft" size={18} color="#fff" /><BtnLabel>Go back</BtnLabel></PrimaryButton></View>
          </>
        )}

        {phase === 'error' && (
          <>
            <PipSays expr="curious"><BubbleText>{error}</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={() => setPhase('pick')}><Icon name="image" size={18} color="#fff" /><BtnLabel>Try another screenshot</BtnLabel></PrimaryButton></View>
          </>
        )}

        {phase === 'balance' && (
          <>
            <PipSays expr="happy"><BubbleText>Here's what I found.</BubbleText></PipSays>

            <Card style={{ marginTop: 16, padding: 16 }}>
              <View style={styles.detectedRow}>
                <InstitutionBadge inst={institution} fallbackText={rawProvider} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.detectedName} numberOfLines={1}>{institution?.name ?? rawProvider ?? 'Unrecognized provider'}</Text>
                  <Text style={styles.detectedSub}>{institution ? (institution.kind === 'bank' ? 'Bank' : 'E-Wallet') : 'Not in our bank list. Type a name below'}</Text>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Amount</Text>
              <View style={styles.amountRow}>
                <Text style={styles.rm}>RM</Text>
                <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.ink3} style={styles.amountInput} autoFocus={amount === 0} />
              </View>
              {amount === 0 && <Text style={styles.hint}>I couldn't read a clear amount. Enter it to continue.</Text>}
            </Card>

            {!forceCreate && matches.length > 1 && !selectedMatchId && (
              <Card style={{ marginTop: 14, overflow: 'hidden' }}>
                <Text style={styles.sectionLabel}>Which account?</Text>
                {matches.map((m, i) => (
                  <Pressable key={m.id} onPress={() => setSelectedMatchId(m.id)} style={[styles.matchRow, i > 0 && styles.divider]}>
                    <Text style={styles.matchName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.matchVal}>RM {fmt(accountValues[m.id] ?? 0)}</Text>
                  </Pressable>
                ))}
              </Card>
            )}

            {showingExisting && selectedAccount && (
              <View style={{ marginTop: 18, gap: 10 }}>
                <PrimaryButton onPress={doReplace} disabled={amount <= 0}>
                  <Icon name="check" size={18} color="#fff" stroke={2.4} />
                  <BtnLabel>Replace {selectedAccount.name}'s balance</BtnLabel>
                </PrimaryButton>
                <SecondaryButton onPress={doAddInto} disabled={amount <= 0} icon="plus">
                  Add to {selectedAccount.name}'s balance (RM {fmt(currentVal)} + RM {fmt(amount)})
                </SecondaryButton>
                <Pressable onPress={() => setForceCreate(true)} hitSlop={6} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Not this account? Add as a new account instead</Text>
                </Pressable>
              </View>
            )}

            {showingCreate && (
              <Card style={{ marginTop: 14, padding: 16 }}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput value={newName} onChangeText={setNewName} placeholder="Account name" placeholderTextColor={colors.ink3} style={styles.textInput} />

                {detectedKind === 'liability' && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Type</Text>
                    <View style={styles.classGrid}>
                      {classesFor('liability').map((c) => {
                        const on = newCls === c.id;
                        return (
                          <Pressable key={c.id} onPress={() => setNewCls(c.id)} style={[styles.classChip, on && styles.classChipOn]}>
                            <Text style={[styles.classChipText, on && { color: colors.accentInk }]}>{c.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                <View style={{ marginTop: 18 }}>
                  <PrimaryButton onPress={doCreate} disabled={!newName.trim() || amount <= 0}>
                    <Icon name="plus" size={18} color="#fff" stroke={2.4} />
                    <BtnLabel>Add account</BtnLabel>
                  </PrimaryButton>
                </View>
                {matches.length > 0 && (
                  <Pressable onPress={() => { setForceCreate(false); if (!selectedMatchId && matches.length === 1) setSelectedMatchId(matches[0].id); }} hitSlop={6} style={styles.linkBtn}>
                    <Text style={styles.linkText}>Use an existing account instead</Text>
                  </Pressable>
                )}
              </Card>
            )}
          </>
        )}

        {phase === 'holdings' && (
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
            <PipSays expr="happy"><BubbleText>{doneMsg}</BubbleText></PipSays>
            <View style={{ marginTop: 22 }}><PrimaryButton onPress={onClose}><Icon name="check" size={18} color="#fff" stroke={2.4} /><BtnLabel>Done</BtnLabel></PrimaryButton></View>
          </>
        )}
      </ScrollView>

      {phase === 'holdings' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <PrimaryButton onPress={confirmHoldings} disabled={importable.length === 0}>
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

function SecondaryButton({ onPress, disabled, icon, children }: { onPress: () => void; disabled?: boolean; icon: IconName; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.secondaryBtn, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      <Icon name={icon} size={17} color={colors.accent} />
      <Text style={styles.secondaryBtnText}>{children}</Text>
    </Pressable>
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
  sourceSub: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, marginTop: 1 },

  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detectedName: { fontFamily: uiFont(700), fontSize: 16, color: colors.ink },
  detectedSub: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2, marginTop: 2 },

  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2, marginBottom: 8 },
  textInput: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, fontFamily: uiFont(600), fontSize: 16, color: colors.ink },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14 },
  rm: { fontFamily: numFont(600), fontSize: 18, color: colors.ink2 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, color: colors.ink, paddingVertical: 12 },
  hint: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, marginTop: 8 },

  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.line },
  classChipOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  classChipText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink2 },

  sectionLabel: { fontFamily: uiFont(700), fontSize: 11, color: colors.ink2, letterSpacing: 0.06, textTransform: 'uppercase', padding: 14, paddingBottom: 6 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  matchName: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  matchVal: { fontFamily: numFont(700), fontSize: 13.5, color: colors.ink2 },

  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radius.md, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentSoft },
  secondaryBtnText: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.accent, textAlign: 'center' },
  linkBtn: { alignSelf: 'center', marginTop: 4, padding: 6 },
  linkText: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.accent },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  tickerBox: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  tickerText: { fontFamily: uiFont(700), fontSize: 12, color: colors.accent },
  coinName: { fontFamily: uiFont(600), fontSize: 14.5, color: colors.ink },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  qtyInput: { fontFamily: numFont(700), fontSize: 15, color: colors.ink, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, minWidth: 90 },
  qtyUnit: { fontFamily: uiFont(600), fontSize: 12.5, color: colors.ink2 },
  removeBtn: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line2 },
});
