// Adverse-action letter builder (Brief J stretch). One click on any resolved decline,
// refer, or counter-offer produces a borrower-facing letter: the decision, principal
// reasons rewritten to second person, what evidence was relied on, and what would most
// improve a future application. Deterministic  the LLM (see app/api/adverseAction/
// route.ts) only narrates prose atop these SAME facts and can never change a number,
// reason, or verdict. No delivery mechanism: this only assembles the text; the UI layer
// renders it as a copy/print modal, never sends it anywhere.

import type { CreditPassport, ConsentTier } from './passport';
import type { DecisionReason, LoanDecision, ReasonCategory } from './loans';
import { counterOfferFor } from './counterOffer';

export type LetterKind = 'decline' | 'refer' | 'counter-offer';

export interface LetterReason {
  category: ReasonCategory;
  /** The engine's own reason, rewritten to second person where a known template matches;
   *  the original text verbatim otherwise (never blank, never invented). */
  text: string;
}

export interface DataRelied {
  evidenceShort: string;
  /** e.g. "Tier 0 aggregates + Tier 1 identity", or an honest note when no receipts exist. */
  consentSummary: string;
  issuedAt: string;
  validUntil: string;
}

export type ImprovementConstraint = 'coverage' | 'confidence' | 'affordability' | 'record' | 'none';

export interface ImprovementNote {
  constraint: ImprovementConstraint;
  text: string;
}

export interface LetterCounterOffer {
  originalRequest: number;
  counteredAmount: number;
  installment: number;
  constraint: string;
}

export interface AdverseActionLetter {
  kind: LetterKind;
  applicant: string;
  date: string;
  requestedAmount: number;
  offeredAmount: number;
  decisionStatement: string;
  principalReasons: LetterReason[];
  dataRelied: DataRelied;
  improvement: ImprovementNote;
  counterOffer: LetterCounterOffer | null;
  caveat: string;
}

export const LETTER_CAVEAT = 'Template. Review before sending. Not legal advice.';

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;

