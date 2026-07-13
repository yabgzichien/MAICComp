// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// The deterministic loan-decision engine — ported verbatim from PipComp/src/lib/loans.ts.
// This suite guards port-sync (both ports must decide identically on identical inputs —
// checked structurally here; a byte-diff of the two files is the other half of that guard)
// and the omitted-policy regression (a caller who doesn't pass `policy` must get exactly
// today's historical behaviour via DEFAULT_POLICY).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  DEFAULT_PRODUCTS,
  decideLoan,
  installmentFor,
  type LenderPolicy,
  type LoanDecisionInput,
  type LoanProduct,
} from './loans';

// Comfortably affordable at the Growth tier (score 672 qualifies, RM5,000 request sits
// inside Growth's RM4,000–10,000 range with room to spare) so decision-path tests (soft
// record, confidence floor, coverage forcing) aren't accidentally gated by affordability.
const base = (): LoanDecisionInput => ({
  score: 672,
  confidence: 0.8,
  avgMonthlySurplus: 2000,
  monthlyDebtService: 200,
  avgIncome: 6000,
  requestedAmount: 5000,
  products: DEFAULT_PRODUCTS,
});

// ── installmentFor ────────────────────────────────────────────────────────────

describe('installmentFor', () => {
  it('matches the textbook amortization formula: P·r / (1 − (1+r)^−n)', () => {
    const principal = 10000;
    const apr = 0.24;
    const tenor = 12;
    const r = apr / 12;
    const expected = (principal * r) / (1 - Math.pow(1 + r, -tenor));
    expect(installmentFor(principal, apr, tenor)).toBeCloseTo(expected, 6);
  });

  it('degenerates to an even split when apr is 0', () => {
    expect(installmentFor(1200, 0, 12)).toBeCloseTo(100, 6);
  });

  it('is 0 for a non-positive tenor rather than dividing by zero', () => {
    expect(installmentFor(1000, 0.2, 0)).toBe(0);
    expect(installmentFor(1000, 0.2, -3)).toBe(0);
  });
});

// ── decideLoan — hard gates that short-circuit everything else ───────────────

describe('decideLoan — hard gates', () => {
  it('a hard adverse record declines outright with zero offer, category "record"', () => {
    const d = decideLoan({ ...base(), adverseRecord: 'hard' });
    expect(d.decision).toBe('decline');
    expect(d.maxAmount).toBe(0);
    expect(d.installment).toBe(0);
    expect(d.categorizedReasons?.[0].category).toBe('record');
    expect(d.breakdown).toBeUndefined();
  });

  it('an integrity-floor breach declines outright, category "integrity"', () => {
    const d = decideLoan({ ...base(), integrityFloorBreached: true });
    expect(d.decision).toBe('decline');
    expect(d.maxAmount).toBe(0);
    expect(d.categorizedReasons?.[0].category).toBe('integrity');
  });

  it('the integrity wording never reads as a fraud accusation (regulator finding AA2 lock)', () => {
    const d = decideLoan({ ...base(), integrityFloorBreached: true });
    const text = d.reasons.join(' ').toLowerCase();
    expect(text).not.toMatch(/breach/);
    expect(text).not.toMatch(/fabricat/);
    expect(text).not.toMatch(/fraud/);
    expect(text).not.toMatch(/\bfail/);
  });

  it('a hard adverse record takes priority over an integrity breach (both set)', () => {
    const d = decideLoan({ ...base(), adverseRecord: 'hard', integrityFloorBreached: true });
    expect(d.categorizedReasons?.[0].category).toBe('record');
  });
});

// ── Coverage-tier filter ──────────────────────────────────────────────────────

