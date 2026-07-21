// src/lib/import.ts
// Pure, deterministic helpers for importing transactions from a document.
// No UI / database / file-system imports  everything here is unit-tested.
import { DEFAULT_EXPENSE_ID, DEFAULT_INCOME_ID } from '../data/categories';
import { findDuplicate } from './duplicates';
import { suggestForMerchant } from './recommend';
import { DROP, type Category, type ExtractedTxn, type MemoryMap, type Transaction, type TxnType } from './types';

export type DocKind = 'binary' | 'csv' | 'xlsx' | 'docx' | 'unsupported';

function ext(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/**
 * How a picked file should be read: `binary` (PDF/image → sent straight to the
 * vision model), `csv`/`xlsx`/`docx` (read to text on-device), or `unsupported`.
 * Falls back to the filename extension when the mime type is generic.
 */
export function docKindFromMime(mime: string, name: string): DocKind {
  const m = (mime || '').toLowerCase();
  const e = ext(name);
  if (m === 'application/pdf' || e === 'pdf') return 'binary';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(e)) return 'binary';
  if (m === 'text/csv' || e === 'csv') return 'csv';
  if (m.includes('spreadsheetml') || m === 'application/vnd.ms-excel' || e === 'xlsx' || e === 'xls') return 'xlsx';
  if (m.includes('wordprocessingml') || e === 'docx') return 'docx';
  return 'unsupported';
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

/** Flatten a DOCX `word/document.xml` body into plain text (one line per paragraph). */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, (m) => ENTITIES[m] ?? m)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Keyword synonyms for each category id. Used to fuzzy-match free-form
 * LLM descriptions back to app categories. Checked as whole-word substrings
 * (case-insensitive) against the hint string.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // expense
  fuel:      ['fuel', 'petrol', 'gas', 'diesel', 'petronas', 'shell', 'caltex', 'bhp'],
  groceries: ['groceries', 'grocery', 'supermarket', 'hypermarket', 'market', 'aeon', 'tesco', 'mydin', 'jaya', 'lotus', 'cold storage'],
  dining:    ['dining', 'restaurant', 'food', 'meal', 'lunch', 'dinner', 'breakfast', 'mamak', 'hawker', 'bistro', 'eatery', 'cafe', 'pizza', 'burger', 'mcd', 'kfc', 'domino', 'subway'],
  coffee:    ['coffee', 'café', 'cafe', 'teh', 'kopitiam', 'starbucks', 'zus', 'oldtown', 'brew', 'boba', 'bubble tea', 'milk tea'],
  transport: ['transport', 'grab', 'uber', 'lyft', 'taxi', 'bus', 'train', 'lrt', 'mrt', 'ktm', 'toll', 'parking', 'transit', 'ride', 'commute'],
  shopping:  ['shopping', 'shop', 'retail', 'store', 'fashion', 'clothing', 'apparel', 'lazada', 'shopee', 'amazon', 'zalora', 'ikea', 'h&m', 'uniqlo'],
  health:    ['health', 'medical', 'hospital', 'clinic', 'pharmacy', 'doctor', 'dentist', 'medicine', 'guardian', 'watson', 'lab', 'optical'],
  bills:     ['bills', 'bill', 'utility', 'utilities', 'electricity', 'water', 'internet', 'phone', 'telco', 'subscription', 'insurance', 'rent', 'maintenance', 'indah water', 'unifi', 'maxis', 'celcom', 'digi', 'tnb', 'syabas'],
  fun:       ['fun', 'entertainment', 'movie', 'cinema', 'game', 'gaming', 'sport', 'gym', 'fitness', 'concert', 'event', 'recreation', 'hobby', 'netflix', 'spotify'],
  other:     ['other', 'miscellaneous', 'misc', 'unknown'],
  // income
  income:    ['income', 'salary', 'wage', 'payroll', 'gaji', 'pay', 'employment', 'remuneration'],
  allowance: ['allowance', 'elaun', 'stipend', 'subsidy', 'subsistence', 'travel allowance'],
  bonus:     ['bonus', 'incentive', 'reward', 'commission', 'performance'],
  'borrowers-return': ['return', 'repayment', 'loan repayment', 'debt repayment', 'collect debt', 'borrow'],
  dividend:  ['dividend', 'dividen', 'div'],
  interest:  ['interest', 'faedah', 'yield', 'coupon', 'profit distribution', 'hibah'],
};

/** Map a free-form LLM category description to an app category id of matching kind.
 *  Tries exact label match first, then keyword scan, then returns null. */
export function matchSourceCategory(
  hint: string | null | undefined,
  categories: Category[],
  type: TxnType
): string | null {
  if (!hint) return null;
  const needle = hint.trim().toLowerCase();
  if (!needle) return null;

  // 1. Exact label match (fast path, original behaviour).
  const exact = categories.find((c) => c.kind === type && c.label.trim().toLowerCase() === needle);
  if (exact) return exact.id;

  // 2. Fuzzy keyword scan: check if any keyword appears in the hint as a substring.
  const sameKind = categories.filter((c) => c.kind === type);
  for (const cat of sameKind) {
    const kws = CATEGORY_KEYWORDS[cat.id] ?? [];
    if (kws.some((kw) => needle.includes(kw))) return cat.id;
  }

  return null;
}

/**
 * Choose a category for each imported row: learned memory first (only when its
 * kind matches the row), then the source-document category hint, then the
 * generic fallback for the row's kind.
 */
export function assignImported(
  items: ExtractedTxn[],
  memory: MemoryMap,
  categories: Category[],
  catById: Record<string, Category>
): string[] {
  return items.map((it) => {
    const learned = suggestForMerchant(memory, it.merchant);
    if (learned && catById[learned] && catById[learned].kind === it.type) return learned;

    const hinted = matchSourceCategory(it.categoryHint, categories, it.type);
    if (hinted) return hinted;

    return it.type === 'income' ? DEFAULT_INCOME_ID : DEFAULT_EXPENSE_ID;
  });
}

/**
 * Mark rows that exactly match an already-saved transaction as DROP so the
 * commit step skips them. Returns the adjusted assignments and how many were
 * skipped.
 */
export function applyDedup(
  items: ExtractedTxn[],
  assignments: (string | null)[],
  existing: Transaction[],
  today: string
): { assignments: (string | null)[]; skipped: number } {
  let skipped = 0;
  const out = assignments.map((a, i) => {
    const it = items[i];
    const dup = findDuplicate(existing, { merchant: it.merchant, amount: it.amount, date: it.date }, today);
    if (dup) {
      skipped++;
      return DROP;
    }
    return a;
  });
  return { assignments: out, skipped };
}
