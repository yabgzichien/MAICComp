// src/lib/acceptOffer.ts
// Pure mapper: an accepted DirectApplyDecision -> a bookable local loan (product + amortization
// schedule). No React, no DB, no I/O. Persistence (a store action + DB write) is a separate,
// later task  this file only computes what *would* be booked.

import type { DirectApplyDecision } from './directApply';
import type { LoanProduct } from './loans';

export interface BookedLoan {
  productId: string;
  principal: number;
  schedule: { dueDate: string; amount: number }[];
}

/**
 * Among products whose amount range contains the offered amount, pick the HIGHEST tier
 * (largest minScore; ties broken by largest maxAmount). If none contain the amount, fall
 * back to the product with the largest maxAmount. Empty list -> null.
 */
export function productForOffer(offer: DirectApplyDecision, products: LoanProduct[]): LoanProduct | null {
  if (products.length === 0) return null;

  const containing = products.filter((p) => p.minAmount <= offer.maxAmount && offer.maxAmount <= p.maxAmount);
  if (containing.length > 0) {
    return containing.reduce((best, p) => {
      if (p.minScore > best.minScore) return p;
      if (p.minScore === best.minScore && p.maxAmount > best.maxAmount) return p;
      return best;
    });
  }

  return products.reduce((best, p) => (p.maxAmount > best.maxAmount ? p : best));
}

/** Add `months` calendar months to a UTC date, clamping the day to the target month's last day. */
function addMonthsUTC(base: Date, months: number): Date {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();

  const targetMonthIndex = m + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  // Last day of the target month: day 0 of the following month.
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Map an accepted offer to a bookable loan: chosen product + a repayment schedule of
 * `product.tenorMonths` entries, each due one more calendar month after `acceptedAt`, each
 * amount exactly `offer.installment` (the lender's decided figure, not recomputed from apr).
 * Returns null when the offer isn't an approval, has no positive amount, or no product applies.
 */
export function buildBookedLoan(offer: DirectApplyDecision, products: LoanProduct[], acceptedAt: Date): BookedLoan | null {
  if (offer.decision !== 'approve') return null;
  if (offer.maxAmount <= 0) return null;

  const product = productForOffer(offer, products);
  if (!product) return null;

  const schedule: { dueDate: string; amount: number }[] = [];
  for (let i = 1; i <= product.tenorMonths; i++) {
    schedule.push({ dueDate: toIsoDate(addMonthsUTC(acceptedAt, i)), amount: offer.installment });
  }

  return {
    productId: product.id,
    principal: offer.maxAmount,
    schedule,
  };
}

/**
 * Outstanding principal remaining on a booked loan after `paidCount` installments have been
 * paid, straight-line: each payment retires an equal `principal / tenorMonths` slice, so the
 * balance falls monotonically from `principal` (0 paid) to 0 (all paid) and never goes
 * negative even though the flat installment total exceeds principal (installment carries
 * interest). Pure; rounded to whole RM to match how balances are stored. Used to shrink the
 * borrower's loan liability in Net Worth as they repay.
 */
export function outstandingAfter(principal: number, tenorMonths: number, paidCount: number): number {
  if (tenorMonths <= 0) return 0;
  const remaining = Math.max(0, tenorMonths - Math.max(0, paidCount));
  return Math.round((principal * remaining) / tenorMonths);
}