describe('decideLoan — coverage-tier filter', () => {
  it('below the emergency-only gate: Emergency Micro only, forced refer regardless of affordability', () => {
    const d = decideLoan({ ...base(), score: 900, requestedAmount: 300, coverageRatio: 0.9, coverageDaysCovered: 10 });
    expect(d.decision).toBe('refer');
    expect(d.categorizedReasons?.some((r) => r.category === 'data-quality' && /Emergency Micro tier only/.test(r.text))).toBe(true);
  });

  it('between the emergency and full-ladder gates: capped to Starter and below, not forced refer', () => {
    const d = decideLoan({ ...base(), score: 900, requestedAmount: 3000, coverageRatio: 0.9, coverageDaysCovered: 60 });
    // score 900 would otherwise reach Scale Capital — coverage caps it to Starter's ceiling instead.
    expect(d.breakdown?.tierLabel).toBe('Starter Capital');
  });

  it('full 90-day window but coverage ratio below the floor: still capped to Starter and below', () => {
    const d = decideLoan({ ...base(), score: 900, requestedAmount: 3000, coverageRatio: 0.3, coverageDaysCovered: 90 });
    expect(d.breakdown?.tierLabel).toBe('Starter Capital');
  });

  it('full window and healthy ratio: the complete ladder is available', () => {
    const d = decideLoan({ ...base(), score: 900, requestedAmount: 3000, coverageRatio: 0.9, coverageDaysCovered: 90 });
    expect(d.breakdown?.tierLabel).toBe('Scale Capital');
  });

  it('omitting coverage inputs entirely leaves the product set unrestricted (back-compat)', () => {
    const d = decideLoan({ ...base(), score: 900, requestedAmount: 3000 });
    expect(d.breakdown?.tierLabel).toBe('Scale Capital');
  });
});

// ── Tier selection ─────────────────────────────────────────────────────────────

describe('decideLoan — tier selection', () => {
  it('selects the highest-minScore tier the applicant still qualifies for', () => {
    const d = decideLoan({ ...base(), score: 650, requestedAmount: 3000 });
    expect(d.breakdown?.tierLabel).toBe('Growth Capital');
  });

  it('declines with a policy-category reason citing the lowest tier floor when score is below every tier', () => {
    const d = decideLoan({ ...base(), score: 100 });
    expect(d.decision).toBe('decline');
    expect(d.maxAmount).toBe(0);
    expect(d.categorizedReasons?.[0]).toMatchObject({ category: 'policy' });
    expect(d.reasons[0]).toContain('below the minimum tier threshold (300)');
    expect(d.breakdown).toBeUndefined();
  });

  it('cites the qualifying tier and the score that cleared it', () => {
    const d = decideLoan({ ...base(), score: 672 });
    expect(d.reasons.some((r) => r.includes('"Growth Capital"') && r.includes('scored 672'))).toBe(true);
  });
});

// ── Affordability ──────────────────────────────────────────────────────────────

/** Mirrors affordablePrincipal's own math using the exported installmentFor, so the
 *  waterfall/breakdown numbers are checked against an independently-callable primitive
 *  rather than asserted as unexplained magic floats. */
function expectedAffordability(tier: LoanProduct, requestedAmount: number, avgMonthlySurplus: number, monthlyDebtService: number, avgIncome: number, policy: LenderPolicy) {
  const ceiling = Math.max(tier.minAmount, Math.min(tier.maxAmount, requestedAmount));
  const surplusCapInstallment = Math.max(0, avgMonthlySurplus * policy.maxInstallmentShareOfSurplus);
  const dsrCapInstallment = Math.max(0, avgIncome * policy.maxDsr - monthlyDebtService);
  const installmentAtCeiling = installmentFor(ceiling, tier.apr, tier.tenorMonths);
  const principalFor = (cap: number) => (installmentAtCeiling > 0 ? ceiling * (cap / installmentAtCeiling) : 0);
  const surplusCapPrincipal = principalFor(surplusCapInstallment);
  const dsrCapPrincipal = principalFor(dsrCapInstallment);
  const maxInstallment = Math.min(surplusCapInstallment, dsrCapInstallment);
  let principal = 0;
  if (maxInstallment > 0) {
    if (installmentAtCeiling <= maxInstallment) principal = ceiling;
    else {
      const scaled = ceiling * (maxInstallment / installmentAtCeiling);
      principal = scaled < tier.minAmount ? 0 : Math.min(scaled, ceiling);
    }
  }
  return { ceiling, surplusCapPrincipal, dsrCapPrincipal, principal };
}

