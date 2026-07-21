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
import { addAccount } from '../db/accountsRepo';
import { ACCOUNT_CLASSES } from '../lib/networth';
import { todayISO } from '../lib/duplicates';
import { DROP, type ExtractedTxn } from '../lib/types';
import { useAppData } from '../state/store';
import { colors, radius, uiFont } from '../theme';
import { ImportReviewScreen } from './ImportReviewScreen';

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(): string {
  return `Parse every transaction AND every account balance from the uploaded file(s) into JSON. Files may be bank statements, e-wallet exports, investment reports, loan statements, Google Sheets, Excel, CSV, or any financial record.

──────────────────────────────────────
SECTION 1 — TRANSACTIONS
──────────────────────────────────────
For each transaction row found, output:
- date: YYYY-MM-DD
- description: clean merchant / payee name (remove codes, reference numbers, trailing digits)
- amount: NEGATIVE for expenses / debits, POSITIVE for income / credits
- category: describe the category freely based on what you actually see in the document.
    • Use plain English (e.g. "restaurant", "petrol", "salary", "online shopping", "electricity bill").
    • If the document itself labels it, use that label.
    • If you genuinely cannot tell, write "?".
    • NEVER invent or guess a category when there is no evidence in the document.
- account: specific account name as printed on the document (e.g. "Maybank Savings", "Touch 'n Go eWallet"), or "Unknown" if not stated.

Skip ONLY: running balance lines, statement totals, opening/closing balances, disclosures, headers/footers.

──────────────────────────────────────
SECTION 2 — ACCOUNT BALANCES
──────────────────────────────────────
For each distinct account / holding in the file(s), output one entry:
- name: account name as shown in the document
- type: one of → "Cash", "Investments", "Mortgage", "Personal Loan", "Credit Card", "Pay Later", "Car Loan"
- balance: current balance as a POSITIVE number (outstanding amount for loans/cards)
- currency: 3-letter code (e.g. "MYR", "USD") — use "MYR" if not stated
- as_of: YYYY-MM-DD date of the balance reading, or the statement end date
- notes: ticker symbol for investments (e.g. "AAPL", "BTC"), or null

──────────────────────────────────────
REPLY FORMAT — ONLY a JSON code block, no other text:
──────────────────────────────────────

\`\`\`json
{
  "statement": {
    "issuer": "<institution name or 'Multiple'>",
    "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
  },
  "transactions": [
    { "date": "YYYY-MM-DD", "description": "...", "amount": -0.00, "category": "...", "account": "..." }
  ],
  "accounts": [
    { "name": "...", "type": "Cash", "balance": 0.00, "currency": "MYR", "as_of": "YYYY-MM-DD", "notes": null }
  ]
}
\`\`\`

## Rules
- NEVER fabricate or hallucinate. Only output what is in the document.
- NEVER skip, truncate, or omit transactions. Read every page of every file. Output every single row.
- If multiple files are uploaded, process each fully then merge into the single arrays.
- If the statement spans a year boundary and only shows month/day, infer the year from the statement period.
- Do not ask questions, do not refuse, do not offer to split into multiple responses.
- If your output gets cut off, stop mid-JSON and I will reply 'continue' so you can finish. Do not stop early.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types for the parsed LLM output
// ─────────────────────────────────────────────────────────────────────────────

interface LLMTxn {
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  category?: unknown;
  account?: unknown;
}

interface LLMAccount {
  name?: unknown;
  type?: unknown;
  balance?: unknown;
  currency?: unknown;
  as_of?: unknown;
  notes?: unknown;
}

interface LLMOutput {
  transactions?: LLMTxn[];
  accounts?: LLMAccount[];
}

// Parsed account ready to commit to the DB.
export interface ParsedAccount {
  name: string;
  cls: string;       // ACCOUNT_CLASSES id
  clsLabel: string;  // human label
  kind: 'asset' | 'liability';
  balance: number;
  asOf: string;
  notes: string | null;
  include: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE → cls mapping
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_TO_CLS: Record<string, string> = {
  cash: 'cash',
  investments: 'investments',
  investment: 'investments',
  mortgage: 'mortgage',
  'personal loan': 'personal',
  personal: 'personal',
  'credit card': 'credit_card',
  creditcard: 'credit_card',
  'pay later': 'pay_later',
  paylater: 'pay_later',
  'car loan': 'car',
  car: 'car',
};

function resolveClsId(rawType: string): string {
  const key = rawType.toLowerCase().trim();
  return TYPE_TO_CLS[key] ?? 'cash'; // default to cash if unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON parser
// ─────────────────────────────────────────────────────────────────────────────

interface ParseResult {
  transactions: ExtractedTxn[];
  accounts: ParsedAccount[];
}

function parseJSON(raw: string): ParseResult {
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();

  const parsed: unknown = JSON.parse(stripped);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not a JSON object.');
  const obj = parsed as LLMOutput;

  // ── Transactions ──
  const txnRows = Array.isArray(obj.transactions) ? obj.transactions : [];
  const transactions: ExtractedTxn[] = txnRows.map((r): ExtractedTxn => {
    const rawAmt = typeof r.amount === 'number' ? r.amount : Number(r.amount ?? 0);
    const absAmt = Math.abs(rawAmt);
    const type = rawAmt >= 0 ? 'income' : 'expense';
    const merchant =
      (typeof r.description === 'string' && r.description.trim()) ||
      (typeof r.account === 'string' && r.account.trim()) ||
      'Unknown';
    const rawDate = typeof r.date === 'string' ? r.date.trim() : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    const categoryHint =
      typeof r.category === 'string' && r.category.trim() ? r.category.trim() : null;
    return { merchant, amount: absAmt, type, date, method: null, categoryHint };
  });

  // ── Accounts ──
  const accRows = Array.isArray(obj.accounts) ? obj.accounts : [];
  const today = todayISO();
  const accounts: ParsedAccount[] = accRows.map((r): ParsedAccount => {
    const name =
      typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Unnamed Account';
    const clsId = typeof r.type === 'string' ? resolveClsId(r.type) : 'cash';
    const meta = ACCOUNT_CLASSES.find((c) => c.id === clsId) ?? ACCOUNT_CLASSES[0];
    const balance = Math.abs(
      typeof r.balance === 'number' ? r.balance : Number(r.balance ?? 0)
    );
    const rawDate = typeof r.as_of === 'string' ? r.as_of.trim() : '';
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
    const notes =
      typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : null;
    return {
      name,
      cls: clsId,
      clsLabel: meta.label,
      kind: meta.kind,
      balance,
      asOf,
      notes,
      include: true,
    };
  });

  return { transactions, accounts };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM link chips
// ─────────────────────────────────────────────────────────────────────────────

const LLM_LINKS = [
  { label: 'Claude', url: 'https://claude.ai', emoji: '✦' },
  { label: 'ChatGPT', url: 'https://chatgpt.com', emoji: '✿' },
  { label: 'Gemini', url: 'https://gemini.google.com', emoji: '✧' },
];

function LLMChip({ label, url, emoji }: { label: string; url: string; emoji: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [styles.llmChip, { opacity: pressed ? 0.82 : 1 }]}
      accessibilityRole="link"
      accessibilityLabel={`Open ${label}`}
    >
      <Text style={styles.llmEmoji}>{emoji}</Text>
      <Text style={styles.llmLabel}>{label}</Text>
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
  const toggle = (i: number) => {
    const next = accounts.map((a, j) => (j === i ? { ...a, include: !a.include } : a));
    onChange(next);
  };

  if (accounts.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {accounts.map((acc, i) => {
        const isAsset = acc.kind === 'asset';
        const dot = isAsset ? colors.accent : colors.amber;
        return (
          <Pressable
            key={i}
            onPress={() => toggle(i)}
            style={[
              styles.accRow,
              !acc.include && { opacity: 0.45 },
            ]}
          >
            {/* Tick box */}
            <View
              style={[
                styles.tick,
                acc.include && { backgroundColor: colors.accent, borderColor: colors.accent },
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
                <Text style={styles.accName} numberOfLines={1}>{acc.name}</Text>
              </View>
              <Text style={styles.accMeta}>
                {acc.clsLabel}
                {acc.notes ? `  ·  ${acc.notes}` : ''}
                {'  ·  '}{acc.asOf}
              </Text>
            </View>

            {/* Balance */}
            <Text style={[styles.accBalance, { color: isAsset ? colors.accent : colors.amber }]}>
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
  const { commitCategorized, refreshAll } = useAppData();

  const [phase, setPhase] = useState<Phase>('guide');
  const [jsonText, setJsonText] = useState('');
  const [parsedTxns, setParsedTxns] = useState<ExtractedTxn[]>([]);
  const [parsedAccounts, setParsedAccounts] = useState<ParsedAccount[]>([]);
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
      for (const acc of toSave) {
        await addAccount(acc.name, acc.kind, acc.cls, acc.balance, acc.asOf);
        savedAcc++;
      }

      // 2. Commit transactions via the store.
      const { created } = await commitCategorized(txns, assignments, 'imported');
      setTxnCount(created.length);
      setTxnSkipped(assignments.filter((a) => a === DROP).length);
      setAccCount(savedAcc);

      // Refresh so Net Worth screen picks up new accounts.
      if (savedAcc > 0) await refreshAll();

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
        <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    return (
      <ImportReviewScreen
        items={parsedTxns}
        onCancel={() => setPhase('accountReview')}
        onConfirm={commitAll}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
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
                <Text style={styles.doneText}>
                  Transaction categories were filled in from what Pip has learned — tweak them in your transactions list.
                </Text>
              )}
              {accCount > 0 && (
                <Text style={styles.doneText}>
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
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.busyText}>Saving your data…</Text>
          </Card>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <>
            <Card style={[styles.errorCard, { marginTop: 18 }]}>
              <View style={styles.errorRow}>
                <Icon name="alert" size={16} color={colors.red} />
                <Text style={styles.errorText}>{error}</Text>
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
                <View style={[styles.kindDot, { backgroundColor: colors.accent }]} />
                <Text style={styles.legendText}>Asset</Text>
                <View style={[styles.kindDot, { backgroundColor: colors.amber, marginLeft: 12 }]} />
                <Text style={styles.legendText}>Liability (outstanding balance)</Text>
              </View>

              <Card style={{ padding: 14, marginTop: 10 }}>
                <AccountReviewList
                  accounts={parsedAccounts}
                  onChange={setParsedAccounts}
                />
              </Card>
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
                <Text style={styles.backLinkText}>← Back to paste</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── GUIDE + PASTING ── */}
        {(phase === 'guide' || phase === 'pasting') && (
          <>
            {/* Step 1 */}
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}><Text style={styles.stepNum}>1</Text></View>
              <Text style={styles.stepTitle}>Copy Prompt</Text>
            </View>

            <Card style={{ padding: 18, gap: 14 }}>
              <Pressable
                onPress={copyPrompt}
                style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.88 }]}
                accessibilityRole="button"
                accessibilityLabel="Copy prompt to clipboard"
              >
                <Icon name="receipt" size={18} color={colors.accent} />
                <Text style={styles.copyBtnText}>
                  {copied ? '✓  Prompt copied!' : 'Copy Prompt'}
                </Text>
              </Pressable>

              <Text style={styles.copyHint}>
                Paste the prompt and attach your file(s) — statements, spreadsheets, or any financial export. Multiple files are fine.
              </Text>

              <View>
                <Text style={styles.openInLabel}>Open in</Text>
                <View style={styles.llmRow}>
                  {LLM_LINKS.map((l) => <LLMChip key={l.label} {...l} />)}
                </View>
              </View>

              <View style={styles.tipRow}>
                <Icon name="sparkles" size={13} color={colors.amber} />
                <Text style={styles.tipText}>
                  For large or multi-page files, enable <B>thinking / reasoning mode</B> for best results.
                </Text>
              </View>

              {/* What gets imported summary */}
              <View style={styles.coversBox}>
                <Text style={styles.coversTitle}>The prompt covers:</Text>
                {[
                  'Transactions (expenses, income)',
                  'Cash & savings account balances',
                  'Investments (stocks, crypto, unit trusts)',
                  'Liabilities (loans, credit cards, BNPL)',
                ].map((line) => (
                  <View key={line} style={styles.coversRow}>
                    <Text style={styles.coversDot}>✓</Text>
                    <Text style={styles.coversText}>{line}</Text>
                  </View>
                ))}
              </View>

              {/* Prompt preview */}
              <View>
                <Eyebrow style={{ marginBottom: 8 }}>Prompt preview</Eyebrow>
                <View style={styles.promptBox}>
                  <TextInput
                    multiline
                    editable={false}
                    selectTextOnFocus
                    value={prompt}
                    style={styles.promptText}
                    scrollEnabled={false}
                    accessibilityLabel="Prompt text, selectable"
                  />
                </View>
                <Text style={styles.promptNote}>
                  Long-press to select all and copy if the button above doesn't work.
                </Text>
              </View>
            </Card>

            {/* Arrow */}
            <View style={styles.arrowRow}>
              <View style={styles.arrowLine} />
              <Text style={styles.arrowIcon}>↓</Text>
              <View style={styles.arrowLine} />
            </View>

            {/* Step 2 */}
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}><Text style={styles.stepNum}>2</Text></View>
              <Text style={styles.stepTitle}>Import Result</Text>
            </View>

            <Card style={{ padding: 18, gap: 14 }}>
              <Text style={styles.copyHint}>
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
                placeholderTextColor={colors.ink3}
                style={styles.jsonInput}
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
  root: { flex: 1, backgroundColor: colors.bg },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 10 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: uiFont(800), fontSize: 13, color: '#fff' },
  stepTitle: { fontFamily: uiFont(700), fontSize: 16, color: colors.ink },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: radius.sm,
    backgroundColor: colors.accentTint, borderWidth: 1.5, borderColor: colors.accentSoft,
  },
  copyBtnText: { fontFamily: uiFont(700), fontSize: 15, color: colors.accent },

  copyHint: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, lineHeight: 19, textAlign: 'center' },

  openInLabel: { fontFamily: uiFont(600), fontSize: 12, color: colors.ink3, textAlign: 'center', marginBottom: 8 },
  llmRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  llmChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  llmEmoji: { fontSize: 15 },
  llmLabel: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink },

  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: `${colors.amber}12`, borderRadius: radius.sm, padding: 11 },
  tipText: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, flex: 1, lineHeight: 18 },

  coversBox: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: 12, gap: 6 },
  coversTitle: { fontFamily: uiFont(700), fontSize: 12, color: colors.ink2, marginBottom: 4 },
  coversRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  coversDot: { fontFamily: uiFont(700), fontSize: 12, color: colors.accent, width: 14 },
  coversText: { fontFamily: uiFont(500), fontSize: 12.5, color: colors.ink2, flex: 1 },

  promptBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 12, maxHeight: 180, overflow: 'hidden' },
  promptText: { fontFamily: uiFont(400), fontSize: 11, color: colors.ink2, lineHeight: 16 },
  promptNote: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 6, textAlign: 'center' },

  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, paddingHorizontal: 24 },
  arrowLine: { flex: 1, height: 1, backgroundColor: colors.line },
  arrowIcon: { fontFamily: uiFont(400), fontSize: 18, color: colors.ink3 },

  jsonInput: {
    backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.line,
    borderRadius: radius.sm, padding: 12, height: 160,
    fontFamily: uiFont(400), fontSize: 12, color: colors.ink, lineHeight: 18,
  },

  // Account review
  accRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  tick: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  kindDot: { width: 7, height: 7, borderRadius: 4 },
  accName: { fontFamily: uiFont(700), fontSize: 13.5, color: colors.ink, flex: 1 },
  accMeta: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink3, marginTop: 1 },
  accBalance: { fontFamily: uiFont(700), fontSize: 13, flexShrink: 0 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: uiFont(500), fontSize: 12, color: colors.ink2 },

  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink3 },

  // Done / saving / error
  busyCard: { padding: 22, alignItems: 'center', gap: 12 },
  busyText: { fontFamily: uiFont(500), fontSize: 13, color: colors.ink2, textAlign: 'center' },
  doneText: { fontFamily: uiFont(500), fontSize: 13.5, lineHeight: 20, color: colors.ink2 },
  errorCard: { borderWidth: 1.5, borderColor: `${colors.red}44`, backgroundColor: `${colors.red}08`, borderRadius: radius.md, padding: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.red, flex: 1, lineHeight: 19 },
});
