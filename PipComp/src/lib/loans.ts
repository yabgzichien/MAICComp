// src/lib/loans.ts
// Pure, deterministic loan-decision engine over a credit score + affordability snapshot.
// No UI/DB imports — unit-tested. The AI never computes the decision.
import type { CreditBand } from './creditScore';

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

/** Severity of an applicant's adverse credit record (mock until verification connectors land). */
export type AdverseRecord = 'none' | 'soft' | 'hard';

export interface LoanProduct {
  id: string;
  label: string;
  minScore: number; // lowest score (inclusive) this tier accepts
  minAmount: number; // RM, smallest principal this tier offers
  maxAmount: number; // RM, ceiling principal this tier offers
  tenorMonths: number; // repayment term in months
  apr: number; // annual percentage rate as a decimal, e.g. 0.18 = 18%
}

export interface LoanDecision {
  decision: Decision;
  maxAmount: number; // RM the applicant qualifies for (0 if declined/referred without an offer)
  installment: number; // RM/month at maxAmount (0 if no offer)
  reasons: string[]; // human-readable explanation, one entry per evaluation step (derived from categorizedReasons)
  /** The same reasons with their adverse-action category. Optional so hand-built fixtures
   *  and previously stored decisions stay valid; decideLoan always emits it. */
  categorizedReasons?: DecisionReason[];
}

export interface LoanDecisionInput {
  score: number;
  band: CreditBand;
  confidence: number; // 0..1, trust in the data behind the score
  avgMonthlySurplus: number; // RM/mo, avg income - expenses
  monthlyDebtService: number; // RM/mo, existing debt obligations (excludes the loan being decided)
  avgIncome: number; // RM/mo
  requestedAmount: number; // RM, what the applicant asked for
  products: LoanProduct[]; // tier ladder to evaluate against (use DEFAULT_PRODUCTS in production)
  adverseRecord?: AdverseRecord; // defaults to 'none'
  /** 0..1 — 90-day data-coverage ratio from `lib/coverage.ts`. Optional for back-compat. */
  coverageRatio?: number;
  /** Distinct days covered in the trailing 90. Optional for back-compat. */
  coverageDaysCovered?: number;
  /** Set by `computeDataConfidence` when income failed structural authenticity checks badly
   *  enough to DECLINE outright (not merely REFER). Optional/false by default. */
  integrityFloorBreached?: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

// --- Tunable policy constants -------------------------------------------------
// Below this confidence, we don't trust the score enough to auto-approve: refer for human review.
const MIN_CONFIDENCE_TO_APPROVE = 0.5;
// An approved installment may not exceed this share of the applicant's average monthly surplus,
// so a new repayment doesn't eat into their cash-flow buffer.
const MAX_INSTALLMENT_SHARE_OF_SURPLUS = 0.35;
// Total debt-service ratio (existing debt + new installment) over income may not exceed this.
const MAX_DSR = 0.4;

function rm(n: number): string {
  return `RM${Math.round(n).toLocaleString('en-MY')}`;
}

/**
 * Default product ladder, seeded for reuse and DB seeding. Sorted ascending by minScore.
 *
 * The first product, `'emergency'`, is a small REFER-only safety-net for users without
 * enough recorded history to underwrite a working-capital loan (gated by Phase 6's
 * coverage-tier filter). The remaining three tiers target the RM2k-20k working-capital
 * range for micro-entrepreneurs. APRs are decimals (0.24 = 24%); tenors in months.
 *
 * Note: standard `selectTier` picks the *highest* qualifying tier by minScore, so Emergency
 * (minScore 300) only ever surfaces when the coverage filter has narrowed `products` down
 * to Emergency-only — by design.
 */
export const DEFAULT_PRODUCTS: LoanProduct[] = [
  {
    id: 'emergency',
    label: 'Emergency Micro',
    minScore: 300, // available to any score so a tiny safety-net always exists
    minAmount: 100,
    maxAmount: 500,
    tenorMonths: 6,
    apr: 0.36,
  },
  {
    id: 'starter',
    label: 'Starter Capital',
    minScore: 500, // ~ Fair band and up
    minAmount: 2000,
    maxAmount: 5000,
    tenorMonths: 12,
    apr: 0.28,
  },
  {
    id: 'growth',
    label: 'Growth Capital',
    minScore: 620, // ~ Good band and up
    minAmount: 4000,
    maxAmount: 10000,
    tenorMonths: 18,
    apr: 0.22,
  },
  {
    id: 'scale',
    label: 'Scale Capital',
    minScore: 740, // ~ Strong band and up
    minAmount: 8000,
    maxAmount: 20000,
    tenorMonths: 24,
    apr: 0.16,
  },
];

/**
 * Standard amortizing-loan monthly installment from principal, APR, and tenor.
 * monthly rate r = apr / 12; installment = P * r / (1 - (1 + r)^-n).
 * Degenerates to an even split (P / n) when apr is 0.
 */
export function installmentFor(principal: number, apr: number, tenorMonths: number): number {
  if (tenorMonths <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return principal / tenorMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -tenorMonths));
}

