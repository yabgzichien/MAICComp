// Demo Data plan Task 5 (spec §C): the 13-persona console applicant mix. Every entry is a
// real signed passport — these tests run it through the actual verify + decision engines
// so the seeded pipeline's queue counts and demo beats (watchlist, stacking, counter-offer)
// are proven, not just eyeballed. Regenerate via PipComp/tools/demoPassport/generateApplicants.js.
import { describe, expect, it } from 'vitest';
import { DEMO_APPLICANTS } from '../app/demoApplicants';
import { parsePassportCode, verifyPassport } from './passport';
import { decideLoan, DEFAULT_PRODUCTS } from './loans';
import { counterOfferFor } from './counterOffer';
import { diffCheckIn } from './earlyWarning';

function evaluated(entry: (typeof DEMO_APPLICANTS)[number]) {
  const parsed = parsePassportCode(entry.code);
  const verify = verifyPassport(parsed.passport, parsed.signature, parsed.issuerSignature);
  const a = parsed.passport.assessment!;
  const decision = decideLoan({
    score: parsed.passport.score,
    confidence: a.confidence,
    avgMonthlySurplus: a.avgMonthlySurplus,
    monthlyDebtService: a.monthlyDebtService,
    avgIncome: a.avgIncome,
    requestedAmount: entry.requestedAmount,
    products: DEFAULT_PRODUCTS,
    coverageRatio: a.coverageRatio,
    coverageDaysCovered: a.coverageDays,
  });
  return { parsed, verify, decision };
}

describe('DEMO_APPLICANTS (13-persona mix)', () => {
  it('has exactly 13 entries', () => {
    expect(DEMO_APPLICANTS).toHaveLength(13);
  });

  it('every entry verifies under the pinned issuer key', () => {
    for (const entry of DEMO_APPLICANTS) {
      const { verify } = evaluated(entry);
      expect(verify.valid, `${entry.label} should verify`).toBe(true);
    }
  });

  it('spans the spec §C role mix', () => {
    const byRole = (role: string) => DEMO_APPLICANTS.filter((d) => d.role === role);
    expect(byRole('approve')).toHaveLength(6);
    expect(byRole('refer-confidence')).toHaveLength(1);
    expect(byRole('refer-coverage')).toHaveLength(1);
    expect(byRole('counter-offer')).toHaveLength(1);
    expect(byRole('decline-affordability')).toHaveLength(1);
    expect(byRole('decline-policy')).toHaveLength(1);
    expect(byRole('checkin')).toHaveLength(1);
    expect(byRole('stacking-duplicate')).toHaveLength(1);
  });

  it('approvals span Fair, Good, and Strong bands', () => {
    const bands = new Set(
      DEMO_APPLICANTS.filter((d) => d.role === 'approve').map((d) => evaluated(d).parsed.passport.band),
    );
    expect(bands.has('Fair')).toBe(true);
    expect(bands.has('Good')).toBe(true);
    expect(bands.has('Strong')).toBe(true);
  });

  it.each(DEMO_APPLICANTS.filter((d) => d.expectedVerdict))('$label decides $expectedVerdict', (entry) => {
    const { decision } = evaluated(entry as (typeof DEMO_APPLICANTS)[number]);
    expect(decision.decision).toBe((entry as (typeof DEMO_APPLICANTS)[number]).expectedVerdict);
  });

  it('the counter-offer case yields a positive offer below the request', () => {
    const entry = DEMO_APPLICANTS.find((d) => d.role === 'counter-offer')!;
    const { decision } = evaluated(entry);
    const counter = counterOfferFor(decision, entry.requestedAmount);
    expect(counter).not.toBeNull();
    expect(counter!.amount).toBeGreaterThan(0);
    expect(counter!.amount).toBeLessThan(entry.requestedAmount);
  });

  it('the watchlist check-in diffs against its base into at least one active flag', () => {
    const base = DEMO_APPLICANTS.find((d) => d.role === 'approve' && d.label === 'Siti Aminah binti Kassim')!;
    const checkin = DEMO_APPLICANTS.find((d) => d.role === 'checkin')!;
    expect(checkin.pairsWithLabel).toBe(base.label);
    const { parsed: basePassport } = evaluated(base);
    const { parsed: checkinPassport } = evaluated(checkin);
    const result = diffCheckIn(basePassport.passport, checkinPassport.passport);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it('the stacking duplicate re-lists an existing approval\'s exact code', () => {
    const dup = DEMO_APPLICANTS.find((d) => d.role === 'stacking-duplicate')!;
    const base = DEMO_APPLICANTS.find((d) => d.label === dup.duplicateOfLabel)!;
    expect(dup.code).toBe(base.code);
  });

  it('the two declines use distinct reason categories (affordability vs. policy)', () => {
    const affordability = DEMO_APPLICANTS.find((d) => d.role === 'decline-affordability')!;
    const policy = DEMO_APPLICANTS.find((d) => d.role === 'decline-policy')!;
    const { decision: d1 } = evaluated(affordability);
    const { decision: d2 } = evaluated(policy);
    expect(d1.decision).toBe('decline');
    expect(d2.decision).toBe('decline');
    const categories1 = new Set(d1.categorizedReasons?.map((r) => r.category));
    const categories2 = new Set(d2.categorizedReasons?.map((r) => r.category));
    expect(categories1.has('affordability')).toBe(true);
    expect(categories2.has('policy')).toBe(true);
  });
});
