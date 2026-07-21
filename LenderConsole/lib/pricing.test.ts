// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Risk-based pricing assistant (Brief R) — computed AFTER decideLoan, never changes
// approve/refer/decline or the affordable principal. The one invariant to guard: the
// suggestion always sits between cost of funds (floor) and the published ladder APR
// (ceiling) — it discounts strong files, it never surcharges past the ladder.
import { describe, expect, it } from 'vitest';
import { priceLoan, repriceProducts, type PricingInputs } from './pricing';
import { DEFAULT_ASSUMPTIONS } from './securitization';
import type { LoanProduct } from './loans';

const inputs = (over: Partial<PricingInputs> = {}): PricingInputs => ({
  band: 'Good',
  ladderApr: 0.22,
  costOfFunds: 0.05,
  targetReturn: 0.06,
  ...over,
});

describe('priceLoan — PD and break-even math', () => {
  it('PD is the band base rate at zero fraud probability (approved loans cleared the fraud gate)', () => {
    const r = priceLoan(inputs({ band: 'Good' }));
    expect(r.pd).toBe(DEFAULT_ASSUMPTIONS.bandPD.Good);
  });

  it('expected loss rate is PD × LGD, using the default LGD when not overridden', () => {
    const r = priceLoan(inputs({ band: 'Good' }));
    expect(r.expectedLossRate).toBeCloseTo(DEFAULT_ASSUMPTIONS.bandPD.Good * DEFAULT_ASSUMPTIONS.lgd, 9);
  });

  it('a custom LGD overrides the default in the expected-loss calc', () => {
    const withDefault = priceLoan(inputs({ band: 'Good' }));
    const withCustom = priceLoan(inputs({ band: 'Good', lgd: 0.9 }));
    expect(withCustom.expectedLossRate).toBeCloseTo(DEFAULT_ASSUMPTIONS.bandPD.Good * 0.9, 9);
    expect(withCustom.expectedLossRate).toBeGreaterThan(withDefault.expectedLossRate);
  });

  it('break-even rate is cost of funds plus expected loss', () => {
    const r = priceLoan(inputs({ costOfFunds: 0.05, band: 'Good' }));
    expect(r.breakEvenRate).toBeCloseTo(0.05 + DEFAULT_ASSUMPTIONS.bandPD.Good * DEFAULT_ASSUMPTIONS.lgd, 9);
  });

  it('a weaker band (higher PD) has a higher break-even rate than a stronger band', () => {
    const weak = priceLoan(inputs({ band: 'Building' }));
    const strong = priceLoan(inputs({ band: 'Excellent' }));
    expect(weak.breakEvenRate).toBeGreaterThan(strong.breakEvenRate);
  });
});

describe('priceLoan — the ceiling and floor guarantee', () => {
  it('discounts a strong file below the ladder rate when break-even + target allows it', () => {
    // Excellent band: PD 0.02, LGD 0.6 → EL 0.012; break-even 0.062; +6% target = 0.122, well under 22% ladder.
    const r = priceLoan(inputs({ band: 'Excellent', ladderApr: 0.22, costOfFunds: 0.05, targetReturn: 0.06 }));
    expect(r.suggestedRate).toBeLessThan(r.ladderApr);
    expect(r.discountBps).toBeGreaterThan(0);
    expect(r.discountBps).toBe(Math.round((r.ladderApr - r.suggestedRate) * 10000));
  });

  it('never suggests a rate above the published ladder APR, even for a weak band', () => {
    // Building band: PD 0.25, LGD 0.6 → EL 0.15; break-even 0.20; +6% target = 0.26 > 16% ladder → clamped.
    const r = priceLoan(inputs({ band: 'Building', ladderApr: 0.16, costOfFunds: 0.05, targetReturn: 0.06 }));
    expect(r.suggestedRate).toBe(r.ladderApr);
    expect(r.discountBps).toBe(0);
  });

  it('never suggests a rate below the lender\'s cost of funds', () => {
    // A deliberately negative target return is the only way to probe the floor from above —
    // break-even alone (cost of funds + expected loss) can never itself dip below cost of funds.
    const r = priceLoan(inputs({ band: 'Excellent', costOfFunds: 0.05, targetReturn: -0.5 }));
    expect(r.suggestedRate).toBeGreaterThanOrEqual(0.05);
    expect(r.suggestedRate).toBe(0.05);
  });

  it('the unit economics for both the ladder rate and the suggested rate share the same expected loss', () => {
    const r = priceLoan(inputs({ band: 'Good' }));
    expect(r.ladder.expectedLoss).toBe(r.suggested.expectedLoss);
    expect(r.ladder.rate).toBe(r.ladderApr);
    expect(r.suggested.rate).toBe(r.suggestedRate);
  });

  it('net margin is rate minus cost of funds minus expected loss, for both rates', () => {
    const r = priceLoan(inputs({ band: 'Good', costOfFunds: 0.05 }));
    expect(r.ladder.netMargin).toBeCloseTo(r.ladderApr - 0.05 - r.expectedLossRate, 9);
    expect(r.suggested.netMargin).toBeCloseTo(r.suggestedRate - 0.05 - r.expectedLossRate, 9);
  });
});

