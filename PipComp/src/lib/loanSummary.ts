// src/lib/loanSummary.ts (My Financing polish, 2026-07-19)
// Pure per-loan package view + aggregate stats. The repayments table is flat across every
// loan the borrower has ever booked; this groups it back into one card's worth of data per
// application  lender, purpose, progress, outstanding balance  so the screen can show
// "TEKUN · Emergency" and "Naga · Working capital" as separate packages instead of every
// installment from every lender mixed into one list. No DB/UI imports  unit-tested.

import { outstandingAfter } from './acceptOffer';
import { PURPOSE_LABELS, type PurposeCategory } from './loanPurpose';
import type { LoanApplication, Repayment } from '../db/loansRepo';
import type { LoanProduct } from './loans';

export type LoanPackageStatus = 'ongoing' | 'settled' | 'defaulted';

export interface LoanPackage {
  application: LoanApplication;
  lenderLabel: string;
  productLabel: string;
  purposeLabel: string;
  /** This loan's own schedule slice, oldest first (listRepayments' own order preserved). */
  repayments: Repayment[];
  principal: number;
  /** The fixed per-instalment amount every row on this loan's schedule shares. */
  monthlyInstallment: number;
  tenorMonths: number;
  paidCount: number;
  missedCount: number;
  remainingCount: number;
  /** Straight-line outstanding principal  the same measure the Net Worth liability account
   *  already uses, so this card's number always agrees with what Net Worth shows. */
  outstandingPrincipal: number;
  /** The earliest still-scheduled instalment, or null once nothing is left to pay. */
  nextDue: Repayment | null;
  /** 'defaulted' from the application's own terminal flag (wins regardless of schedule
   *  state); else 'settled' once every instalment has resolved (nothing left scheduled);
   *  else 'ongoing'. Drives which section a card sorts into and whether it counts toward
   *  `financingTotals`. */
  status: LoanPackageStatus;
}

function productLabelFor(productId: string, products: LoanProduct[]): string {
  return products.find((p) => p.id === productId)?.label ?? productId;
}

function purposeLabelFor(application: LoanApplication): string {
  if (!application.purpose) return 'Not stated';
  return PURPOSE_LABELS[application.purpose.category as PurposeCategory] ?? 'Other';
}

function statusFor(application: LoanApplication, remainingCount: number): LoanPackageStatus {
  if (application.status === 'defaulted') return 'defaulted';
  return remainingCount > 0 ? 'ongoing' : 'settled';
}

/**
 * Build one LoanPackage per application. `repayments` is the full flat list (every loan);
 * each package filters out its own slice by `applicationId`. `products` resolves the display
 * label for `productId`; an unknown id falls back to the raw id, mirroring the screen's old
 * inline `productLabel` helper.
 */
export function buildLoanPackages(applications: LoanApplication[], repayments: Repayment[], products: LoanProduct[]): LoanPackage[] {
  return applications.map((application) => {
    const schedule = repayments.filter((r) => r.applicationId === application.id);
    const paidCount = schedule.filter((r) => r.status === 'paid' || r.status === 'late').length;
    const missedCount = schedule.filter((r) => r.status === 'missed').length;
    const remainingCount = schedule.filter((r) => r.status === 'scheduled').length;
    const tenorMonths = schedule.length;
    return {
      application,
      lenderLabel: application.lenderLabel ?? 'Lender',
      productLabel: productLabelFor(application.productId, products),
      purposeLabel: purposeLabelFor(application),
      repayments: schedule,
      principal: application.requestedAmount,
      monthlyInstallment: schedule[0]?.amount ?? 0,
      tenorMonths,
      paidCount,
      missedCount,
      remainingCount,
      outstandingPrincipal: outstandingAfter(application.requestedAmount, tenorMonths, paidCount),
      nextDue: schedule.find((r) => r.status === 'scheduled') ?? null,
      status: statusFor(application, remainingCount),
    };
  });
}

export interface FinancingTotals {
  /** Sum of each ongoing loan's monthly instalment. A settled loan (nothing left scheduled)
   *  or a defaulted one (nothing more will ever be collected) isn't a recurring obligation
   *  anymore, so neither contributes. */
  totalMonthlyRepayment: number;
  /** Sum of outstanding principal across the same ongoing loans. */
  totalUnpaidPrincipal: number;
}

/** Aggregate stats across 'ongoing' packages only  see LoanPackageStatus for the definition. */
export function financingTotals(packages: LoanPackage[]): FinancingTotals {
  const ongoing = packages.filter((p) => p.status === 'ongoing');
  return {
    totalMonthlyRepayment: ongoing.reduce((s, p) => s + p.monthlyInstallment, 0),
    totalUnpaidPrincipal: ongoing.reduce((s, p) => s + p.outstandingPrincipal, 0),
  };
}
