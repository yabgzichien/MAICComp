// Pure policy validation + defaults for the Lender Policy Editor (Brief N).
// Client-safe (no fs  file I/O lives in policyFile.ts, server-only): the Policy tab
// imports this for live field validation, the /api/policy route for PUT validation,
// and /api/lenders composes TEKUN's published entry from the same stored shape 
// so what the lender configures is exactly what borrowers are coached toward.

import { DEFAULT_POLICY, DEFAULT_PRODUCTS, type LenderPolicy, type LoanProduct } from './loans';

/** What persists: the thresholds + the product ladder + a server-stamped edit time.
 *  `updatedAt` absent = the defaults, never edited. */
export interface StoredPolicy {
  policy: LenderPolicy;
  products: LoanProduct[];
  updatedAt?: string;
}

export const DEFAULT_STORED_POLICY: StoredPolicy = {
  policy: DEFAULT_POLICY,
  products: DEFAULT_PRODUCTS,
};

/** The engine's coverage gates keep products by these ids (applyCoverageTierFilter),
 *  so a ladder using any other id would silently fall out of thin-coverage eligibility 
 *  same rule lenderRegistry.ts documents. Lender-specific naming belongs in `label`. */
export const CANONICAL_TIER_IDS = ['emergency', 'starter', 'growth', 'scale'] as const;

export type PolicyValidation = { ok: true; value: StoredPolicy } | { ok: false; errors: string[] };

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The coverage measurement window is fixed at 90 days (lib/coverage.ts on the borrower
 *  side); a day-gate beyond it could never be satisfied. */
const COVERAGE_WINDOW_DAYS = 90;

/**
 * Field-by-field validation: every failure names its field so the editor can point at
 * the exact input (and a malformed PUT is rejected with an actionable message, never a
 * blanket 400). On success, returns a CLEAN value  only known keys are kept, so junk
 * can't ride into the persisted file.
 */
export function validateStoredPolicy(raw: unknown): PolicyValidation {
  const errors: string[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Body must be an object with "policy" and "products".'] };
  }
  const o = raw as Record<string, unknown>;

  // ── Thresholds ──────────────────────────────────────────────────────────────
  const p = o.policy as Record<string, unknown> | undefined;
  if (p === null || typeof p !== 'object' || Array.isArray(p)) {
    errors.push('policy: missing or not an object.');
  } else {
    const ratio = (field: string): number | undefined => {
      const v = p[field];
      if (!isFiniteNum(v) || v <= 0 || v > 1) {
        errors.push(`policy.${field}: must be a number greater than 0 and at most 1 (e.g. 0.4 for 40%).`);
        return undefined;
      }
      return v;
    };
    const days = (field: string): number | undefined => {
      const v = p[field];
      if (!isFiniteNum(v) || !Number.isInteger(v) || v < 0 || v > COVERAGE_WINDOW_DAYS) {
        errors.push(`policy.${field}: must be a whole number of days between 0 and ${COVERAGE_WINDOW_DAYS}.`);
        return undefined;
      }
      return v;
    };
    const minConfidenceToApprove = ratio('minConfidenceToApprove');
    const maxInstallmentShareOfSurplus = ratio('maxInstallmentShareOfSurplus');
    const maxDsr = ratio('maxDsr');
    const emergencyOnlyBelowDays = days('emergencyOnlyBelowDays');
    const fullLadderFromDays = days('fullLadderFromDays');
    const minCoverageRatioForFullLadder = ratio('minCoverageRatioForFullLadder');
    const costOfFunds = ratio('costOfFunds');
    const targetReturn = ratio('targetReturn');
    if (
      emergencyOnlyBelowDays !== undefined &&
      fullLadderFromDays !== undefined &&
      emergencyOnlyBelowDays > fullLadderFromDays
    ) {
      errors.push('policy.emergencyOnlyBelowDays: cannot exceed policy.fullLadderFromDays. The gates would invert.');
    }
    if (errors.length === 0) {
      const products = validateProducts(o.products, errors);
      if (errors.length === 0 && products) {
        return {
          ok: true,
          value: {
            policy: {
              minConfidenceToApprove: minConfidenceToApprove!,
              maxInstallmentShareOfSurplus: maxInstallmentShareOfSurplus!,
              maxDsr: maxDsr!,
              emergencyOnlyBelowDays: emergencyOnlyBelowDays!,
              fullLadderFromDays: fullLadderFromDays!,
              minCoverageRatioForFullLadder: minCoverageRatioForFullLadder!,
              costOfFunds: costOfFunds!,
              targetReturn: targetReturn!,
            },
            products,
          },
        };
      }
      return { ok: false, errors };
    }
  }
  // Still surface ladder errors alongside threshold errors for a single actionable reply.
  validateProducts(o.products, errors);
  return { ok: false, errors };
}

