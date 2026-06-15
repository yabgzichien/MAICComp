// Deterministic loan-decision engine — ported verbatim from the borrower app
// (PipComp/src/lib/loans.ts) so the console runs the SAME policy the borrower sees.
// Pure: same input → same output, with a human-readable reason per step.

export type Decision = 'approve' | 'refer' | 'decline';
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

export interface LoanDecision {
  decision: Decision;
  maxAmount: number;
  installment: number;
  reasons: string[];
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
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

const MIN_CONFIDENCE_TO_APPROVE = 0.5;
const MAX_INSTALLMENT_SHARE_OF_SURPLUS = 0.35;
const MAX_DSR = 0.4;

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
  if (maxInstallment <= 0) return { principal: 0, shortfall: 'no-headroom' };
  const installmentAtCeiling = installmentFor(ceiling, tier.apr, tier.tenorMonths);
  if (installmentAtCeiling <= maxInstallment) return { principal: ceiling };
  const scaled = ceiling * (maxInstallment / installmentAtCeiling);
  if (scaled < tier.minAmount) return { principal: 0, shortfall: 'below-tier-minimum' };
  return { principal: Math.min(scaled, ceiling) };
}

function applyCoverageTierFilter(
  products: LoanProduct[],
  coverageRatio: number | undefined,
  coverageDaysCovered: number | undefined,
): { products: LoanProduct[]; forceRefer: boolean; reasons: string[] } {
  if (typeof coverageDaysCovered !== 'number' || typeof coverageRatio !== 'number') {
    return { products, forceRefer: false, reasons: [] };
  }
  const pct = Math.round(coverageRatio * 100);
  const keep = (ids: string[]) => products.filter((p) => ids.includes(p.id));
  if (coverageDaysCovered < 30) {
    return {
      products: keep(['emergency']),
      forceRefer: true,
      reasons: [`Coverage ${pct}% (${coverageDaysCovered} days of last 90) → Emergency Micro tier only; routed to manual review (REFER) regardless of affordability.`],
    };
  }
  if (coverageDaysCovered < 90) {
    return {
      products: keep(['emergency', 'starter']),
      forceRefer: false,
      reasons: [`Coverage ${pct}% (${coverageDaysCovered} days of last 90) → eligibility capped to Starter Capital and below.`],
    };
  }
  if (coverageRatio < 0.5) {
    return {
      products: keep(['emergency', 'starter']),
      forceRefer: false,
      reasons: [`90+ days of history but coverage is only ${pct}% — eligibility capped to Starter Capital and below until coverage reaches 50%.`],
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
  } = input;
  const reasons: string[] = [];

  if (adverseRecord === 'hard') {
    reasons.push('Serious adverse record on file — application declined.');
    return { decision: 'decline', maxAmount: 0, installment: 0, reasons };
  }

  const coverage = applyCoverageTierFilter(products, coverageRatio, coverageDaysCovered);
  reasons.push(...coverage.reasons);

  const tier = selectTier(score, coverage.products);
  if (!tier) {
    const lowest = products.reduce((m, p) => Math.min(m, p.minScore), Infinity);
    reasons.push(`Score ${score} is below the minimum tier threshold (${lowest}) — application declined.`);
    return { decision: 'decline', maxAmount: 0, installment: 0, reasons };
  }
  reasons.push(`Qualifies for the "${tier.label}" tier (requires score ≥ ${tier.minScore}, scored ${score}).`);

  const affordability = affordablePrincipal(tier, requestedAmount, avgMonthlySurplus, monthlyDebtService, avgIncome);
  if (affordability.principal <= 0) {
    const detail =
      affordability.shortfall === 'below-tier-minimum'
        ? `leave only enough room for an installment below this tier's minimum amount (${rm(tier.minAmount)})`
        : `leave no room for any installment at all`;
    reasons.push(
      `Affordability check failed: monthly surplus (${rm(avgMonthlySurplus)}) and existing debt service (${rm(monthlyDebtService)} of ${rm(avgIncome)} income) ${detail}.`,
    );
    return { decision: 'decline', maxAmount: 0, installment: 0, reasons };
  }
  const principal = affordability.principal;
  const installment = installmentFor(principal, tier.apr, tier.tenorMonths);
  reasons.push(
    `Approved amount capped at ${rm(principal)} so the installment (${rm(installment)}/mo over ${tier.tenorMonths} months at ${Math.round(tier.apr * 100)}% APR) stays within ${Math.round(MAX_INSTALLMENT_SHARE_OF_SURPLUS * 100)}% of avg surplus and a ${Math.round(MAX_DSR * 100)}% DSR cap.`,
  );
  if (principal < requestedAmount) {
    reasons.push(`Requested ${rm(requestedAmount)} exceeds what affordability supports; offering ${rm(principal)} instead.`);
  }

  if (adverseRecord === 'soft') {
    reasons.push('Minor adverse record on file — routed to manual review instead of auto-approval.');
    return { decision: 'refer', maxAmount: principal, installment, reasons };
  }
  if (confidence < MIN_CONFIDENCE_TO_APPROVE) {
    reasons.push(`Confidence in the underlying data (${Math.round(confidence * 100)}%) is below the ${Math.round(MIN_CONFIDENCE_TO_APPROVE * 100)}% threshold for auto-approval — routed to manual review.`);
    return { decision: 'refer', maxAmount: principal, installment, reasons };
  }
  if (coverage.forceRefer) {
    reasons.push('Auto-approval blocked by coverage policy — routed to manual review.');
    return { decision: 'refer', maxAmount: principal, installment, reasons };
  }

  reasons.push('Auto-approved: score, affordability, and data confidence all clear policy thresholds.');
  return { decision: 'approve', maxAmount: principal, installment, reasons };
}
