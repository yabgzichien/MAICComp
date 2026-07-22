// priceDecision (Task 4 code-review follow-up, 2026-07-22): the new decision point
// app/api/apply/route.ts's POST handler now goes through — merge standing + decidePriced on
// the happy path, degrade to a plain ladder-rate decideLoan on any throw. decidePriced and
// mergedStanding each have their own full unit-test suites already (decidePriced.test.ts,
// repaymentStanding.test.ts); this file covers only the wiring itself: that the happy path
// really does route through them (not silently equivalent to a bare decideLoan), and that a
// throw from mergedStanding is actually caught and produces the pre-Task-4-equivalent,
// publishable decision — not that either engine's own pricing math is right.
//
// No fixture here can reach mergedStanding's throw path through a real, signature-verified
// passport (verifyPassport's shape check would reject a passport with a malformed `standing`
// block long before priceDecision ever saw it) — this repo's own passport.test.ts documents
// why tests never construct an issuer-valid passport (P0.2/P0.3: the pinned issuer secret is
// never hardcoded in a test). So the throw here is forced the same way: a passport shaped to
// violate mergedStanding's own internal assumptions (`standing.current` present-but-empty),
// which is enough to prove the try/catch itself works without needing real crypto or a
// broader mocking setup this codebase doesn't otherwise use.
import { describe, expect, it } from 'vitest';
import { priceDecision } from './applyPricing';
import { decideLoan } from './loans';
import { decidePriced } from './decidePriced';
import { DEFAULT_STORED_POLICY } from './policyStore';
import type { CreditPassport, PassportAssessment } from './passport';
import type { CreditBand } from './securitization';

const SUBJECT = 'a'.repeat(64);
const REQUESTED_AMOUNT = 10000;

function basePassport(over: Partial<CreditPassport> = {}): CreditPassport {
  return {
    subject: SUBJECT,
    score: 750,
    band: 'Excellent',
    factorSummary: [],
    provenanceSummary: 'source trust 90%',
    evidenceHash: 'e'.repeat(64),
    repaymentRecord: { onTime: 6, total: 6 },
    issuedAt: '2026-06-01T00:00:00.000Z',
    validUntil: '2027-06-01T00:00:00.000Z',
    ...over,
  };
}

const ASSESSMENT: PassportAssessment = {
  confidence: 0.9,
  coverageRatio: 1,
  coverageDays: 90,
  avgIncome: 8000,
  avgMonthlySurplus: 5000,
  monthlyDebtService: 0,
};

function loanFields(passport: CreditPassport) {
  return {
    score: passport.score,
    confidence: ASSESSMENT.confidence,
    avgMonthlySurplus: ASSESSMENT.avgMonthlySurplus,
    monthlyDebtService: ASSESSMENT.monthlyDebtService,
    avgIncome: ASSESSMENT.avgIncome,
    requestedAmount: REQUESTED_AMOUNT,
    products: DEFAULT_STORED_POLICY.products,
    coverageRatio: ASSESSMENT.coverageRatio,
    coverageDaysCovered: ASSESSMENT.coverageDays,
    policy: DEFAULT_STORED_POLICY.policy,
  };
}

describe('priceDecision', () => {
  it('happy path: routes through mergedStanding + decidePriced, not a bare decideLoan', () => {
    const passport = basePassport(); // no standing block: mergedStanding treats it as clean
    const result = priceDecision(passport, ASSESSMENT, REQUESTED_AMOUNT, DEFAULT_STORED_POLICY, []);

    const expected = decidePriced({
      ...loanFields(passport),
      adverseRecord: 'none',
      band: passport.band as CreditBand,
      standingClean: true,
    });

    expect(result.priced).toEqual(expected.priced);
    expect(result.pricing).toEqual(expected.pricing);
    // Sanity: this fixture is set up to actually discount, so the assertion above is
    // meaningfully distinguishing the priced path from the ladder-rate one.
    expect(result.pricing).not.toBeNull();
    expect(result.pricing!.discountBps).toBeGreaterThan(0);
    expect(result.priced).not.toEqual(decideLoan(loanFields(passport)));
  });

  it('fallback: a throw from mergedStanding degrades to a plain ladder-rate decideLoan (pricing: null)', () => {
    // A malformed `standing` block (current present as a key but structurally empty) that
    // trips mergedStanding's own field access before it can return  see file header. Nothing
    // else about this passport or the stored policy is broken, so the fallback's plain
    // decideLoan call still has everything it needs to produce a normal, publishable decision.
    const passport = basePassport({
      standing: { current: undefined, scar: null, discountEligible: true } as unknown as CreditPassport['standing'],
    });

    const result = priceDecision(passport, ASSESSMENT, REQUESTED_AMOUNT, DEFAULT_STORED_POLICY, []);

    expect(result.pricing).toBeNull();
    expect(result.priced).toEqual(decideLoan(loanFields(passport)));
    // Confirms the fallback isn't just "safe" but actually still functional  the applicant
    // gets a real, publishable offer at the ladder rate, exactly as pre-Task-4.
    expect(result.priced.decision).toBe('approve');
    expect(result.priced.maxAmount).toBeGreaterThan(0);
  });
});
