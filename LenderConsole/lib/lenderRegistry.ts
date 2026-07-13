// Static lender registry served by GET /api/lenders  the Lender Match flywheel's
// publish side. Each profile is public rate-sheet-equivalent information (no PII):
// display identity + loan product ladder in the exact LoanProduct shape the borrower
// app's engine consumes. A known hackathon simplification: three profiles from one
// console stand in for a real multi-lender directory (see the flywheel design spec).
//
// Product `id`s are CANONICAL TIER SLOTS ('emergency' | 'starter' | 'growth' | 'scale'),
// not free-form names  the borrower engine's coverage gates keep products by these ids
// (loans.ts applyCoverageTierFilter), so a ladder using other ids would silently fall out
// of thin-coverage eligibility. Lender-specific naming belongs in `label`.

import { DEFAULT_POLICY, DEFAULT_PRODUCTS, type LenderPolicy, type LoanProduct } from './loans';
import type { StoredPolicy } from './policyStore';

export interface LenderProfile {
  id: string;
  name: string;
  blurb: string;
  brandColor: string;
  products: LoanProduct[];
  /** Published affordability thresholds (Brief N)  the same policy the console
   *  decides with, so borrower-side simulations track the lender's real criteria.
   *  Optional for wire back-compat with borrower apps that predate it. */
  policy?: LenderPolicy;
}

export const LENDER_REGISTRY: LenderProfile[] = [
  {
    id: 'tekun',
    name: 'TEKUN Nasional',
    blurb: 'Government micro-financing agency  the full four-tier ladder, built for first-time micro-entrepreneurs.',
    brandColor: '#0f2d5c',
    // Reuses the engine's ladder unchanged, so today's console behaviour is identical.
    products: DEFAULT_PRODUCTS,
    policy: DEFAULT_POLICY,
  },
  {
    id: 'koperasi-sejahtera',
    name: 'Koperasi Usahawan Sejahtera',
    blurb: 'Member-owned credit cooperative  the cheapest rates in the directory, but a stricter score bar and no emergency tier.',
    brandColor: '#1f8a5b',
    products: [
      { id: 'starter', label: 'Anggota Starter', minScore: 560, minAmount: 1000, maxAmount: 4000, tenorMonths: 12, apr: 0.14 },
      { id: 'growth', label: 'Anggota Growth', minScore: 680, minAmount: 5000, maxAmount: 12000, tenorMonths: 18, apr: 0.12 },
    ],
    policy: DEFAULT_POLICY,
  },
  {
    id: 'dana-niaga',
    name: 'Dana Niaga Capital',
    blurb: 'Digital micro-lender  accessible entry tiers with fast decisions, priced higher but capped below 30% APR.',
    brandColor: '#b45309',
    products: [
      { id: 'emergency', label: 'Micro Boost', minScore: 400, minAmount: 300, maxAmount: 1500, tenorMonths: 6, apr: 0.28 },
      { id: 'starter', label: 'Niaga Flex', minScore: 600, minAmount: 2000, maxAmount: 8000, tenorMonths: 12, apr: 0.24 },
    ],
    policy: DEFAULT_POLICY,
  },
];

/**
 * Publish the directory with TEKUN's entry composed from the STORED policy (Brief N):
 * the ladder + thresholds the Policy tab edits are exactly what borrowers are coached
 * toward. The two demo lenders stay static  they exist to give the borrower-side
 * picker genuine variation, not to be editable.
 */
export function composeRegistry(stored: StoredPolicy): LenderProfile[] {
  return LENDER_REGISTRY.map((l) =>
    l.id === 'tekun' ? { ...l, products: stored.products, policy: stored.policy } : l,
  );
}
