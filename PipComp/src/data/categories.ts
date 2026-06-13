import type { Category } from '../lib/types';

type SeedCategory = Omit<Category, 'isDefault'>;

/**
 * Default EXPENSE categories, ported from the approved Pip design (data.jsx).
 */
export const EXPENSE_CATEGORIES: SeedCategory[] = [
  { id: 'fuel', label: 'Fuel', icon: 'fuel', hue: 42, kind: 'expense' },
  { id: 'groceries', label: 'Groceries', icon: 'cart', hue: 162, kind: 'expense' },
  { id: 'dining', label: 'Dining', icon: 'utensils', hue: 25, kind: 'expense' },
  { id: 'coffee', label: 'Coffee', icon: 'coffee', hue: 70, kind: 'expense' },
  { id: 'transport', label: 'Transport', icon: 'car', hue: 248, kind: 'expense' },
  { id: 'shopping', label: 'Shopping', icon: 'bag', hue: 330, kind: 'expense' },
  { id: 'health', label: 'Health', icon: 'heart', hue: 12, kind: 'expense' },
  { id: 'bills', label: 'Bills', icon: 'receipt', hue: 286, kind: 'expense' },
  { id: 'fun', label: 'Fun', icon: 'play', hue: 305, kind: 'expense' },
  { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense' },
];

/**
 * Default INCOME (money-received) categories.
 */
export const INCOME_CATEGORIES: SeedCategory[] = [
  { id: 'income', label: 'Income', icon: 'wallet', hue: 152, kind: 'income' },
  { id: 'allowance', label: 'Allowance', icon: 'gift', hue: 120, kind: 'income' },
  { id: 'bonus', label: 'Bonus', icon: 'sparkles', hue: 95, kind: 'income' },
  { id: 'borrowers-return', label: "Borrower's Return", icon: 'return', hue: 200, kind: 'income' },
  { id: 'dividend', label: 'Dividend', icon: 'trending', hue: 250, kind: 'income' },
  { id: 'interest', label: 'Interest', icon: 'percent', hue: 285, kind: 'income' },
];

/** id of the generic income category used as a fallback for income rows. */
export const DEFAULT_INCOME_ID = 'income';
/** id of the generic expense category used as a fallback. */
export const DEFAULT_EXPENSE_ID = 'other';

export const ALL_SEED_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

/** ids that are income categories, used by the DB migration. */
export const INCOME_SEED_IDS = INCOME_CATEGORIES.map((c) => c.id);