describe('priceLoan — reasons narration', () => {
  it('cites the band, PD, and expected loss in the first reason', () => {
    const r = priceLoan(inputs({ band: 'Good' }));
    expect(r.reasons[0]).toContain('Good');
    expect(r.reasons[0]).toMatch(/Default probability/);
  });

  it('cites cost of funds and expected loss composing the break-even in the second reason', () => {
    const r = priceLoan(inputs());
    expect(r.reasons[1]).toMatch(/Break-even/);
  });

  it('the third reason cites a bps discount when discounted, or states the ladder stands when clamped', () => {
    const discounted = priceLoan(inputs({ band: 'Excellent', ladderApr: 0.22 }));
    expect(discounted.reasons[2]).toMatch(/bps discount/);
    const clamped = priceLoan(inputs({ band: 'Building', ladderApr: 0.10 }));
    expect(clamped.reasons[2]).toMatch(/ladder rate .* stands/i);
  });

  it('always returns exactly three reasons', () => {
    expect(priceLoan(inputs()).reasons).toHaveLength(3);
  });
});

describe('standingClean guard', () => {
  const standingInputs = { band: 'Good' as const, ladderApr: 0.22, costOfFunds: 0.05, targetReturn: 0.06 };

  it('suggests a discount below the ladder when standing is clean', () => {
    const r = priceLoan({ ...standingInputs, standingClean: true });
    expect(r.suggestedRate).toBeLessThanOrEqual(r.ladderApr);
  });

  it('clamps to the ladder rate outright when standing is not clean, regardless of band/PD', () => {
    const r = priceLoan({ ...standingInputs, standingClean: false });
    expect(r.suggestedRate).toBe(r.ladderApr);
    expect(r.discountBps).toBe(0);
    expect(r.reasons.some((s) => s.includes('arrears'))).toBe(true);
  });

  it('defaults standingClean to true (back-compat: existing callers keep today\'s behavior)', () => {
    const withFlag = priceLoan({ ...standingInputs, standingClean: true });
    const withoutFlag = priceLoan(standingInputs as PricingInputs);
    expect(withoutFlag.suggestedRate).toBe(withFlag.suggestedRate);
  });
});

// ── repriceProducts ────────────────────────────────────────────────────────────

describe('repriceProducts', () => {
  const products: LoanProduct[] = [
    { id: 'starter', label: 'Starter Capital', minScore: 500, minAmount: 2000, maxAmount: 5000, tenorMonths: 12, apr: 0.28 },
    { id: 'growth', label: 'Growth Capital', minScore: 620, minAmount: 4000, maxAmount: 10000, tenorMonths: 18, apr: 0.22 },
  ];

  it('replaces only the matching tier\'s APR, matched by label', () => {
    const out = repriceProducts(products, 'Growth Capital', 0.18);
    expect(out.find((p) => p.label === 'Growth Capital')!.apr).toBe(0.18);
    expect(out.find((p) => p.label === 'Starter Capital')!.apr).toBe(0.28);
  });

  it('leaves the product array unchanged when no tier matches the label', () => {
    const out = repriceProducts(products, 'Scale Capital', 0.1);
    expect(out).toEqual(products);
  });

  it('does not mutate the input array', () => {
    const before = JSON.parse(JSON.stringify(products));
    repriceProducts(products, 'Growth Capital', 0.18);
    expect(products).toEqual(before);
  });

  it('preserves every other field on the repriced tier — only apr changes', () => {
    const out = repriceProducts(products, 'Growth Capital', 0.18);
    const growth = out.find((p) => p.label === 'Growth Capital')!;
    expect(growth).toMatchObject({ id: 'growth', minScore: 620, minAmount: 4000, maxAmount: 10000, tenorMonths: 18 });
  });
});