function shortHash(hash: string): string {
  return hash && hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-6)}` : hash;
}

const TIER_LABEL: Record<ConsentTier, string> = {
  0: 'Tier 0 aggregates',
  1: 'Tier 1 identity',
  2: 'Tier 2 spending',
  3: 'Tier 3 monitoring',
};

function dataReliedFrom(passport: CreditPassport): DataRelied {
  const consentSummary =
    passport.consent && passport.consent.length > 0
      ? Array.from(new Set(passport.consent.map((c) => c.tier)))
          .sort((a: ConsentTier, b: ConsentTier) => a - b)
          .map((t: ConsentTier) => TIER_LABEL[t] ?? `Tier ${t}`)
          .join(' + ')
      : 'No signed consent receipts on file (pre-consent passport)';
  return {
    evidenceShort: shortHash(passport.evidenceHash),
    consentSummary,
    issuedAt: passport.issuedAt.slice(0, 10),
    validUntil: passport.validUntil.slice(0, 10),
  };
}

/**
 * Known reason templates from loans.ts, rewritten to second-person borrower prose. Matched
 * by exact pattern so numbers are never recomputed or invented  only the surrounding
 * language changes. Any reason that doesn't match a known template is returned verbatim
 * (never blank), so a future loans.ts wording change degrades gracefully instead of breaking.
 */
const REASON_REWRITES: Array<[RegExp, string]> = [
  [
    /^Serious adverse record on file. Application declined\.$/,
    'You have a serious adverse record on file, and this application has been declined as a result.',
  ],
  [
    /^Minor adverse record on file. Routed to manual review instead of auto-approval\.$/,
    'You have a minor adverse record on file, so this application has been routed to manual review instead of being approved automatically.',
  ],
  [
    /^Data-integrity check: the income pattern could not be validated automatically. Declined pending manual verification with the lender\.$/,
    'The income pattern on your application could not be validated automatically, so it has been declined pending manual verification with us.',
  ],
  [
    /^Score (\d+) is below the minimum tier threshold \((\d+)\). Application declined\.$/,
    'Your score of $1 is below our minimum threshold of $2 for any of our loan products, so this application has been declined.',
  ],
  [
    /^We could not verify enough of the recorded data \(confidence (\d+)%, below the (\d+)% auto-approval floor\). Routed to manual review\. More verified history would strengthen this application\.$/,
    'We could not verify enough of your recorded financial data (confidence $1%, below our $2% auto-approval threshold), so this application has been routed to manual review.',
  ],
  [
    /^Auto-approval blocked by coverage policy. Routed to manual review\.$/,
    'Automatic approval was blocked by our data-coverage policy, so this application has been routed to manual review.',
  ],
  [
    /^Coverage (\d+)% \((\d+) days of last 90\) → Emergency Micro tier only; routed to manual review \(REFER\) regardless of affordability\.$/,
    'With only $2 days of tracked activity in the last 90 ($1% coverage), you currently qualify only for our smallest Emergency tier, and this application has been routed to manual review regardless of affordability.',
  ],
  [
    /^Coverage (\d+)% \((\d+) days of last 90\) → eligibility capped to Starter Capital and below\.$/,
    'With $2 days of tracked activity in the last 90 ($1% coverage), your eligibility is currently capped to our Starter Capital tier and below.',
  ],
  [
    /^(\d+)\+ days of history but coverage is only (\d+)%  eligibility capped to Starter Capital and below until coverage reaches (\d+)%\.$/,
    'You have $1+ days of history, but your data coverage is only $2%, so your eligibility is capped to our Starter Capital tier and below until coverage reaches $3%.',
  ],
  [
    /^Affordability check failed: monthly surplus \(([^)]+)\) and existing debt service \(([^)]+)\) (leave no room for any installment at all|leave only enough room for an installment below this tier's minimum amount \([^)]+\))\.$/,
    'Your monthly surplus ($1) and existing debt service ($2) $3, so we are unable to offer an installment on this application.',
  ],
  [
    /^Approved amount capped at (RM[\d,]+) so the installment \(([^)]+)\) stays within (\d+)% of avg surplus and a (\d+)% DSR cap\.$/,
    'The approved amount has been capped at $1 so that the installment ($2) stays within $3% of your average surplus and a $4% debt-service ratio.',
  ],
  [
    /^Requested (RM[\d,]+) exceeds what affordability supports; offering (RM[\d,]+) instead\.$/,
    'You requested $1, which exceeds what your affordability profile supports, so we can offer $2 instead.',
  ],
  [
    /^Qualifies for the "([^"]+)" tier \(requires score ≥ (\d+), scored (\d+)\)\.$/,
    'You qualify for our "$1" tier (which requires a score of $2 or higher; you scored $3).',
  ],
];

function toSecondPerson(text: string): string {
  for (const [pattern, template] of REASON_REWRITES) {
    const m = text.match(pattern);
    if (m) return template.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '');
  }
  return text;
}

const IMPROVEMENT_TEXT: Record<ImprovementConstraint, string> = {
  coverage:
    'Building a longer verified transaction history (more tracked days of income and spending) is the single change most likely to improve a future application.',
  confidence:
    'Providing more consistently verifiable transaction history would raise our confidence in your data and most improve a future application.',
  affordability:
    'Increasing your monthly surplus, for example through higher income, lower recurring expenses, or less existing debt service, is the change most likely to improve a future application.',
  record:
    'This outcome reflects a record on file rather than your recent financial data; please contact us directly to discuss it.',
  none: 'No single gap stands out. Your current application already reflects strong, verified data.',
};

/**
 * The dominant, borrower-actionable constraint behind a decline or refer, read off the
 * SAME categorized reasons the letter already cites (no counterfactual re-run  the console
 * doesn't have the borrower-side data coachPlan.ts uses for that). Record and integrity
 * issues are compliance matters, not data gaps, so they take priority when present.
 */
function improvementFrom(reasons: DecisionReason[]): ImprovementNote {
  if (reasons.some((r) => r.category === 'record' || r.category === 'integrity')) {
    return { constraint: 'record', text: IMPROVEMENT_TEXT.record };
  }
  if (reasons.some((r) => r.category === 'data-quality' && /confidence/i.test(r.text))) {
    return { constraint: 'confidence', text: IMPROVEMENT_TEXT.confidence };
  }
  if (reasons.some((r) => r.category === 'data-quality' && /coverage/i.test(r.text))) {
    return { constraint: 'coverage', text: IMPROVEMENT_TEXT.coverage };
  }
  if (reasons.some((r) => r.category === 'affordability')) {
    return { constraint: 'affordability', text: IMPROVEMENT_TEXT.affordability };
  }
  return { constraint: 'none', text: IMPROVEMENT_TEXT.none };
}

function decisionStatementFor(kind: LetterKind, requestedAmount: number, co: ReturnType<typeof counterOfferFor>): string {
  if (kind === 'counter-offer' && co) {
    return `We are unable to offer the full ${rm(requestedAmount)} you requested, but we can offer ${rm(co.amount)} at ${rm(co.installment)}/mo instead.`;
  }
  if (kind === 'decline') {
    return `Your application for ${rm(requestedAmount)} has been declined.`;
  }
  return `Your application for ${rm(requestedAmount)} requires further review before a decision can be made.`;
}

/**
 * Build the letter for a resolved decline, refer, or counter-offer. Returns null for a
 * clean approve with no counter-offer  there is nothing adverse to explain.
 */
export function buildAdverseActionLetter(
  passport: CreditPassport,
  decision: LoanDecision,
  requestedAmount: number,
): AdverseActionLetter | null {
  const co = counterOfferFor(decision, requestedAmount);
  const kind: LetterKind | null = co ? 'counter-offer' : decision.decision === 'decline' ? 'decline' : decision.decision === 'refer' ? 'refer' : null;
  if (!kind) return null;

  const categorized = decision.categorizedReasons ?? decision.reasons.map((text) => ({ category: 'policy' as ReasonCategory, text }));
  const principalReasons: LetterReason[] = categorized.map((r) => ({ category: r.category, text: toSecondPerson(r.text) }));

  return {
    kind,
    applicant: passport.holder?.name ?? 'Applicant',
    date: passport.issuedAt.slice(0, 10),
    requestedAmount,
    offeredAmount: decision.maxAmount,
    decisionStatement: decisionStatementFor(kind, requestedAmount, co),
    principalReasons,
    dataRelied: dataReliedFrom(passport),
    improvement: improvementFrom(categorized),
    counterOffer: co ? { originalRequest: requestedAmount, counteredAmount: co.amount, installment: co.installment, constraint: co.constraint } : null,
    caveat: LETTER_CAVEAT,
  };
}

const KIND_LABEL: Record<LetterKind, string> = {
  decline: 'Decline',
  refer: 'Refer for manual review',
  'counter-offer': 'Counter-offer',
};

/** Deterministic plain-text rendering for copy/download  no LLM prose baked in, same
 *  convention as creditMemo.ts's memoToMarkdown (narration is a screen-only enhancement). */
export function letterToText(letter: AdverseActionLetter): string {
  const lines: string[] = [];
  lines.push(`ADVERSE-ACTION LETTER  ${KIND_LABEL[letter.kind]}`);
  lines.push(`${letter.applicant} · ${letter.date}`);
  lines.push('');
  lines.push(letter.decisionStatement);
  lines.push('');
  lines.push('PRINCIPAL REASONS');
  for (const r of letter.principalReasons) lines.push(`- ${r.text}`);
  lines.push('');
  if (letter.counterOffer) {
    lines.push('COUNTER-OFFER');
    lines.push(
      `Original request: ${rm(letter.counterOffer.originalRequest)} · Countered amount: ${rm(letter.counterOffer.counteredAmount)} at ${rm(letter.counterOffer.installment)}/mo`,
    );
    lines.push(`Driving constraint: ${letter.counterOffer.constraint}`);
    lines.push('');
  }
  lines.push('DATA RELIED UPON');
  lines.push(`Evidence fingerprint: ${letter.dataRelied.evidenceShort}`);
  lines.push(`Consent: ${letter.dataRelied.consentSummary}`);
  lines.push(`Passport issued ${letter.dataRelied.issuedAt}, valid until ${letter.dataRelied.validUntil}`);
  lines.push('');
  lines.push('HOW TO STRENGTHEN A FUTURE APPLICATION');
  lines.push(letter.improvement.text);
  lines.push('');
  lines.push('---');
  lines.push(letter.caveat);
  return lines.join('\n');
}