/** Highest-scoring tier the applicant qualifies for, or undefined if below the lowest tier. */
function selectTier(score: number, products: LoanProduct[]): LoanProduct | undefined {
  const eligible = products.filter((p) => p.minScore <= score);
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, p) => (p.minScore > best.minScore ? p : best));
}

/** Why affordablePrincipal came back with zero — distinguishes "no room at all" from "some room, but below this tier's floor". */
export type AffordabilityShortfall = 'no-headroom' | 'below-tier-minimum';

export interface AffordabilityResult {
  principal: number; // 0 if affordability rules out any offer in this tier
  shortfall?: AffordabilityShortfall; // present only when principal is 0
}

/**
 * Largest principal (within the tier's own range and the requested amount) whose installment
 * respects both the surplus-share cap and the DSR cap. Returns principal 0 if even the tier's
 * minimum amount would breach affordability, with a `shortfall` reason explaining why:
 * - 'no-headroom': the surplus/DSR caps leave no installment room at all (maxInstallment <= 0).
 * - 'below-tier-minimum': there is some headroom, but not enough to reach this tier's minAmount.
 */
function affordablePrincipal(
  tier: LoanProduct,
  requestedAmount: number,
  avgMonthlySurplus: number,
  monthlyDebtService: number,
  avgIncome: number
): AffordabilityResult {
  const ceiling = clamp(requestedAmount, tier.minAmount, tier.maxAmount);
  const surplusCapInstallment = Math.max(0, avgMonthlySurplus * MAX_INSTALLMENT_SHARE_OF_SURPLUS);
  const dsrCapInstallment = Math.max(0, avgIncome * MAX_DSR - monthlyDebtService);
  const maxInstallment = Math.min(surplusCapInstallment, dsrCapInstallment);

  if (maxInstallment <= 0) return { principal: 0, shortfall: 'no-headroom' };

  // Installment scales linearly with principal for a fixed apr/tenor, so solve by ratio
  // against the installment at the ceiling amount.
  const installmentAtCeiling = installmentFor(ceiling, tier.apr, tier.tenorMonths);
  if (installmentAtCeiling <= maxInstallment) return { principal: ceiling };

  const scaled = ceiling * (maxInstallment / installmentAtCeiling);
  if (scaled < tier.minAmount) return { principal: 0, shortfall: 'below-tier-minimum' };
  return { principal: Math.min(scaled, ceiling) };
}

/**
 * Apply Phase 6's coverage-tier filter to the eligible product set:
 *   < 30 covered days       → Emergency only, force REFER even if affordability would approve
 *   30 – 89 covered days    → Emergency + Starter
 *   ≥ 90 days AND ≥50% cov  → full ladder (today's behaviour)
 *   ≥ 90 days, < 50% cov    → Emergency + Starter (sparse coverage cap)
 *
 * Returns `{ products: filtered, forceRefer, reasons }`. When coverage inputs are omitted,
 * the original product list passes through unchanged and `forceRefer` is false.
 */
