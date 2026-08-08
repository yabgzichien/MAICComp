import type { Category } from '../lib/types';

type SeedCategory = Omit<Category, 'isDefault'>;

/**
 * Default EXPENSE categories (bookkeeping retune, 2026-08-07).
 *
 * One category per COICOP 2018 division  the UN Statistics Division classification
 * of household expenditure by *purpose*, which is also what DOSM's Household
 * Expenditure Survey is coded on. Labels stay plain-language for the borrower; the
 * COICOP division is recorded here so the essentials split and the lender-facing
 * spending profile stay comparable against published Malaysian household benchmarks.
 *
 * The one non-COICOP line is `debt-service`. Loan repayment is not consumption  in
 * bookkeeping terms it is a finance cost plus a principal movement  and it is kept
 * separate so debt service is readable straight off the ledger instead of hiding
 * inside a payment-method bucket the way the old `bills` category did.
 */
export const EXPENSE_CATEGORIES: SeedCategory[] = [
  // COICOP 04  housing, water, electricity, gas and other fuels
  { id: 'housing', label: 'Housing & Utilities', icon: 'home', hue: 200, kind: 'expense' },
  // COICOP 01  food and non-alcoholic beverages
  { id: 'food', label: 'Food & Groceries', icon: 'cart', hue: 162, kind: 'expense' },
  // COICOP 11  restaurants and hotels
  { id: 'dining', label: 'Dining & Beverages', icon: 'utensils', hue: 25, kind: 'expense' },
  // COICOP 07  transport (includes fuel for personal vehicles)
  { id: 'transport', label: 'Transport & Fuel', icon: 'car', hue: 248, kind: 'expense' },
  // COICOP 08  communication
  { id: 'communications', label: 'Communications', icon: 'signal', hue: 190, kind: 'expense' },
  // COICOP 06  health
  { id: 'healthcare', label: 'Healthcare', icon: 'heart', hue: 12, kind: 'expense' },
  // COICOP 10  education
  { id: 'education', label: 'Education', icon: 'book', hue: 265, kind: 'expense' },
  // COICOP 03 + 05 + 13  clothing, furnishings, personal care
  { id: 'household', label: 'Household & Personal', icon: 'bag', hue: 330, kind: 'expense' },
  // COICOP 09  recreation and culture
  { id: 'recreation', label: 'Recreation & Culture', icon: 'play', hue: 305, kind: 'expense' },
  // COICOP 12.5 + bank charges, takaful, zakat
  { id: 'insurance', label: 'Insurance & Fees', icon: 'shield', hue: 286, kind: 'expense' },
  // Not COICOP: finance costs and principal repayment (drives DSR, not consumption)
  { id: 'debt-service', label: 'Loan Repayment', icon: 'receipt', hue: 355, kind: 'expense' },
  // COICOP 12 residual
  { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense' },
];

/**
 * Default INCOME (money-received) categories, split by SOURCE the way a P&L is
 * rather than by the old single generic bucket  the three demo personas are a
 * gig worker, a micro-business seller and a small trader, and a lender reads
 * those three revenue lines very differently.
 */
export const INCOME_CATEGORIES: SeedCategory[] = [
  { id: 'employment-income', label: 'Employment Income', icon: 'wallet', hue: 152, kind: 'income' },
  { id: 'business-income', label: 'Business & Trade Revenue', icon: 'store', hue: 172, kind: 'income' },
  { id: 'gig-income', label: 'Gig & Commission Income', icon: 'car', hue: 132, kind: 'income' },
  { id: 'transfers-in', label: 'Transfers Received', icon: 'gift', hue: 120, kind: 'income' },
  { id: 'investment-income', label: 'Investment Income', icon: 'trending', hue: 250, kind: 'income' },
  { id: 'other-income', label: 'Other Income', icon: 'dots', hue: 200, kind: 'income' },
];

/** id of the generic income category used as a fallback for income rows. */
export const DEFAULT_INCOME_ID = 'other-income';
/** id of the generic expense category used as a fallback. */
export const DEFAULT_EXPENSE_ID = 'other';

export const ALL_SEED_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

/** ids that are income categories, used by the DB migration. */
export const INCOME_SEED_IDS = INCOME_CATEGORIES.map((c) => c.id);

/**
 * Old default category id -> new default id, applied once by the DB migration in
 * db.ts so existing ledgers, learned merchant memory and budget allocations follow
 * the retune instead of dangling at ids that no longer exist.
 *
 * Two of these are lossy on purpose and cannot be undone by a later migration:
 *  - `bills` fanned out into housing / communications / insurance / debt-service.
 *    There is no way to tell a TNB bill from a phone bill from a loan installment
 *    after the fact, so every old `bills` row lands on `housing` (the largest of
 *    the four in DOSM HES) and the borrower re-files the rest by hand.
 *  - `borrowers-return` was never income in bookkeeping terms  it is recovery of
 *    a receivable  so it lands on `other-income` rather than an earnings line.
 */
export const CATEGORY_ID_REMAP: Record<string, string> = {
  // expense
  fuel: 'transport',
  groceries: 'food',
  coffee: 'dining',
  shopping: 'household',
  health: 'healthcare',
  fun: 'recreation',
  bills: 'housing',
  // income
  income: 'employment-income',
  bonus: 'employment-income',
  allowance: 'transfers-in',
  dividend: 'investment-income',
  interest: 'investment-income',
  'borrowers-return': 'other-income',
};
