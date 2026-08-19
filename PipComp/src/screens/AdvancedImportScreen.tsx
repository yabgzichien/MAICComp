// src/screens/AdvancedImportScreen.tsx
//
// Advanced import: user copies a prompt, attaches files to any LLM (Claude,
// ChatGPT, Gemini …), then pastes the JSON reply here.
//
// The JSON schema covers THREE data types:
//   transactions  → ExtractedTxn[]  → ImportReviewScreen → commitCategorized
//   accounts      → balance snapshots (savings, investments, loans, credit cards)
//                   → addAccount + addBalanceEntry on the Net Worth side
//
// JSON conventions:
//   transactions.amount: NEGATIVE = expense/debit, POSITIVE = income/credit
//   accounts.balance: always POSITIVE (outstanding amount for liabilities too)

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import {
  B,
  BtnLabel,
  BubbleText,
  Card,
  Eyebrow,
  PipSays,
  PrimaryButton,
  TopBar,
} from '../components/ui';
import { addAccount, listAccounts } from '../db/accountsRepo';
import { DROP, type Account, type ExtractedTxn } from '../lib/types';
import { todayISO } from '../lib/duplicates';
import { defaultLinkEffect } from '../lib/networth';
import { buildPrompt, parseJSON, type ParsedAccount, type ParseResult } from '../lib/advancedImport';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { radius, uiFont } from '../theme';
import { ImportReviewScreen } from './ImportReviewScreen';

export type { ParsedAccount, ParseResult };

// ─────────────────────────────────────────────────────────────────────────────
// LLM link chips
// ─────────────────────────────────────────────────────────────────────────────

const LLM_LINKS = [
  { label: 'Claude', url: 'https://claude.ai', emoji: '✦' },
  { label: 'ChatGPT', url: 'https://chatgpt.com', emoji: '✿' },
  { label: 'Gemini', url: 'https://gemini.google.com', emoji: '✧' },
];

