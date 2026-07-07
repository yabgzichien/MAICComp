// Deterministic loan-decision engine — ported verbatim from the borrower app
// (PipComp/src/lib/loans.ts) so the console runs the SAME policy the borrower sees.
// Pure: same input → same output, with a human-readable reason per step.

export type Decision = 'approve' | 'refer' | 'decline';

/**
 * Why a reason exists (Brief J / regulator finding AA2): "cannot afford", "cannot
 * verify", and "integrity concern" demand different adverse-action notices and give
 * the borrower different remedies, so every reason carries its category.
 */
export type ReasonCategory = 'affordability' | 'data-quality' | 'integrity' | 'policy' | 'record';

/** One evaluation-step reason with its adverse-action category. */
export interface DecisionReason {
  category: ReasonCategory;
  text: string;
}

/** Display headings for grouped reason rendering — one source of truth for both apps' UIs. */
export const REASON_CATEGORY_LABELS: Record<ReasonCategory, string> = {
  affordability: 'Affordability — capacity to repay',
  'data-quality': 'Data quality — what we could not verify',
  integrity: 'Integrity — automated validation',
  policy: 'Policy & tier',
  record: 'Credit record',
};

export type AdverseRecord = 'none' | 'soft' | 'hard';

export interface LoanProduct {
  id: string;
  label: string;
  minScore: number;
  minAmount: number;
  maxAmount: number;
  tenorMonths: number;
  apr: number;
}

/**
 * The intermediate caps decideLoan already computes on the way to an offer, exposed for
 * the decision-waterfall visual (Brief K). Additive and optional: absent when no tier was
 * selected (hard adverse record, integrity floor, score below the ladder).
 */
export interface DecisionBreakdown {
  requestedAmount: number;
  tierLabel: string;
  tierMinAmount: number;
  /** The requested amount clamped into the tier's principal range. */
  tierCeiling: number;
  /** Largest principal whose installment fits the surplus-share cap (may exceed the ceiling — then it didn't bite). */
  surplusCapPrincipal: number;
  /** Largest principal whose installment fits the DSR cap (may exceed the ceiling — then it didn't bite). */
  dsrCapPrincipal: number;
  /** The final offered principal — equals maxAmount; 0 on an affordability decline. */
  offered: number;
}

export interface LoanDecision {
  decision: Decision;
  maxAmount: number;
  installment: number;
  reasons: string[]; // derived from categorizedReasons
  /** The same reasons with their adverse-action category. Optional so hand-built fixtures
   *  and previously stored decisions stay valid; decideLoan always emits it. */
  categorizedReasons?: DecisionReason[];
  /** Intermediate caps for the waterfall visual; present whenever a tier was evaluated. */
  breakdown?: DecisionBreakdown;
}

export interface LoanDecisionInput {
  score: number;
  confidence: number;
  avgMonthlySurplus: number;
  monthlyDebtService: number;
  avgIncome: number;
  requestedAmount: number;
  products: LoanProduct[];
  adverseRecord?: AdverseRecord;
  coverageRatio?: number;
  coverageDaysCovered?: number;
  /** Set when income failed structural authenticity checks badly enough to DECLINE outright. */
  integrityFloorBreached?: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export const MIN_CONFIDENCE_TO_APPROVE = 0.5;
export const MAX_INSTALLMENT_SHARE_OF_SURPLUS = 0.35;
export const MAX_DSR = 0.4;

function rm(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}

export const DEFAULT_PRODUCTS: LoanProduct[] = [
  { id: 'emergency', label: 'Emergency Micro', minScore: 300, minAmount: 100, maxAmount: 500, tenorMonths: 6, apr: 0.36 },
  { id: 'starter', label: 'Starter Capital', minScore: 500, minAmount: 2000, maxAmount: 5000, tenorMonths: 12, apr: 0.28 },
  { id: 'growth', label: 'Growth Capital', minScore: 620, minAmount: 4000, maxAmount: 10000, tenorMonths: 18, apr: 0.22 },
  { id: 'scale', label: 'Scale Capital', minScore: 740, minAmount: 8000, maxAmount: 20000, tenorMonths: 24, apr: 0.16 },
];

export function installmentFor(principal: number, apr: number, tenorMonths: number): number {
  if (tenorMonths <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return principal / tenorMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -tenorMonths));
}