describe('decideLoan — affordability breakdown matches the exported amortization primitive', () => {
  it('a comfortably affordable request: offered equals the requested (clamped) ceiling', () => {
    const tier = DEFAULT_PRODUCTS.find((p) => p.id === 'growth')!;
    const exp = expectedAffordability(tier, 5000, 2000, 200, 6000, DEFAULT_POLICY);
    const d = decideLoan(base());
    expect(d.breakdown?.tierCeiling).toBe(exp.ceiling);
    expect(d.breakdown?.surplusCapPrincipal).toBeCloseTo(exp.surplusCapPrincipal, 6);
    expect(d.breakdown?.dsrCapPrincipal).toBeCloseTo(exp.dsrCapPrincipal, 6);
    expect(d.maxAmount).toBeCloseTo(exp.principal, 6);
    expect(d.maxAmount).toBe(exp.ceiling);
    expect(d.decision).toBe('approve');
  });

  it('a request that exceeds affordability: offered is scaled down to the supportable principal', () => {
    const tier = DEFAULT_PRODUCTS.find((p) => p.id === 'growth')!;
    const exp = expectedAffordability(tier, 9000, 1200, 120, 3500, DEFAULT_POLICY);
    const d = decideLoan({ ...base(), avgMonthlySurplus: 1200, monthlyDebtService: 120, avgIncome: 3500, requestedAmount: 9000 });
    expect(d.maxAmount).toBeCloseTo(exp.principal, 6);
    expect(d.maxAmount).toBeGreaterThan(4000); // clears Growth's minimum — a real (if reduced) offer
    expect(d.maxAmount).toBeLessThan(9000);
    expect(d.reasons.some((r) => /exceeds what affordability supports/.test(r))).toBe(true);
  });

  it('zero headroom (surplus and DSR caps both exhausted): declines with "no room at all" wording', () => {
    const d = decideLoan({ ...base(), avgMonthlySurplus: 0, monthlyDebtService: 2540, requestedAmount: 3000 });
    expect(d.decision).toBe('decline');
    expect(d.maxAmount).toBe(0);
    expect(d.reasons.some((r) => /leave no room for any installment at all/.test(r))).toBe(true);
  });

  it('some headroom but below the tier minimum: declines with the tier-minimum wording', () => {
    // Growth's minAmount is 4000; a thin surplus supports far less than that at 18mo/22% APR.
    const d = decideLoan({ ...base(), score: 672, avgMonthlySurplus: 50, monthlyDebtService: 0, avgIncome: 1000, requestedAmount: 4000 });
    expect(d.decision).toBe('decline');
    expect(d.reasons.some((r) => /below this tier's minimum amount/.test(r))).toBe(true);
  });

  it('cites the capped amount, installment, tenor, and APR in the affordability reason', () => {
    const d = decideLoan({ ...base(), score: 672, requestedAmount: 5000, avgMonthlySurplus: 900, monthlyDebtService: 100, avgIncome: 3000 });
    expect(d.reasons.some((r) => /Approved amount capped at RM/.test(r) && /35% of avg surplus/.test(r) && /40% DSR cap/.test(r))).toBe(true);
  });
});

// ── Referral gates (after an affordable tier is found) ────────────────────────

describe('decideLoan — referral gates', () => {
  it('a soft adverse record flips an otherwise-clean approval to refer, category "record"', () => {
    const d = decideLoan({ ...base(), adverseRecord: 'soft' });
    expect(d.decision).toBe('refer');
    expect(d.maxAmount).toBeGreaterThan(0);
    expect(d.categorizedReasons?.some((r) => r.category === 'record')).toBe(true);
  });

  it('confidence below the policy floor flips to refer, category "data-quality", with the honest wording', () => {
    const d = decideLoan({ ...base(), confidence: 0.3 });
    expect(d.decision).toBe('refer');
    expect(d.reasons.some((r) => /below the 50% auto-approval floor/.test(r))).toBe(true);
    expect(d.categorizedReasons?.some((r) => r.category === 'data-quality')).toBe(true);
  });

  it('coverage-forced-refer still carries an affordable offer amount, not zero', () => {
    const d = decideLoan({ ...base(), score: 900, requestedAmount: 300, coverageRatio: 0.9, coverageDaysCovered: 10 });
    expect(d.decision).toBe('refer');
    expect(d.maxAmount).toBeGreaterThan(0);
  });

  it('a clean file with no gates tripped auto-approves, category "policy", honest wording', () => {
    const d = decideLoan({ ...base(), score: 672, confidence: 0.9, requestedAmount: 2000 });
    expect(d.decision).toBe('approve');
    expect(d.reasons.some((r) => /Auto-approved: score, affordability, and data confidence/.test(r))).toBe(true);
  });
});

// ── reasons / categorizedReasons stay in lockstep ─────────────────────────────

describe('decideLoan — reasons/categorizedReasons never disagree', () => {
  it.each([
    { adverseRecord: 'hard' as const },
    { integrityFloorBreached: true },
    { score: 100 },
    { avgMonthlySurplus: 0, monthlyDebtService: 2540 },
    { adverseRecord: 'soft' as const },
    { confidence: 0.2 },
    {},
  ])('flat reasons is exactly categorizedReasons mapped to .text for scenario %#', (over) => {
    const d = decideLoan({ ...base(), ...over });
    expect(d.reasons).toEqual((d.categorizedReasons ?? []).map((r) => r.text));
  });
});

// ── Omitted-policy regression guard ───────────────────────────────────────────

describe('decideLoan — omitted policy reproduces DEFAULT_POLICY exactly', () => {
  it('an explicit DEFAULT_POLICY and an omitted policy decide byte-identically across a scenario matrix', () => {
    const scenarios: Partial<LoanDecisionInput>[] = [
      { score: 672, requestedAmount: 3000 },
      { score: 350, requestedAmount: 300 },
      { score: 900, requestedAmount: 20000, avgIncome: 10000, avgMonthlySurplus: 5000, monthlyDebtService: 200 },
      { score: 900, requestedAmount: 3000, coverageRatio: 0.2, coverageDaysCovered: 15 },
      { confidence: 0.3 },
      { adverseRecord: 'soft' },
      { adverseRecord: 'hard' },
      { integrityFloorBreached: true },
    ];
    for (const s of scenarios) {
      const withDefault = decideLoan({ ...base(), ...s, policy: DEFAULT_POLICY });
      const omitted = decideLoan({ ...base(), ...s });
      expect(omitted).toEqual(withDefault);
    }
  });

  it('a custom DSR cap is cited verbatim in the approval reason text', () => {
    const tight: LenderPolicy = { ...DEFAULT_POLICY, maxDsr: 0.1 };
    const d = decideLoan({ ...base(), policy: tight });
    expect(d.decision).toBe('approve');
    expect(d.reasons.some((r) => /10% DSR cap/.test(r))).toBe(true);
  });

  it('a DSR cap tight enough to actually bind reduces the offer below the unrestricted amount', () => {
    const tight: LenderPolicy = { ...DEFAULT_POLICY, maxDsr: 0.1 };
    const unrestricted = decideLoan({ ...base(), requestedAmount: 10000 });
    const restricted = decideLoan({ ...base(), requestedAmount: 10000, policy: tight });
    expect(restricted.maxAmount).toBeLessThan(unrestricted.maxAmount);
  });

  it('a custom confidence floor changes approve→refer at a confidence the default would have approved', () => {
    const strict: LenderPolicy = { ...DEFAULT_POLICY, minConfidenceToApprove: 0.9 };
    const withDefault = decideLoan({ ...base(), confidence: 0.7 });
    const withStrict = decideLoan({ ...base(), confidence: 0.7, policy: strict });
    expect(withDefault.decision).toBe('approve');
    expect(withStrict.decision).toBe('refer');
  });
});

// ── DEFAULT_PRODUCTS sanity (the shared ladder both apps ship) ────────────────

describe('DEFAULT_PRODUCTS', () => {
  it('is ordered ascending by minScore and covers the four canonical tier slots', () => {
    expect(DEFAULT_PRODUCTS.map((p) => p.id)).toEqual(['emergency', 'starter', 'growth', 'scale']);
    for (let i = 1; i < DEFAULT_PRODUCTS.length; i++) {
      expect(DEFAULT_PRODUCTS[i].minScore).toBeGreaterThan(DEFAULT_PRODUCTS[i - 1].minScore);
    }
  });

  it('every product has a sane min/max amount range and a plausible APR', () => {
    for (const p of DEFAULT_PRODUCTS) {
      expect(p.maxAmount).toBeGreaterThanOrEqual(p.minAmount);
      expect(p.apr).toBeGreaterThan(0);
      expect(p.apr).toBeLessThan(1);
    }
  });
});