function validateProducts(raw: unknown, errors: string[]): LoanProduct[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push('products: missing or not an array.');
    return undefined;
  }
  if (raw.length === 0) {
    errors.push('products: the ladder needs at least one tier.');
    return undefined;
  }
  const seen = new Set<string>();
  const clean: LoanProduct[] = [];
  raw.forEach((r, i) => {
    const t = r as Record<string, unknown>;
    const at = `products[${i}]`;
    if (t === null || typeof t !== 'object') {
      errors.push(`${at}: not an object.`);
      return;
    }
    const id = t.id;
    if (typeof id !== 'string' || !(CANONICAL_TIER_IDS as readonly string[]).includes(id)) {
      errors.push(`${at}.id: must be one of ${CANONICAL_TIER_IDS.join(' | ')} (the engine's coverage gates key on these).`);
    } else if (seen.has(id)) {
      errors.push(`${at}.id: duplicate tier "${id}"  each slot may appear once.`);
    } else {
      seen.add(id);
    }
    if (typeof t.label !== 'string' || t.label.trim().length === 0) errors.push(`${at}.label: required.`);
    if (!isFiniteNum(t.minScore) || t.minScore < 300 || t.minScore > 900) errors.push(`${at}.minScore: must be a score between 300 and 900.`);
    if (!isFiniteNum(t.minAmount) || t.minAmount <= 0) errors.push(`${at}.minAmount: must be a positive amount.`);
    if (!isFiniteNum(t.maxAmount) || t.maxAmount <= 0) errors.push(`${at}.maxAmount: must be a positive amount.`);
    if (isFiniteNum(t.minAmount) && isFiniteNum(t.maxAmount) && t.minAmount > t.maxAmount) {
      errors.push(`${at}: minAmount (${t.minAmount}) exceeds maxAmount (${t.maxAmount}).`);
    }
    if (!isFiniteNum(t.tenorMonths) || !Number.isInteger(t.tenorMonths) || t.tenorMonths <= 0) errors.push(`${at}.tenorMonths: must be a positive whole number of months.`);
    if (!isFiniteNum(t.apr) || t.apr < 0 || t.apr > 1) errors.push(`${at}.apr: must be a decimal rate between 0 and 1 (e.g. 0.22 for 22%).`);
    clean.push({
      id: id as string,
      label: t.label as string,
      minScore: t.minScore as number,
      minAmount: t.minAmount as number,
      maxAmount: t.maxAmount as number,
      tenorMonths: t.tenorMonths as number,
      apr: t.apr as number,
    });
  });
  return errors.length === 0 ? clean : undefined;
}

/** Advisory only, never a rejection (the seeded Emergency tier itself sits at 36%):
 *  tiers priced above 30% APR get a warning the editor shows beside the row. */
export const APR_WARN_THRESHOLD = 0.3;

export function aprWarnings(products: LoanProduct[]): string[] {
  return products
    .filter((p) => p.apr > APR_WARN_THRESHOLD)
    .map((p) => `${p.label}: ${Math.round(p.apr * 100)}% APR is above the ${Math.round(APR_WARN_THRESHOLD * 100)}% advisory ceiling. High-cost credit draws scrutiny under the CCA 2025.`);
}
