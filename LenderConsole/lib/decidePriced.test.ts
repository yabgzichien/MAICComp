// decidePriced (Brief R follow-up, 2026-07-22): the auto-approve path never had access to
// the officer's "adopt a discounted rate" trick — a file the engine approved outright was
// decided once, at the full ladder APR, final. This helper composes decideLoan and priceLoan
// so an auto-approval can get the same risk-based discount an officer could have given it,
// without decideLoan or priceLoan themselves changing.
import { describe, expect, it } from 'vitest';
import { decidePriced, type PricedLoanDecisionInput } from './decidePriced';
import { DEFAULT_POLICY, DEFAULT_PRODUCTS, decideLoan } from './loans';
import { priceLoan, repriceProducts } from './pricing';

// Base fixture: a comfortably-affordable, high-confidence, clean-standing file. Individual
// tests override score/band/amount/income/standingClean fields to land in the scenario
// they're probing.
const baseInput = (over: Partial<PricedLoanDecisionInput> = {}): PricedLoanDecisionInput => ({
  score: 750,
  band: 'Excellent',
  confidence: 0.9,
  avgMonthlySurplus: 5000,
  monthlyDebtService: 0,
  avgIncome: 8000,
  requestedAmount: 10000,
  products: DEFAULT_PRODUCTS,
  policy: DEFAULT_POLICY,
  standingClean: true,
  ...over,
});

