import { addTransactions, type NewTxn } from '../db/txnRepo';
import { addAccount } from '../db/accountsRepo';
import { merchantKey } from '../lib/normalize';
import { DEFAULT_EXPENSE_ID, DEFAULT_INCOME_ID } from './categories';

const MONTHS = 6;

/** A date `monthsAgo` months back on `day` (clamped to the month's length), at local noon. */
function monthDate(monthsAgo: number, day: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Seed a realistic **credit-invisible** gig-worker history for the demo.
 *
 * Deliberately tuned so the Passport Builder Coach tells the inclusion story:
 *  - ~RM2,500/mo gig income vs ~RM1,900/mo spend → a healthy surplus (a real, bankable saver);
 *  - spending recorded on only a handful of distinct days/month → **thin coverage (~20 of 90
 *    days)**, so the borrower starts **gated to the RM500 Emergency tier** despite the healthy
 *    cash-flow — the "un-assessable" starting point.
 *  - a motorbike hire-purchase liability — a genuine debt signal.
 *
 * Result: the coach's headline lever is live — extending recorded history to 30 days flips the
 * offer from Emergency REFER to an **approved Starter loan (~RM3.8k)** — the "make the un-assessable
 * assessable" beat, made interactive. Building an on-time repayment record lifts the score too.
 */
export async function loadDemoProfile(): Promise<void> {
  const now = new Date();

  // [merchant, base amount, day-of-month] — concentrated on ~5 distinct days → thin coverage.
  const basket: [string, number, number][] = [
    ['Rumah Sewa', 780, 3],
    ['Pasar Mini Aziz', 380, 3],
    ['TNB + Air Selangor', 250, 10],
    ['Shopee', 160, 17],
    ['Grab + Touch n Go', 175, 24],
    ['Foodpanda + Runcit', 120, 28],
  ];

  const txns: NewTxn[] = [];
  for (let m = MONTHS - 1; m >= 0; m--) {
    const incDate = monthDate(m, 1);
    if (incDate <= now) {
      txns.push({
        merchantRaw: 'GrabFood Payout',
        merchantKey: merchantKey('GrabFood Payout'),
        amount: 2500 + ((m * 83) % 170) + 0.5, // slight month-to-month variation
        type: 'income',
        date: iso(incDate),
        categoryId: DEFAULT_INCOME_ID,
        source: 'extracted',
      });
    }
    // Older months (outside the recent 90-day window) are deliberately sparser, so the borrower's
    // recorded history *ramps up* — an honest rising Credit Momentum, while current coverage stays thin.
    const monthBasket = m >= 3 ? basket.slice(0, 3) : basket;
    monthBasket.forEach(([name, base, day], i) => {
      const d = monthDate(m, day);
      if (d > now) return; // never future-date — keeps the coverage signal honest
      txns.push({
        merchantRaw: name,
        merchantKey: merchantKey(name),
        amount: base + ((m + i) % 5) * 3 + 0.5, // non-round, varied
        type: 'expense',
        date: iso(d),
        categoryId: DEFAULT_EXPENSE_ID,
        source: 'extracted',
      });
    });
  }
  await addTransactions(txns);

  // A motorbike hire-purchase — a real debt signal a credit-invisible worker would carry.
  await addAccount('Motor Loan (Honda EX5)', 'liability', 'car_loan', 15800, iso(monthDate(0, 1)));
}
