// src/lib/lenderOutcome.ts (per-lender outcome preview, 2026-07-21)
// Pure: turns a lender's engine verdict into the one line a borrower actually needs before
// they send anything — "does this go through on its own, does a person have to look at it, or
// is it a no?" — plus the real reason behind it.
//
// The reason is READ OFF the engine's own categorized reasons, never composed here. An earlier
// draft wrote its own explanation ("that's over what they approve automatically") and was
// simply wrong for the common case: a thin-coverage borrower is referred because of coverage,
// at any amount. Stating a confident, invented cause is worse than stating none, so this
// module's only job for a refer/decline is to pick which of the engine's reasons is the
// driving one.

import type { Decision, DecisionReason, LoanDecision, ReasonCategory } from './loans';

export interface LenderOutcome {
  decision: Decision;
  /** Short verdict for a chip. */
  headline: string;
  /** Why, in the engine's own words where there are any. */
  detail: string;
}

const HEADLINES: Record<Decision, string> = {
  approve: 'Approved on the spot',
  refer: 'A loan officer decides',
  decline: 'Not eligible here',
};

// Which reason to quote when several apply. Ordered by how binding each is: an integrity or
// record problem overrides everything, a data-quality gate outranks affordability (it caps the
// tier before affordability is even measured), and a bare policy line is the weakest — it is
// usually just "qualifies for tier X", which explains nothing about the hold-up.
const REASON_PRIORITY: ReasonCategory[] = ['integrity', 'record', 'data-quality', 'affordability', 'policy'];

function drivingReason(reasons: DecisionReason[] | undefined): string | null {
  if (!reasons || reasons.length === 0) return null;
  for (const category of REASON_PRIORITY) {
    const hit = reasons.find((r) => r.category === category);
    if (hit) return hit.text;
  }
  return reasons[0]?.text ?? null;
}

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

/**
 * Describe what `decision` means for the borrower at `requestedAmount`.
 *
 * An approve is the one case where this module states the mechanism itself, because the
 * mechanism IS the verdict: `decision === 'approve'` means the lender's policy cleared it with
 * no human in the loop. Refer and decline quote the engine.
 */
export function lenderOutcome(decision: LoanDecision, requestedAmount: number): LenderOutcome {
  const headline = HEADLINES[decision.decision];

  if (decision.decision === 'approve') {
    return {
      decision: decision.decision,
      headline,
      detail: `Their policy approves ${rm(decision.maxAmount > 0 ? decision.maxAmount : requestedAmount)} automatically, and no loan officer has to sign off.`,
    };
  }

  const reason = drivingReason(decision.categorizedReasons);
  if (decision.decision === 'refer') {
    return {
      decision: decision.decision,
      headline,
      detail: reason ?? `A loan officer at this lender reviews ${rm(requestedAmount)} by hand before it can be approved.`,
    };
  }

  return {
    decision: decision.decision,
    headline,
    detail: reason ?? `They can't fund ${rm(requestedAmount)} on your passport as it stands today.`,
  };
}

/** The result card's footer once a send has actually landed. Replaces a blanket "Filed in the
 *  lender's queue for review", which was wrong two ways round: an approved application is in
 *  nobody's review queue, and a declined one isn't waiting on anything. */
export function filedFootText(decision: Decision, lenderName: string): string {
  if (decision === 'approve') {
    return `Approved by ${lenderName}'s policy, so no officer review needed. Your offer is waiting in My Financing; nothing is borrowed until you accept it.`;
  }
  if (decision === 'refer') {
    return `Filed with ${lenderName} for a loan officer to review. Their decision arrives in My Financing.`;
  }
  return `${lenderName} can't fund this today. Nothing was borrowed, and your score is unaffected.`;
}
