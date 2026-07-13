// src/lib/loanPurpose.ts
// Borrower-side declared loan purpose (spec 2026-07-07 core; this file is the still-open
// borrower half, finally captured as part of the direct-apply-transport spec, 2026-07-11).
// Mirrors LenderConsole/lib/applications.ts's PurposeCategory values exactly  the two
// sides must agree on the enum or a submitted category silently falls to "other" on
// arrival. Context for the lender only: this never enters the credit score, the data
// confidence, or decideLoan. No UI/DB imports  pure.

export type PurposeCategory = 'stock' | 'equipment' | 'working-capital' | 'emergency' | 'education' | 'other';

export const PURPOSE_CATEGORIES: PurposeCategory[] = ['stock', 'equipment', 'working-capital', 'emergency', 'education', 'other'];

export const PURPOSE_LABELS: Record<PurposeCategory, string> = {
  stock: 'Stock / inventory',
  equipment: 'Equipment',
  'working-capital': 'Working capital',
  emergency: 'Emergency',
  education: 'Education',
  other: 'Other',
};

/** A declared purpose ready to travel with an application  category always present,
 *  note optional (see capNote). */
export interface DeclaredPurpose {
  category: PurposeCategory;
  note?: string;
}

/** Carried from the Loans screen's apply step to the Passport screen's send step
 *  (direct-apply-transport spec)  App.tsx threads this the same way it already threads
 *  addInitial/calendarMonth between screens. Minting requires the consent ceremony
 *  regardless, so this only ever describes WHAT to send once a passport exists. The
 *  declared purpose is captured on the send card itself (it never affects the local
 *  eligibility check, so it has no place on the Loans screen), not carried here. */
export interface PendingLoanApply {
  requestedAmount: number;
  productLabel: string;
}

const NOTE_MAX = 140;

/** Trims and caps an optional note to the console's field length; empty/whitespace-only
 *  collapses to undefined so "wrote nothing" and "didn't open the field" look identical. */
export function capNote(note: string | undefined): string | undefined {
  if (!note) return undefined;
  const trimmed = note.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, NOTE_MAX);
}