function applyCoverageTierFilter(
  products: LoanProduct[],
  coverageRatio: number | undefined,
  coverageDaysCovered: number | undefined
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
        {
          category: 'data-quality',
          text: `Coverage ${pct}% (${coverageDaysCovered} days of last 90) → Emergency Micro tier only; routed to manual review (REFER) regardless of affordability.`,
        },
      ],
    };
  }
  if (coverageDaysCovered < 90) {
    return {
      products: keep(['emergency', 'starter']),
      forceRefer: false,
      reasons: [
        {
          category: 'data-quality',
          text: `Coverage ${pct}% (${coverageDaysCovered} days of last 90) → eligibility capped to Starter Capital and below.`,
        },
      ],
    };
  }
  if (coverageRatio < 0.5) {
    return {
      products: keep(['emergency', 'starter']),
      forceRefer: false,
      reasons: [
        {
          category: 'data-quality',
          text: `90+ days of history but coverage is only ${pct}% — eligibility capped to Starter Capital and below until coverage reaches 50%.`,
        },
      ],
    };
  }
  return { products, forceRefer: false, reasons: [] };
}

/**
 * Decide a loan offer for an applicant. Pure and deterministic — same input always yields
 * the same output. Every branch records a human-readable reason.
 */
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
  // Flat strings stay derived from the categorized list so the two can never disagree.
  const finish = (decision: Decision, maxAmount: number, installment: number): LoanDecision => ({
    decision,
    maxAmount,
    installment,
    reasons: reasons.map((r) => r.text),
    categorizedReasons: reasons,
  });

  // Hard-adverse record overrides everything: decline outright.
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

  // Phase 6 — narrow eligibility by coverage *before* selecting a tier.
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
  if (affordability.principal <= 0) {
    const detail =
      affordability.shortfall === 'below-tier-minimum'
        ? `leave only enough room for an installment below this tier's minimum amount (${rm(tier.minAmount)})`
        : `leave no room for any installment at all`;
    reasons.push({
      category: 'affordability',
      text:
        `Affordability check failed: monthly surplus (${rm(avgMonthlySurplus)}) and existing debt service ` +
        `(${rm(monthlyDebtService)} of ${rm(avgIncome)} income) ${detail}.`,
    });
    return finish('decline', 0, 0);
  }
  const principal = affordability.principal;

  const installment = installmentFor(principal, tier.apr, tier.tenorMonths);
  reasons.push({
    category: 'affordability',
    text:
      `Approved amount capped at ${rm(principal)} so the installment (${rm(installment)}/mo over ${tier.tenorMonths} months ` +
      `at ${Math.round(tier.apr * 100)}% APR) stays within ${Math.round(MAX_INSTALLMENT_SHARE_OF_SURPLUS * 100)}% of avg surplus and a ${Math.round(MAX_DSR * 100)}% DSR cap.`,
  });
  if (principal < requestedAmount) {
    reasons.push({ category: 'affordability', text: `Requested ${rm(requestedAmount)} exceeds what affordability supports; offering ${rm(principal)} instead.` });
  }

  // Soft-adverse and low-confidence both flip an otherwise-clean approval to a human-reviewed referral.
  if (adverseRecord === 'soft') {
    reasons.push({ category: 'record', text: 'Minor adverse record on file — routed to manual review instead of auto-approval.' });
    return finish('refer', principal, installment);
  }
  if (confidence < MIN_CONFIDENCE_TO_APPROVE) {
    reasons.push({
      category: 'data-quality',
      text:
        `We could not verify enough of the recorded data (confidence ${Math.round(confidence * 100)}%, below the ` +
        `${Math.round(MIN_CONFIDENCE_TO_APPROVE * 100)}% auto-approval floor) — routed to manual review. More verified history would strengthen this application.`,
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