describe('decidePriced', () => {
  it('(a) discounts a strong-band, high-surplus, clean file: lower installment, positive discount', () => {
    const input = baseInput(); // Excellent band, Scale Capital tier (apr 0.16) — break-even well under the ladder.
    const { decision, pricing, priced } = decidePriced(input);
    expect(decision.decision).toBe('approve');
    expect(pricing).not.toBeNull();
    expect(pricing!.discountBps).toBeGreaterThan(0);
    expect(pricing!.suggestedRate).toBeLessThan(pricing!.ladderApr);
    expect(priced.installment).toBeLessThan(decision.installment);
    // Same principal — the discount doesn't change what's affordable here, just the rate.
    expect(priced.maxAmount).toBe(decision.maxAmount);
  });

  it('(b) a weak-band file whose break-even meets/exceeds the ladder gets no discount', () => {
    // Building band (PD 0.25) on the Growth Capital tier (apr 0.22, minScore 620): break-even
    // + target (0.20 + 0.06 = 0.26) exceeds the ladder, so priceLoan clamps to the ladder rate.
    const input = baseInput({ score: 650, band: 'Building', requestedAmount: 6000 });
    const { decision, pricing, priced } = decidePriced(input);
    expect(decision.decision).toBe('approve');
    expect(pricing).not.toBeNull();
    expect(pricing!.discountBps).toBe(0);
    expect(pricing!.suggestedRate).toBe(pricing!.ladderApr);
    expect(priced).toBe(decision);
  });

  it('(c) the same strong file with standingClean: false gets no discount', () => {
    const clean = decidePriced(baseInput({ standingClean: true }));
    const notClean = decidePriced(baseInput({ standingClean: false }));
    expect(clean.pricing!.discountBps).toBeGreaterThan(0); // sanity: the clean run WOULD discount
    expect(notClean.pricing).not.toBeNull();
    expect(notClean.pricing!.discountBps).toBe(0);
    expect(notClean.pricing!.suggestedRate).toBe(notClean.pricing!.ladderApr);
    expect(notClean.priced).toBe(notClean.decision);
  });

  it('(d) an affordability-bound strong file gets a higher maxAmount once repriced lower', () => {
    // Scale Capital ceiling (20000) at the 16% ladder rate produces an installment above the
    // DSR cap (avgIncome*0.4 - debtService = 700/mo here), so the ladder-rate decision is
    // capped below the ceiling. The discounted rate lowers the installment for the same
    // principal, so the same DSR cap now affords more principal.
    const input = baseInput({ requestedAmount: 20000, avgIncome: 2000, monthlyDebtService: 100, avgMonthlySurplus: 3000 });
    const { decision, pricing, priced } = decidePriced(input);
    expect(decision.decision).toBe('approve');
    expect(decision.maxAmount).toBeLessThan(20000); // confirms the ladder-rate decision really was affordability-capped
    expect(pricing).not.toBeNull();
    expect(pricing!.discountBps).toBeGreaterThan(0);
    expect(priced.maxAmount).toBeGreaterThan(decision.maxAmount);
  });

  it('(e) priced.decision is always approve in every discounted case — it never flips', () => {
    const discountedCases = [baseInput(), baseInput({ requestedAmount: 20000, avgIncome: 2000, monthlyDebtService: 100, avgMonthlySurplus: 3000 })];
    for (const input of discountedCases) {
      const { pricing, priced } = decidePriced(input);
      expect(pricing!.discountBps).toBeGreaterThan(0); // confirms this case actually discounted
      expect(priced.decision).toBe('approve');
    }
  });

  it('(f) a referred input returns pricing: null and priced identical to decision', () => {
    // Confidence below the auto-approval floor (0.7) but above the consider floor (0.35) → refer.
    const input = baseInput({ confidence: 0.5 });
    const { decision, pricing, priced } = decidePriced(input);
    expect(decision.decision).toBe('refer');
    expect(decision.breakdown).toBeDefined();
    expect(pricing).toBeNull();
    expect(priced).toBe(decision);
  });

  it('(g) a declined input returns pricing: null and priced identical to decision', () => {
    // Confidence below the consider floor (0.35) → decline before any tier is even evaluated.
    const input = baseInput({ confidence: 0.1 });
    const { decision, pricing, priced } = decidePriced(input);
    expect(decision.decision).toBe('decline');
    expect(decision.breakdown).toBeUndefined();
    expect(pricing).toBeNull();
    expect(priced).toBe(decision);
  });

  it('(h) consistency: priced matches the officer\'s manual "adopt a suggested rate" recipe exactly (Console.tsx\'s repriceProducts + decideLoan)', () => {
    // decidePriced's re-decide step is deliberately the same two-step recipe Console.tsx's
    // onAdoptRate already used before this plan: repriceProducts(products, tierLabel, rate)
    // then decideLoan. Prove decidePriced does exactly that and nothing more by independently
    // reconstructing the officer's manual steps from the same input and asserting deep equality
    // against decidePriced's own `priced` result — not just checking properties of the outcome.
    const input = baseInput({ requestedAmount: 20000, avgIncome: 2000, monthlyDebtService: 100, avgMonthlySurplus: 3000 });
    const { decision, pricing, priced } = decidePriced(input);
    expect(decision.decision).toBe('approve');
    expect(pricing).not.toBeNull();
    expect(pricing!.discountBps).toBeGreaterThan(0); // sanity: this case actually discounts

    // Manually replicate the officer's "adopt" click: reprice the approved tier to the
    // suggested rate, then re-decide  computed independently of decidePriced's internals.
    const manuallyRepriced = repriceProducts(input.products, decision.breakdown!.tierLabel, pricing!.suggestedRate);
    const manualDecision = decideLoan({ ...input, products: manuallyRepriced });

    expect(priced).toEqual(manualDecision);
    expect(priced.maxAmount).toBe(manualDecision.maxAmount);
    expect(priced.installment).toBe(manualDecision.installment);
    expect(priced.decision).toBe(manualDecision.decision);

    // And confirm the suggested rate driving both sides is itself independently reproducible
    // from priceLoan given the same band/tier/policy/standing inputs decidePriced used.
    const tier = input.products.find((p) => p.label === decision.breakdown!.tierLabel)!;
    const independentPricing = priceLoan({
      band: input.band,
      ladderApr: tier.apr,
      costOfFunds: input.policy!.costOfFunds,
      targetReturn: input.policy!.targetReturn,
      standingClean: input.standingClean,
    });
    expect(independentPricing.suggestedRate).toBe(pricing!.suggestedRate);
  });

  it('does not mutate the input object or its products array', () => {
    const input = baseInput();
    const before = JSON.parse(JSON.stringify(input));
    decidePriced(input);
    expect(input).toEqual(before);
  });
});
