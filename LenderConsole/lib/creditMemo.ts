// Pure planner for the Underwriting Copilot / Audit-Trail Memo. It assembles the
// credit memo a loan officer would write  including a Consumer Credit Act 2025
// affordability finding  entirely from data already on screen: the verified
// passport, the deterministic `decideLoan` result, and the `runAgentPanel` verdicts.
// No LLM, no UI imports. The LLM (see app/api/memo/route.ts) only narrates the
// `summary` and `rationale` prose; if it is absent, `fallbackNarrative` renders
// deterministic prose instead. Nothing here can change the verdict or amount.

import type { CreditPassport } from './passport';
import type { LenderPolicy, LoanDecision, Decision, ReasonCategory } from './loans';
import { DEFAULT_POLICY, REASON_CATEGORY_LABELS } from './loans';
import type { AgentPanelResult, AgentAssessment } from './agents';
import { drivingConstraintFrom } from './counterOffer';

const rm = (n: number): string => `RM${Math.round(n).toLocaleString('en-MY')}`;
const pct = (x: number): number => Math.round(x * 100);

const DECISION_LABEL: Record<Decision, string> = {
  approve: 'Approved',
  refer: 'Refer: manual review',
  decline: 'Declined',
};

export interface MemoHeader {
  applicant: string;
  nricMasked: string | null;
  date: string;
  evidenceShort: string;
  validUntil: string;
  requestedAmount: number;
  offeredAmount: number;
}

export interface MemoDecision {
  label: string;
  maxAmount: number;
  installment: number;
}

export interface MemoFinding {
  id: string;
  label: string;
  verdict: string;
  confidence: number;
  signals: string[];
}

export interface ComplianceLine {
  id: 'repayment-capacity' | 'installment-affordability' | 'data-confidence' | 'coverage';
  requirement: string;
  evidence: string;
  met: boolean;
}

/** Reasons of one adverse-action category, under its display heading (Brief J). */
export interface MemoRationaleGroup {
  category: ReasonCategory;
  label: string;
  reasons: string[];
}

/** The counter-offer note (Brief L). Present only when the engine's offered amount was
 *  positive and below the request  carries the original request, the countered amount,
 *  and the engine's own reason for the reduction (never an invented one). Null otherwise. */
export interface MemoCounterOffer {
  originalRequest: number;
  counteredAmount: number;
  constraint: string;
}

/** Risk-based pricing note (Brief R): the ladder rate, the rate actually applied, and the
 *  assistant's rationale lines. Present only when a pricing suggestion was computed. */
export interface MemoPricing {
  ladderApr: number;
  adoptedApr: number;
  reasons: string[];
}

export interface CreditMemo {
  header: MemoHeader;
  decision: MemoDecision;
  findings: MemoFinding[];
  rationale: string[];
  /** The rationale grouped by adverse-action category, non-empty groups only.
   *  Empty when the decision predates categorized reasons  renderers fall back to `rationale`. */
  groupedRationale: MemoRationaleGroup[];
  compliance: ComplianceLine[];
  conditions: string[];
  /** Optional counter-offer note (Brief L). Null unless the offer was reduced below the request. */
  counterOffer: MemoCounterOffer | null;
  /** Optional risk-based pricing note (Brief R). Null unless a pricing suggestion was computed. */
  pricing: MemoPricing | null;
}

/** Display order for the grouped headings: what binds the money first, then what could not be verified. */
const GROUP_ORDER: ReasonCategory[] = ['affordability', 'data-quality', 'integrity', 'record', 'policy'];

function groupRationale(decision: LoanDecision): MemoRationaleGroup[] {
  const categorized = decision.categorizedReasons;
  if (!categorized || categorized.length === 0) return [];
  return GROUP_ORDER.map((category) => ({
    category,
    label: REASON_CATEGORY_LABELS[category],
    reasons: categorized.filter((r) => r.category === category).map((r) => r.text),
  })).filter((g) => g.reasons.length > 0);
}