function selectTier(score: number, products: LoanProduct[]): LoanProduct | undefined {
  const eligible = products.filter((p) => p.minScore <= score);
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, p) => (p.minScore > best.minScore ? p : best));
}

type AffordabilityShortfall = 'no-headroom' | 'below-tier-minimum';
interface AffordabilityResult {
  principal: number;
  shortfall?: AffordabilityShortfall;
  /** The requested amount clamped into the tier range (feeds the waterfall breakdown). */
  ceiling: number;
  /** Largest principal each cap alone would support at this tier's rate/tenor. */
  surplusCapPrincipal: number;
  dsrCapPrincipal: number;
}

function affordablePrincipal(
  tier: LoanProduct,
  requestedAmount: number,
  avgMonthlySurplus: number,
  monthlyDebtService: number,
  avgIncome: number,
): AffordabilityResult {
  const ceiling = clamp(requestedAmount, tier.minAmount, tier.maxAmount);
  const surplusCapInstallment = Math.max(0, avgMonthlySurplus * MAX_INSTALLMENT_SHARE_OF_SURPLUS);
  const dsrCapInstallment = Math.max(0, avgIncome * MAX_DSR - monthlyDebtService);
  const maxInstallment = Math.min(surplusCapInstallment, dsrCapInstallment);
  // Installment scales linearly with principal for a fixed apr/tenor; the per-cap principals feed the waterfall.
  const installmentAtCeiling = installmentFor(ceiling, tier.apr, tier.tenorMonths);
  const principalFor = (cap: number): number => (installmentAtCeiling > 0 ? ceiling * (cap / installmentAtCeiling) : 0);
  const surplusCapPrincipal = principalFor(surplusCapInstallment);
  const dsrCapPrincipal = principalFor(dsrCapInstallment);
  if (maxInstallment <= 0) return { principal: 0, shortfall: 'no-headroom', ceiling, surplusCapPrincipal, dsrCapPrincipal };
  if (installmentAtCeiling <= maxInstallment) return { principal: ceiling, ceiling, surplusCapPrincipal, dsrCapPrincipal };
  const scaled = ceiling * (maxInstallment / installmentAtCeiling);
  if (scaled < tier.minAmount) return { principal: 0, shortfall: 'below-tier-minimum', ceiling, surplusCapPrincipal, dsrCapPrincipal };
  return { principal: Math.min(scaled, ceiling), ceiling, surplusCapPrincipal, dsrCapPrincipal };
}

function applyCoverageTierFilter(
  products: LoanProduct[],
  coverageRatio: number | undefined,
  coverageDaysCovered: number | undefined,
): { products: LoanProduct[]; forceRefer: boolean; reasons: DecisionReason[] } {
  if (typeof coverageDaysCovered !== 'number' || typeof coverageRatio !== 'number') {
    return { products, forceRefer: false, reasons: [] };
  }
  const pct = Math.round(coverageRatio * 100);
  const keep = (ids: string[]) => products.filter((p) => ids.includes(p.id));
  if (coverageDaysCovered < 30) {
    return {
      products: keep(['emergency']),
      forceRefer: true,
      reasons: [
        { category: 'data-quality', text: `Coverage ${pct}% (${coverageDaysCovered} days of last 90) → Emergency Micro tier only; routed to manual review (REFER) regardless of affordability.` },
      ],
    };
  }
  if (coverageDaysCovered < 90) {
    return {
      products: keep(['emergency', 'starter']),
      forceRefer: false,
      reasons: [
        { category: 'data-quality', text: `Coverage ${pct}% (${coverageDaysCovered} days of last 90) → eligibility capped to Starter Capital and below.` },
      ],
    };
  }
  if (coverageRatio < 0.5) {
    return {
      products: keep(['emergency', 'starter']),
      forceRefer: false,
      reasons: [
        { category: 'data-quality', text: `90+ days of history but coverage is only ${pct}% — eligibility capped to Starter Capital and below until coverage reaches 50%.` },
      ],
    };
  }
  return { products, forceRefer: false, reasons: [] };
}

