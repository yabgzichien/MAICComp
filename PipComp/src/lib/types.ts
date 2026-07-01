/* Shared domain types. */

export type Direction = 'in' | 'out';
export type TxnType = 'expense' | 'income';

/** Where a transaction's data came from (drives data-confidence weighting). */
export type TxnSource = 'extracted' | 'imported' | 'manual' | 'verified';

/** A line item as extracted from a screenshot, before it is saved. */
export interface ExtractedTxn {
  merchant: string;
  amount: number; // always positive; sign is implied by `type`
  type: TxnType;
  date: string | null; // ISO date (YYYY-MM-DD) or null
  method: string | null; // optional sub-label, e.g. "DuitNow QR"
  categoryHint?: string | null; // a category label the source document carried, if any
}

/** A category. `id` is a stable slug (also used as the memory value). `kind`
 * separates expense categories from income (money-received) categories. */
export interface Category {
  id: string;
  label: string;
  icon: string;
  hue: number;
  kind: TxnType;
  isDefault: boolean;
}

/** A persisted transaction. */
export interface Transaction {
  id: string;
  merchantRaw: string;
  merchantKey: string;
  amount: number;
  currency: string;
  type: TxnType;
  date: string | null;
  categoryId: string | null;
  createdAt: string;
  source: TxnSource;
}

/** merchantKey -> categoryId, the learned memory. */
export type MemoryMap = Record<string, string>;

/** A category suggestion pre-filled in the Categorize flow, tagged with where
 * it came from: a real learned-memory match, or a first-time AI guess. */
export interface CategorySuggestion {
  categoryId: string;
  source: 'learned' | 'guess';
}

/** Net-worth tracking: an asset (cash, investments) or a liability (loans). */
export type AccountKind = 'asset' | 'liability';

/** A named asset or liability account. `cls` is a fixed class slug (see ACCOUNT_CLASSES). */
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  cls: string;
  archived: boolean;
  createdAt: string;
  // Live-priced investment holdings (null for plain manual-value accounts):
  sub: string | null; // 'crypto' | 'stock' | 'commodity'
  symbol: string | null; // Yahoo Finance symbol, e.g. 'BTC-USD', 'AAPL', '1155.KL'
  ticker: string | null; // display ticker, e.g. 'BTC'
  quantity: number | null; // units held
  cost: number | null; // total invested amount in MYR (cost basis), for profit
}

/** A cached market price in MYR for a holding symbol. */
export interface PriceQuote {
  symbol: string;
  priceMYR: number;
  change24: number | null; // 24h % change, if available
  asOf: string; // ISO datetime of the quote
}

/** A dated value reading for an account. The latest reading is the current value. */
export interface BalanceEntry {
  id: string;
  accountId: string;
  value: number; // for liabilities, the outstanding amount (positive)
  asOf: string; // YYYY-MM-DD
  createdAt: string;
}

/**
 * Sentinel assignment meaning "the user chose not to record this item".
 * Used in the categorize step; commitCategorized skips these.
 */
export const DROP = '__drop__';
