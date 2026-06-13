import { addTransactions, type NewTxn } from '../db/txnRepo';
import { addAccount } from '../db/accountsRepo';
import { merchantKey } from '../lib/normalize';
import { DEFAULT_EXPENSE_ID, DEFAULT_INCOME_ID } from './categories';

function monthDate(monthsAgo: number, day: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Seed ~6 months of a realistic credit-invisible gig-worker history (gig income + e-wallet spend). */
export async function loadDemoProfile(): Promise<void> {
  // Realistic gig-worker spend: rent + groceries + utilities + e-wallet top-ups.
  // Tuned so the profile lands ≈ Good (matching the sample passport, not near-Excellent)
  // and clears the plausibility check (expenses are a believable share of income).
  const expenses: [string, number][] = [
    ['Rumah Sewa', 780],
    ['Pasar Mini Aziz', 680],
    ['Shopee', 240],
    ['Touch n Go Reload', 180],
    ['Grab', 160],
    ['TNB Bill', 150],
  ];
  const txns: NewTxn[] = [];
  for (let m = 5; m >= 0; m--) {
    const income = 2400 + ((m * 137) % 300); // slight month-to-month variation
    txns.push({
      merchantRaw: 'GrabFood Payout',
      merchantKey: merchantKey('GrabFood Payout'),
      amount: income + 0.5,
      type: 'income',
      date: monthDate(m, 2),
      categoryId: DEFAULT_INCOME_ID,
      source: 'extracted',
    });
    expenses.forEach(([name, base], i) => {
      txns.push({
        merchantRaw: name,
        merchantKey: merchantKey(name),
        amount: base + ((m + i) % 5) * 7 + 0.5, // non-round, varied
        type: 'expense',
        date: monthDate(m, 5 + i * 4),
        categoryId: DEFAULT_EXPENSE_ID,
        source: 'extracted',
      });
    });
  }
  await addTransactions(txns);
  // A small Pay-Later liability — an alternative-data debt signal.
  await addAccount('SPayLater', 'liability', 'pay_later', 320, monthDate(0, 1));
}