function LLMChip({ label, url, emoji }: { label: string; url: string; emoji: string }) {
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [
        styles.llmChip,
        { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
        { opacity: pressed ? 0.82 : 1 },
      ]}
      accessibilityRole="link"
      accessibilityLabel={`Open ${label}`}
    >
      <Text style={styles.llmEmoji}>{emoji}</Text>
      <Text style={[styles.llmLabel, { color: colorTheme.ink }]}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account review list (shown between parse and commit)
// ─────────────────────────────────────────────────────────────────────────────

function AccountReviewList({
  accounts,
  onChange,
}: {
  accounts: ParsedAccount[];
  onChange: (updated: ParsedAccount[]) => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const toggle = (i: number) => {
    const next = accounts.map((a, j) => (j === i ? { ...a, include: !a.include } : a));
    onChange(next);
  };

  if (accounts.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {accounts.map((acc, i) => {
        const isAsset = acc.kind === 'asset';
        const dot = isAsset ? theme.accent : colorTheme.amber;
        return (
          <Pressable
            key={i}
            onPress={() => toggle(i)}
            style={[
              styles.accRow,
              { borderBottomColor: colorTheme.line },
              !acc.include && { opacity: 0.45 },
            ]}
          >
            {/* Tick box */}
            <View
              style={[
                styles.tick,
                { borderColor: colorTheme.line },
                acc.include && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
            >
              {acc.include && (
                <Text style={{ color: '#fff', fontSize: 11, fontFamily: uiFont(800), lineHeight: 14 }}>✓</Text>
              )}
            </View>

            {/* Dot + name */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.kindDot, { backgroundColor: dot }]} />
                <Text style={[styles.accName, { color: colorTheme.ink }]} numberOfLines={1}>{acc.name}</Text>
              </View>
              <Text style={[styles.accMeta, { color: colorTheme.ink3 }]}>
                {acc.clsLabel}
                {acc.notes ? ` · ${acc.notes}` : ''}
                {' · '}{acc.asOf}
              </Text>
            </View>

            {/* Balance */}
            <Text style={[styles.accBalance, { color: isAsset ? theme.accent : colorTheme.amber }]}>
              {isAsset ? '+' : '−'}RM{acc.balance.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

type Phase =
  | 'guide'
  | 'pasting'
  | 'accountReview'   // reviewing parsed accounts before the txn review
  | 'txnReview'       // ImportReviewScreen takeover
  | 'saving'
  | 'done'
  | 'error';


export function AdvancedImportScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { commitCategorized, recordBalanceLink, refreshAll } = useAppData();

  const [phase, setPhase] = useState<Phase>('guide');
  const [jsonText, setJsonText] = useState('');
  const [parsedTxns, setParsedTxns] = useState<ExtractedTxn[]>([]);
  const [parsedAccounts, setParsedAccounts] = useState<ParsedAccount[]>([]);
  const [updateAccountBalances, setUpdateAccountBalances] = useState(true);
  const [error, setError] = useState('');
  const [txnCount, setTxnCount] = useState(0);
  const [txnSkipped, setTxnSkipped] = useState(0);
  const [accCount, setAccCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prompt = buildPrompt();

  // ── Copy prompt ──────────────────────────────────────────────────────────
  const copyPrompt = async () => {
    try {
      if (Platform.OS === 'web') {
        await (navigator as Navigator & { clipboard: Clipboard }).clipboard.writeText(prompt);
      } else {
        await Share.share({ message: prompt });
      }
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Non-fatal: user can long-press-select the preview text.
    }
  };

  // ── Parse pasted JSON ─────────────────────────────────────────────────────
  const handlePasteImport = () => {
    const trimmed = jsonText.trim();
    if (!trimmed) {
      setError('Paste the JSON from the AI response first.');
      setPhase('error');
      return;
    }
    try {
      const { transactions, accounts } = parseJSON(trimmed);
      if (transactions.length === 0 && accounts.length === 0) {
        setError('The JSON had no transactions or accounts. Check that you pasted the full reply.');
        setPhase('error');
        return;
      }
      setParsedTxns(transactions);
      setParsedAccounts(accounts);
      // If there are accounts to review, show that step first.
      if (accounts.length > 0) {
        setPhase('accountReview');
      } else {
        setPhase('txnReview');
      }
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "That doesn't look like valid JSON. Make sure you pasted the entire block from the AI."
          : String(e),
      );
      setPhase('error');
    }
  };

  // ── Commit accounts + transactions ────────────────────────────────────────
  const commitAll = async (txns: ExtractedTxn[], assignments: (string | null)[]) => {
    setPhase('saving');
    let savedAcc = 0;
    try {
      // 1. Commit the chosen accounts to the Net Worth DB.
      const toSave = parsedAccounts.filter((a) => a.include);
      const newlyCreatedAccounts: Account[] = [];
      for (const acc of toSave) {
        const createdAcc = await addAccount(acc.name, acc.kind, acc.cls, acc.balance, acc.asOf);
        newlyCreatedAccounts.push(createdAcc);
        savedAcc++;
      }

      // 2. Commit transactions via the store.
      const { created } = await commitCategorized(txns, assignments, 'imported');
      setTxnCount(created.length);
      setTxnSkipped(assignments.filter((a) => a === DROP).length);
      setAccCount(savedAcc);

      // 3. Update account balances with imported transactions if option enabled.
      if (updateAccountBalances) {
        const existingAccounts = await listAccounts();
        const allAccounts = [
          ...newlyCreatedAccounts,
          ...existingAccounts.filter((e) => !newlyCreatedAccounts.some((n) => n.id === e.id)),
        ];

        const today = todayISO();
        for (let i = 0; i < txns.length; i++) {
          if (assignments[i] === DROP) continue;
          const txn = txns[i];

          let targetAccount: Account | null = null;
          if (txn.account) {
            const searchName = txn.account.trim().toLowerCase();
            targetAccount = allAccounts.find((a) => a.name.trim().toLowerCase() === searchName) || null;
          }
          if (!targetAccount && allAccounts.length === 1) {
            targetAccount = allAccounts[0];
          }

          if (targetAccount) {
            const effect = defaultLinkEffect(targetAccount.kind, txn.type);
            await recordBalanceLink(targetAccount.id, txn.amount, effect, txn.date ?? today);
          }
        }
      }

      // Refresh so Net Worth screen picks up new accounts and balance entries.
      await refreshAll();

      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  // ── txnReview is a full-screen takeover ──────────────────────────────────
  if (phase === 'txnReview') {
    if (parsedTxns.length === 0) {
      // No transactions: skip review and commit accounts only (empty assignments).
      void commitAll([], []);
      return (
        <View style={[styles.root, { backgroundColor: colorTheme.bg, alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={theme.accent} />
        </View>
      );
    }
    return (
      <ImportReviewScreen
        items={parsedTxns}
        onCancel={() => setPhase(parsedAccounts.length > 0 ? 'accountReview' : 'pasting')}
        onConfirm={commitAll}
        updateAccountBalances={updateAccountBalances}
        onToggleUpdateAccountBalances={setUpdateAccountBalances}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Advanced Import" onBack={onClose} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Pip intro / done message ── */}
        <PipSays expr={phase === 'done' ? 'happy' : 'idle'}>
          <BubbleText>
            {phase === 'done' ? (
              <>
                Done!
                {txnCount > 0 && <> Imported <B>{txnCount} transaction{txnCount === 1 ? '' : 's'}</B>{txnSkipped > 0 ? <> (skipped <B>{txnSkipped}</B> dup{txnSkipped === 1 ? '' : 's'})</> : ''}.</>}
                {accCount > 0 && <> Added <B>{accCount} account{accCount === 1 ? '' : 's'}</B> to Net Worth.</>}
              </>
            ) : phase === 'accountReview' ? (
              <>
                Found <B>{parsedAccounts.length}</B> account{parsedAccounts.length === 1 ? '' : 's'} and <B>{parsedTxns.length}</B> transaction{parsedTxns.length === 1 ? '' : 's'}. Untick any accounts you don't want, then continue to review the transactions.
              </>
            ) : (
              <>
                Got a long PDF or spreadsheet? Copy the prompt, open your favourite AI, attach your files, and paste the JSON back.{'\n'}No API key needed.
              </>
            )}
          </BubbleText>
        </PipSays>

        {/* ── DONE ── */}
        {phase === 'done' && (
          <>
            <Card style={{ padding: 16, marginTop: 18, gap: 10 }}>
              {txnCount > 0 && (
                <Text style={[styles.doneText, { color: colorTheme.ink2 }]}>
                  Transaction categories were filled in from what Pip has learned. Tweak them in your transactions list.
                </Text>
              )}
              {accCount > 0 && (
                <Text style={[styles.doneText, { color: colorTheme.ink2 }]}>
                  Accounts are now visible in <B>Net Worth</B>. Tap any account there to update balances over time.
                </Text>
              )}
            </Card>
            <View style={{ marginTop: 22 }}>
              <PrimaryButton onPress={onClose}>
                <Icon name="check" size={18} color="#fff" stroke={2.4} />
                <BtnLabel>Done</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}

        {/* ── SAVING ── */}
        {phase === 'saving' && (
          <Card style={[styles.busyCard, { marginTop: 18 }]}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.busyText, { color: colorTheme.ink2 }]}>Saving your data…</Text>
          </Card>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <>
            <Card style={[styles.errorCard, { borderColor: `${colorTheme.red}44`, backgroundColor: `${colorTheme.red}08` }, { marginTop: 18 }]}>
              <View style={styles.errorRow}>
                <Icon name="alert" size={16} color={colorTheme.red} />
                <Text style={[styles.errorText, { color: colorTheme.red }]}>{error}</Text>
              </View>
            </Card>
            <View style={{ marginTop: 14 }}>
              <PrimaryButton onPress={() => setPhase('pasting')}>
                <Icon name="chevronLeft" size={18} color="#fff" />
                <BtnLabel>Try again</BtnLabel>
              </PrimaryButton>
            </View>
          </>
        )}

        {/* ── ACCOUNT REVIEW ── */}
        {phase === 'accountReview' && (
          <>
            <View style={{ marginTop: 20 }}>
              <Eyebrow style={{ marginBottom: 12 }}>
                {parsedAccounts.filter((a) => a.include).length} of {parsedAccounts.length} accounts selected
              </Eyebrow>

              {/* Legend */}
              <View style={styles.legendRow}>
                <View style={[styles.kindDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.legendText, { color: colorTheme.ink2 }]}>Asset</Text>
                <View style={[styles.kindDot, { backgroundColor: colorTheme.amber, marginLeft: 12 }]} />
                <Text style={[styles.legendText, { color: colorTheme.ink2 }]}>Liability (outstanding balance)</Text>
              </View>

              <Card style={{ padding: 14, marginTop: 10 }}>
                <AccountReviewList
                  accounts={parsedAccounts}
                  onChange={setParsedAccounts}
                />
              </Card>

              {parsedTxns.length > 0 && (
                <Card style={{ padding: 14, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable
                    onPress={() => setUpdateAccountBalances((prev) => !prev)}
                    hitSlop={6}
                    style={{ padding: 2 }}
                  >
                    <View
                      style={[
                        styles.tick,
                        { borderColor: colorTheme.line },
                        updateAccountBalances && { backgroundColor: theme.accent, borderColor: theme.accent },
                      ]}
                    >
                      {updateAccountBalances && (
                        <Text style={{ color: '#fff', fontSize: 11, fontFamily: uiFont(800), lineHeight: 14 }}>✓</Text>
                      )}
                    </View>
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => setUpdateAccountBalances((prev) => !prev)}>
                    <Text style={[styles.accName, { color: colorTheme.ink }]}>
                      Update asset & liability balances
                    </Text>
                    <Text style={[styles.accMeta, { color: colorTheme.ink3, marginTop: 2 }]}>
                      Apply imported income and expenses to adjust asset and liability account balances
                    </Text>
                  </Pressable>
                </Card>
              )}
            </View>

            <View style={{ marginTop: 18, gap: 10 }}>
              {parsedTxns.length > 0 ? (
                <PrimaryButton onPress={() => setPhase('txnReview')}>
                  <Icon name="chevronRight" size={18} color="#fff" />
                  <BtnLabel>Continue — Review {parsedTxns.length} transaction{parsedTxns.length === 1 ? '' : 's'}</BtnLabel>
                </PrimaryButton>
              ) : (
                <PrimaryButton onPress={() => void commitAll([], [])}>
                  <Icon name="check" size={18} color="#fff" stroke={2.4} />
                  <BtnLabel>Import {parsedAccounts.filter((a) => a.include).length} account{parsedAccounts.filter((a) => a.include).length === 1 ? '' : 's'}</BtnLabel>
                </PrimaryButton>
              )}
              <Pressable onPress={() => setPhase('pasting')} style={styles.backLink}>
                <Text style={[styles.backLinkText, { color: colorTheme.ink3 }]}>← Back to paste</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── GUIDE + PASTING ── */}
        {(phase === 'guide' || phase === 'pasting') && (
          <>
            {/* Step 1 */}
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, { backgroundColor: theme.accent }]}><Text style={styles.stepNum}>1</Text></View>
              <Text style={[styles.stepTitle, { color: colorTheme.ink }]}>Copy Prompt</Text>
            </View>

            <Card style={{ padding: 18, gap: 14 }}>
              <Pressable
                onPress={copyPrompt}
                style={({ pressed }) => [
                  styles.copyBtn,
                  { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
                  pressed && { opacity: 0.88 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Copy prompt to clipboard"
              >
                <Icon name="receipt" size={18} color={theme.accent} />
                <Text style={[styles.copyBtnText, { color: theme.accent }]}>
                  {copied ? '✓ Prompt copied!' : 'Copy Prompt'}
                </Text>
              </Pressable>

              <Text style={[styles.copyHint, { color: colorTheme.ink2 }]}>
                Paste the prompt and attach your file(s): statements, spreadsheets, or any financial export. Multiple files are fine.
              </Text>

              <View>
                <Text style={[styles.openInLabel, { color: colorTheme.ink3 }]}>Open in</Text>
                <View style={styles.llmRow}>
                  {LLM_LINKS.map((l) => <LLMChip key={l.label} {...l} />)}
                </View>
              </View>

              <View style={[styles.tipRow, { backgroundColor: `${colorTheme.amber}12` }]}>
                <Icon name="sparkles" size={13} color={colorTheme.amber} />
                <Text style={[styles.tipText, { color: colorTheme.ink2 }]}>
                  For large or multi-page files, enable <B>thinking / reasoning mode</B> for best results.
                </Text>
              </View>

              {/* What gets imported summary */}
              <View style={[styles.coversBox, { backgroundColor: colorTheme.surface2 }]}>
                <Text style={[styles.coversTitle, { color: colorTheme.ink2 }]}>The prompt covers:</Text>
                {[
                  'Transactions (expenses, income)',
                  'Cash & savings account balances',
                  'Investments (stocks, crypto, unit trusts)',
                  'Liabilities (loans, credit cards, BNPL)',
                ].map((line) => (
                  <View key={line} style={styles.coversRow}>
                    <Text style={[styles.coversDot, { color: theme.accent }]}>✓</Text>
                    <Text style={[styles.coversText, { color: colorTheme.ink2 }]}>{line}</Text>
                  </View>
                ))}
              </View>

              {/* Prompt preview */}
              <View>
                <Eyebrow style={{ marginBottom: 8 }}>Prompt preview</Eyebrow>
                <View style={[styles.promptBox, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                  <TextInput
                    multiline
                    editable={false}
                    selectTextOnFocus
                    value={prompt}
                    style={[styles.promptText, { color: colorTheme.ink2 }]}
                    scrollEnabled={false}
                    accessibilityLabel="Prompt text, selectable"
                  />
                </View>
                <Text style={[styles.promptNote, { color: colorTheme.ink3 }]}>
                  Long-press to select all and copy if the button above doesn't work.
                </Text>
              </View>
            </Card>

            {/* Arrow */}
            <View style={styles.arrowRow}>
              <View style={[styles.arrowLine, { backgroundColor: colorTheme.line }]} />
              <Text style={[styles.arrowIcon, { color: colorTheme.ink3 }]}>↓</Text>
              <View style={[styles.arrowLine, { backgroundColor: colorTheme.line }]} />
            </View>

            {/* Step 2 */}
            <View style={styles.stepHeader}>
              <View style={[styles.stepBadge, { backgroundColor: theme.accent }]}><Text style={styles.stepNum}>2</Text></View>
              <Text style={[styles.stepTitle, { color: colorTheme.ink }]}>Import Result</Text>
            </View>

            <Card style={{ padding: 18, gap: 14 }}>
              <Text style={[styles.copyHint, { color: colorTheme.ink2 }]}>
                Copy the entire JSON block from the AI and paste it below.
              </Text>

              <TextInput
                multiline
                value={jsonText}
                onChangeText={(t) => {
                  setJsonText(t);
                  setPhase((prev) => (prev === 'guide' ? 'pasting' : prev));
                }}
                placeholder={'{\n  "transactions": [ … ],\n  "accounts": [ … ]\n}'}
                placeholderTextColor={colorTheme.ink3}
                style={[
                  styles.jsonInput,
                  { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink },
                ]}
                textAlignVertical="top"
                autoCorrect={false}
                autoCapitalize="none"
                spellCheck={false}
                accessibilityLabel="Paste JSON here"
              />

              <PrimaryButton onPress={handlePasteImport}>
                <Icon name="check" size={18} color="#fff" stroke={2.4} />
                <BtnLabel>Parse & Review</BtnLabel>
              </PrimaryButton>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 10 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: uiFont(800), fontSize: 13, color: '#fff' },
  stepTitle: { fontFamily: uiFont(700), fontSize: 16 },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  copyBtnText: { fontFamily: uiFont(700), fontSize: 15 },

  copyHint: { fontFamily: uiFont(500), fontSize: 13, lineHeight: 19, textAlign: 'center' },

  openInLabel: { fontFamily: uiFont(600), fontSize: 12, textAlign: 'center', marginBottom: 8 },
  llmRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  llmChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1 },
  llmEmoji: { fontSize: 15 },
  llmLabel: { fontFamily: uiFont(600), fontSize: 13 },

  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: radius.sm, padding: 11 },
  tipText: { fontFamily: uiFont(500), fontSize: 12.5, flex: 1, lineHeight: 18 },

  coversBox: { borderRadius: radius.sm, padding: 12, gap: 6 },
  coversTitle: { fontFamily: uiFont(700), fontSize: 12, marginBottom: 4 },
  coversRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  coversDot: { fontFamily: uiFont(700), fontSize: 12, width: 14 },
  coversText: { fontFamily: uiFont(500), fontSize: 12.5, flex: 1 },

  promptBox: { borderWidth: 1, borderRadius: radius.sm, padding: 12, maxHeight: 180, overflow: 'hidden' },
  promptText: { fontFamily: uiFont(400), fontSize: 11, lineHeight: 16 },
  promptNote: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 6, textAlign: 'center' },

  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, paddingHorizontal: 24 },
  arrowLine: { flex: 1, height: 1 },
  arrowIcon: { fontFamily: uiFont(400), fontSize: 18 },

  jsonInput: {
    borderWidth: 1.5,
    borderRadius: radius.sm, padding: 12, height: 160,
    fontFamily: uiFont(400), fontSize: 12, lineHeight: 18,
  },

  // Account review
  accRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tick: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  kindDot: { width: 7, height: 7, borderRadius: 4 },
  accName: { fontFamily: uiFont(700), fontSize: 13.5, flex: 1 },
  accMeta: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 1 },
  accBalance: { fontFamily: uiFont(700), fontSize: 13, flexShrink: 0 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: uiFont(500), fontSize: 12 },

  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { fontFamily: uiFont(600), fontSize: 13 },

  // Done / saving / error
  busyCard: { padding: 22, alignItems: 'center', gap: 12 },
  busyText: { fontFamily: uiFont(500), fontSize: 13, textAlign: 'center' },
  doneText: { fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 20 },
  errorCard: { borderWidth: 1.5, borderRadius: radius.md, padding: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { fontFamily: uiFont(500), fontSize: 13.5, flex: 1, lineHeight: 19 },
});