function shortHash(hash: string): string {
  return hash && hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-6)}` : hash;
}

function toFinding(a: AgentAssessment): MemoFinding {
  return { id: a.id, label: a.label, verdict: a.verdict, confidence: a.confidence, signals: a.signals };
}

/** The CCA-2025 affordability duties, each as requirement → evidence → met/not-met,
 * derived from the SAME thresholds `decideLoan` used (the active LenderPolicy  Brief N),
 * so it can never contradict the verdict. */
function buildCompliance(passport: CreditPassport, decision: LoanDecision, policy: LenderPolicy): ComplianceLine[] {
  const a = passport.assessment;
  if (!a) return [];
  const income = a.avgIncome;
  const postDsr = income > 0 ? (a.monthlyDebtService + decision.installment) / income : 1;
  const surplusShare = a.avgMonthlySurplus > 0 ? decision.installment / a.avgMonthlySurplus : 0;
  const coverageOk = a.coverageDays >= policy.fullLadderFromDays && a.coverageRatio >= policy.minCoverageRatioForFullLadder;

  return [
    {
      id: 'repayment-capacity',
      requirement: `Total debt service after this facility stays within a ${pct(policy.maxDsr)}% debt-service ratio`,
      evidence: `Post-loan DSR ${pct(postDsr)}% ((${rm(a.monthlyDebtService)} existing + ${rm(decision.installment)} new) of ${rm(income)} income)`,
      met: postDsr <= policy.maxDsr + 1e-9,
    },
    {
      id: 'installment-affordability',
      requirement: `Installment consumes no more than ${pct(policy.maxInstallmentShareOfSurplus)}% of average monthly surplus`,
      evidence: `Installment ${rm(decision.installment)} = ${pct(surplusShare)}% of ${rm(a.avgMonthlySurplus)} surplus`,
      met: surplusShare <= policy.maxInstallmentShareOfSurplus + 1e-9,
    },
    {
      id: 'data-confidence',
      requirement: `Underlying data confidence meets the ${pct(policy.minConfidenceToApprove)}% floor for automated approval`,
      evidence: `Data confidence ${pct(a.confidence)}%`,
      met: a.confidence >= policy.minConfidenceToApprove,
    },
    {
      id: 'coverage',
      requirement: `Cash-flow history spans at least ${policy.fullLadderFromDays} days with at least ${pct(policy.minCoverageRatioForFullLadder)}% coverage`,
      evidence: `${a.coverageDays} days of history, ${pct(a.coverageRatio)}% coverage`,
      met: coverageOk,
    },
  ];
}

function buildConditions(decision: LoanDecision): string[] {
  switch (decision.decision) {
    case 'refer':
      return [
        'Route to a human underwriter for manual review before any offer is extended.',
        'Confirm the binding condition flagged above (data confidence, coverage, or adverse record).',
        'Verify applicant identity and income documentation on file.',
      ];
    case 'decline':
      return [
        'No facility to be extended on the current evidence.',
        'Issue an adverse-action notice citing the binding reason above.',
        'Applicant may re-apply once the binding constraint is addressed.',
      ];
    default:
      return [
        `Disburse up to ${rm(decision.maxAmount)} at the stated installment and tenor.`,
        'Standard monitoring of repayment performance applies.',
      ];
  }
}

/** An officer's queue resolution (Brief O)  surfaces in the memo's conditions. */
export interface MemoResolution {
  outcome: 'approved' | 'declined';
  rationale: string;
  officer: string;
}

export function buildCreditMemo(
  passport: CreditPassport,
  decision: LoanDecision,
  panel: AgentPanelResult,
  requestedAmount: number,
  resolution?: MemoResolution,
  policy: LenderPolicy = DEFAULT_POLICY,
  pricing: MemoPricing | null = null,
): CreditMemo {
  const header: MemoHeader = {
    applicant: passport.holder?.name ?? 'Applicant',
    nricMasked: passport.holder?.nricMasked ?? null,
    date: passport.issuedAt.slice(0, 10),
    evidenceShort: shortHash(passport.evidenceHash),
    validUntil: passport.validUntil.slice(0, 10),
    requestedAmount,
    offeredAmount: decision.maxAmount,
  };

  // Counter-offer note (Brief L): present only when the offer was reduced below the request.
  // The constraint comes from the engine's own reason strings via the pure helper  never invented.
  const counterOffer: MemoCounterOffer | null =
    decision.maxAmount > 0 && requestedAmount > 0 && decision.maxAmount < requestedAmount
      ? { originalRequest: requestedAmount, counteredAmount: decision.maxAmount, constraint: drivingConstraintFrom(decision) }
      : null;

  return {
    header,
    decision: { label: DECISION_LABEL[decision.decision], maxAmount: decision.maxAmount, installment: decision.installment },
    findings: [...panel.specialists, panel.orchestrator].map(toFinding),
    rationale: decision.reasons,
    groupedRationale: groupRationale(decision),
    compliance: buildCompliance(passport, decision, policy),
    conditions: resolution
      ? [`Officer resolution  ${resolution.outcome} by ${resolution.officer}: "${resolution.rationale}" (recorded in the application audit trail).`, ...buildConditions(decision)]
      : buildConditions(decision),
    counterOffer,
    pricing,
  };
}

// ── Downloadable artifact ───────────────────────────────────────────────────────

export function memoToMarkdown(memo: CreditMemo): string {
  const h = memo.header;
  const lines: string[] = [];
  lines.push('# Credit Memo');
  lines.push('');
  lines.push(`**Applicant:** ${h.applicant}${h.nricMasked ? ` (${h.nricMasked})` : ''}`);
  lines.push(`**Date:** ${h.date}  ·  **Evidence:** ${h.evidenceShort}  ·  **Passport valid until:** ${h.validUntil}`);
  lines.push(`**Requested:** ${rm(h.requestedAmount)}  ·  **Offered:** ${rm(h.offeredAmount)}`);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(`**${memo.decision.label}**  up to ${rm(memo.decision.maxAmount)} at ${rm(memo.decision.installment)}/mo.`);
  lines.push('');
  if (memo.pricing) {
    const pr = memo.pricing;
    const asPct = (x: number) => `${(x * 100).toFixed(1)}%`;
    lines.push(`**Pricing:** ladder rate ${asPct(pr.ladderApr)}, rate applied ${asPct(pr.adoptedApr)}${pr.adoptedApr < pr.ladderApr ? ' (risk-based discount)' : ''}.`);
    for (const r of pr.reasons) lines.push(`- ${r}`);
    lines.push('');
  }
  lines.push('## Panel findings');
  lines.push('');
  for (const f of memo.findings) {
    lines.push(`- **${f.label}:** ${f.verdict} (${f.confidence}%)  ${f.signals.join('; ')}`);
  }
  lines.push('');
  lines.push('## Rationale');
  lines.push('');
  if (memo.groupedRationale.length > 0) {
    for (const g of memo.groupedRationale) {
      lines.push(`### ${g.label}`);
      lines.push('');
      for (const r of g.reasons) lines.push(`- ${r}`);
      lines.push('');
    }
  } else {
    for (const r of memo.rationale) lines.push(`- ${r}`);
    lines.push('');
  }
  lines.push('## Consumer Credit Act 2025  affordability assessment');
  lines.push('');
  for (const c of memo.compliance) {
    lines.push(`- ${c.met ? '✓ Met' : '✗ Not met'}  ${c.requirement}. ${c.evidence}.`);
  }
  lines.push('');
  if (memo.counterOffer) {
    const co = memo.counterOffer;
    lines.push('## Counter-offer');
    lines.push('');
    lines.push(`Original request: ${rm(co.originalRequest)}  ·  Countered amount: ${rm(co.counteredAmount)}`);
    lines.push('');
    lines.push(`Driving constraint: ${co.constraint}`);
    lines.push('');
  }
  lines.push('## Conditions & next steps');
  lines.push('');
  for (const c of memo.conditions) lines.push(`- ${c}`);
  lines.push('');
  lines.push('---');
  lines.push('_Advisory drafting over a deterministic decision. Every figure and verdict is computed by the policy engine; this memo restates them and does not change them._');
  return lines.join('\n');
}

// ── Deterministic fallback narration (used when the LLM is unavailable) ──────────

export function fallbackNarrative(memo: CreditMemo): { summary: string; rationale: string } {
  const d = memo.decision;
  const unmet = memo.compliance.filter((c) => !c.met);
  const summary =
    `${d.label} for ${memo.header.applicant}: ${rm(d.maxAmount)} at ${rm(d.installment)}/mo. ` +
    (unmet.length === 0
      ? 'All affordability duties under the Consumer Credit Act 2025 are met.'
      : `${unmet.length} affordability ${unmet.length === 1 ? 'duty is' : 'duties are'} not met (${unmet.map((c) => c.id.replace(/-/g, ' ')).join(', ')}).`);
  const rationale = memo.rationale.length ? memo.rationale.join(' ') : 'No policy reasons were recorded for this decision.';
  return { summary, rationale };
}