export function decideLoan(input: LoanDecisionInput): LoanDecision {
  const {
    score,
    confidence,
    avgMonthlySurplus,
    monthlyDebtService,
    avgIncome,
    requestedAmount,
    products,
    adverseRecord = 'none',
    coverageRatio,
    coverageDaysCovered,
    integrityFloorBreached = false,
  } = input;
  const reasons: DecisionReason[] = [];
  // Set once a tier has been evaluated; rides every decision made after that point.
  let breakdown: DecisionBreakdown | undefined;
  // Flat strings stay derived from the categorized list so the two can never disagree.
  const finish = (decision: Decision, maxAmount: number, installment: number): LoanDecision => ({
    decision,
    maxAmount,
    installment,
    reasons: reasons.map((r) => r.text),
    categorizedReasons: reasons,
    ...(breakdown ? { breakdown } : {}),
  });

  if (adverseRecord === 'hard') {
    reasons.push({ category: 'record', text: 'Serious adverse record on file — application declined.' });
    return finish('decline', 0, 0);
  }

  // Data-integrity floor (asymmetric-fraud rings). Worded as a verification requirement,
  // not an accusation — automated validation failing is a reason for human review, not a verdict on the person.
  if (integrityFloorBreached) {
    reasons.push({
      category: 'integrity',
      text: 'Data-integrity check: the income pattern could not be validated automatically — declined pending manual verification with the lender.',
    });
    return finish('decline', 0, 0);
  }

  const coverage = applyCoverageTierFilter(products, coverageRatio, coverageDaysCovered);
  reasons.push(...coverage.reasons);

  const tier = selectTier(score, coverage.products);
  if (!tier) {
    const lowest = products.reduce((m, p) => Math.min(m, p.minScore), Infinity);
    reasons.push({ category: 'policy', text: `Score ${score} is below the minimum tier threshold (${lowest}) — application declined.` });
    return finish('decline', 0, 0);
  }
  reasons.push({ category: 'policy', text: `Qualifies for the "${tier.label}" tier (requires score ≥ ${tier.minScore}, scored ${score}).` });

  const affordability = affordablePrincipal(tier, requestedAmount, avgMonthlySurplus, monthlyDebtService, avgIncome);
  breakdown = {
    requestedAmount,
    tierLabel: tier.label,
    tierMinAmount: tier.minAmount,
    tierCeiling: affordability.ceiling,
    surplusCapPrincipal: affordability.surplusCapPrincipal,
    dsrCapPrincipal: affordability.dsrCapPrincipal,
    offered: affordability.principal,
  };
  if (affordability.principal <= 0) {
    const detail =
      affordability.shortfall === 'below-tier-minimum'
        ? `leave only enough room for an installment below this tier's minimum amount (${rm(tier.minAmount)})`
        : `leave no room for any installment at all`;
    reasons.push({
      category: 'affordability',
      text: `Affordability check failed: monthly surplus (${rm(avgMonthlySurplus)}) and existing debt service (${rm(monthlyDebtService)} of ${rm(avgIncome)} income) ${detail}.`,
    });
    return finish('decline', 0, 0);
  }
  const principal = affordability.principal;
  const installment = installmentFor(principal, tier.apr, tier.tenorMonths);
  reasons.push({
    category: 'affordability',
    text: `Approved amount capped at ${rm(principal)} so the installment (${rm(installment)}/mo over ${tier.tenorMonths} months at ${Math.round(tier.apr * 100)}% APR) stays within ${Math.round(MAX_INSTALLMENT_SHARE_OF_SURPLUS * 100)}% of avg surplus and a ${Math.round(MAX_DSR * 100)}% DSR cap.`,
  });
  if (principal < requestedAmount) {
    reasons.push({ category: 'affordability', text: `Requested ${rm(requestedAmount)} exceeds what affordability supports; offering ${rm(principal)} instead.` });
  }

  if (adverseRecord === 'soft') {
    reasons.push({ category: 'record', text: 'Minor adverse record on file — routed to manual review instead of auto-approval.' });
    return finish('refer', principal, installment);
  }
  if (confidence < MIN_CONFIDENCE_TO_APPROVE) {
    reasons.push({
      category: 'data-quality',
      text: `We could not verify enough of the recorded data (confidence ${Math.round(confidence * 100)}%, below the ${Math.round(MIN_CONFIDENCE_TO_APPROVE * 100)}% auto-approval floor) — routed to manual review. More verified history would strengthen this application.`,
    });
    return finish('refer', principal, installment);
  }
  if (coverage.forceRefer) {
    reasons.push({ category: 'data-quality', text: 'Auto-approval blocked by coverage policy — routed to manual review.' });
    return finish('refer', principal, installment);
  }

  reasons.push({ category: 'policy', text: 'Auto-approved: score, affordability, and data confidence all clear policy thresholds.' });
  return finish('approve', principal, installment);
}
