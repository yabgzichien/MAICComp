// src/lib/advancedImport.ts
// Pure, deterministic helpers for advanced prompt-based LLM import.
// No UI / database / file-system imports — everything here is unit-tested.

import { ACCOUNT_CLASSES } from './networth';
import { todayISO } from './duplicates';
import type { ExtractedTxn } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildPrompt(): string {
  return `Parse every transaction AND every account balance from the uploaded file(s) into JSON. Files may be bank statements, e-wallet exports, investment reports, loan statements, Google Sheets, Excel, CSV, or any financial record.

──────────────────────────────────────
SECTION 1 — TRANSACTIONS
──────────────────────────────────────
For each transaction row found, output:
- date: YYYY-MM-DD
- description: merchant / payee name if available (clean name, remove codes, reference numbers, trailing digits), OR null if no merchant name is present (e.g. exports from personal finance apps / trackers that only record categories).
- amount: NEGATIVE for expenses / debits, POSITIVE for income / credits
- category: describe the category freely based on what you actually see in the document.
    • If the document / tracker already labels a category, ALWAYS preserve and use that label.
    • Use plain English (e.g. "restaurant", "groceries", "petrol", "salary", "online shopping", "electricity bill").
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
- If importing from an existing financial tracker or spreadsheet where transactions have categories but no merchant / payee, leave description as null and capture the category label accurately.
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
  quantity?: unknown;
  cost?: unknown;
}

interface LLMTransfer {
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  account?: unknown;
}

interface LLMOccurrence {
  dueDate?: unknown;
  status?: unknown;
  paidOn?: unknown;
  paidAmount?: unknown;
}

interface LLMCommitment {
  label?: unknown;
  kind?: unknown;
  amount?: unknown;
  dueDay?: unknown;
  category?: unknown;
  fromAccount?: unknown;
  toAccount?: unknown;
  startMonth?: unknown;
  endMonth?: unknown;
  occurrences?: LLMOccurrence[];
}

interface LLMOutput {
  version?: unknown;
  transactions?: LLMTxn[];
  transfers?: LLMTransfer[];
  accounts?: LLMAccount[];
  commitments?: LLMCommitment[];
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
  /** Cost basis / units, present only on a version-2 export. Cosmetic until the account also
   *  carries a live-priced symbol (added separately, in Net Worth) — see isHolding() in
   *  lib/prices.ts, which requires both. */
  quantity: number | null;
  cost: number | null;
}

/** A DCA/transfer contribution: neither income nor an expense (see TxnType in lib/types.ts),
 *  so it is kept out of the `transactions` array entirely rather than encoded by sign. */
export interface ParsedTransfer {
  date: string | null;
  description: string;
  amount: number; // always positive
  account: string | null;
}

export interface ParsedCommitmentOccurrence {
  dueDate: string;
  status: 'scheduled' | 'paid' | 'late' | 'skipped';
  paidOn: string | null;
  paidAmount: number | null;
}

// A recurring commitment ready to commit to the DB, account/category names unresolved (the
// store resolves them against the live categories/accounts list at import time).
export interface ParsedCommitment {
  label: string;
  kind: 'expense' | 'investment';
  amount: number;
  dueDay: number;
  category: string | null;
  fromAccount: string | null;
  toAccount: string | null;
  startMonth: string;
  endMonth: string | null;
  occurrences: ParsedCommitmentOccurrence[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE → cls mapping
// ─────────────────────────────────────────────────────────────────────────────

export const TYPE_TO_CLS: Record<string, string> = {
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

export function resolveClsId(rawType: string): string {
  const key = rawType.toLowerCase().trim();
  return TYPE_TO_CLS[key] ?? 'cash'; // default to cash if unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON parser
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseResult {
  transactions: ExtractedTxn[];
  accounts: ParsedAccount[];
  transfers: ParsedTransfer[];
  commitments: ParsedCommitment[];
}

const OCCURRENCE_STATUSES = new Set(['scheduled', 'paid', 'late', 'skipped']);
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function parseJSON(raw: string): ParseResult {
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
      typeof r.description === 'string' && r.description.trim()
        ? r.description.trim()
        : '';
    const rawDate = typeof r.date === 'string' ? r.date.trim() : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    const categoryHint =
      typeof r.category === 'string' && r.category.trim() && r.category.trim() !== '?'
        ? r.category.trim()
        : null;
    const account =
      typeof r.account === 'string' && r.account.trim() && r.account.trim().toLowerCase() !== 'unknown'
        ? r.account.trim()
        : null;
    return { merchant, amount: absAmt, type, date, method: null, categoryHint, account };
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
    const quantity = typeof r.quantity === 'number' && Number.isFinite(r.quantity) ? r.quantity : null;
    const cost = typeof r.cost === 'number' && Number.isFinite(r.cost) ? r.cost : null;
    return {
      name,
      cls: clsId,
      clsLabel: meta.label,
      kind: meta.kind,
      balance,
      asOf,
      notes,
      include: true,
      quantity,
      cost,
    };
  });

  // ── Transfers (version 2) ──
  const transferRows = Array.isArray(obj.transfers) ? obj.transfers : [];
  const transfers: ParsedTransfer[] = transferRows.map((r): ParsedTransfer => {
    const amount = Math.abs(typeof r.amount === 'number' ? r.amount : Number(r.amount ?? 0));
    const description =
      typeof r.description === 'string' && r.description.trim() ? r.description.trim() : '';
    const rawDate = typeof r.date === 'string' ? r.date.trim() : '';
    const date = ISO_DATE_ONLY.test(rawDate) ? rawDate : null;
    const account =
      typeof r.account === 'string' && r.account.trim() && r.account.trim().toLowerCase() !== 'unknown'
        ? r.account.trim()
        : null;
    return { date, description, amount, account };
  });

  // ── Commitments (version 2) ──
  const commitmentRows = Array.isArray(obj.commitments) ? obj.commitments : [];
  const commitments: ParsedCommitment[] = commitmentRows
    .map((r): ParsedCommitment | null => {
      const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : '';
      if (!label) return null;
      const kind = r.kind === 'investment' ? 'investment' : 'expense';
      const amount = Math.abs(typeof r.amount === 'number' ? r.amount : Number(r.amount ?? 0));
      const rawDay = typeof r.dueDay === 'number' ? r.dueDay : Number(r.dueDay ?? NaN);
      const dueDay = Number.isFinite(rawDay) ? Math.min(31, Math.max(1, Math.round(rawDay))) : 1;
      const category = typeof r.category === 'string' && r.category.trim() ? r.category.trim() : null;
      const fromAccount = typeof r.fromAccount === 'string' && r.fromAccount.trim() ? r.fromAccount.trim() : null;
      const toAccount = typeof r.toAccount === 'string' && r.toAccount.trim() ? r.toAccount.trim() : null;
      const rawStart = typeof r.startMonth === 'string' ? r.startMonth.trim() : '';
      const startMonth = MONTH_KEY_RE.test(rawStart) ? rawStart : todayISO().slice(0, 7);
      const rawEnd = typeof r.endMonth === 'string' ? r.endMonth.trim() : '';
      const endMonth = MONTH_KEY_RE.test(rawEnd) ? rawEnd : null;
      const occRows = Array.isArray(r.occurrences) ? r.occurrences : [];
      const occurrences: ParsedCommitmentOccurrence[] = occRows
        .map((o): ParsedCommitmentOccurrence | null => {
          const rawDue = typeof o.dueDate === 'string' ? o.dueDate.trim() : '';
          if (!ISO_DATE_ONLY.test(rawDue)) return null;
          const status = typeof o.status === 'string' && OCCURRENCE_STATUSES.has(o.status) ? (o.status as ParsedCommitmentOccurrence['status']) : 'scheduled';
          const rawPaidOn = typeof o.paidOn === 'string' ? o.paidOn.trim() : '';
          const paidOn = ISO_DATE_ONLY.test(rawPaidOn) ? rawPaidOn : null;
          const paidAmount = typeof o.paidAmount === 'number' && Number.isFinite(o.paidAmount) ? o.paidAmount : null;
          return { dueDate: rawDue, status, paidOn, paidAmount };
        })
        .filter((o): o is ParsedCommitmentOccurrence => o !== null);
      return { label, kind, amount, dueDay, category, fromAccount, toAccount, startMonth, endMonth, occurrences };
    })
    .filter((c): c is ParsedCommitment => c !== null);

  return { transactions, accounts, transfers, commitments };
}
