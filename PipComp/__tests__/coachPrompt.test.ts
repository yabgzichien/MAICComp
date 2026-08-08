import { buildCoachPrompt, coachPlanFallback, COACH_SYSTEM_PROMPT } from '../src/llm/coachPrompt';
import { buildCoachPlan, type CoachPlan, type CoachPlanInput } from '../src/lib/coachPlan';
import { DEFAULT_PRODUCTS } from '../src/lib/loans';
import type { CreditProfile } from '../src/lib/creditScore';
import type { Coverage } from '../src/lib/coverage';
import type { ConfidenceTxn } from '../src/lib/dataConfidence';

function txns(): ConfidenceTxn[] {
  const amounts = [312, 47, 128, 8, 233, 61, 19, 540, 87, 156, 24, 402];
  return amounts.map((amount) => ({ amount, source: 'verified' as const }));
}
function baseProfile(over: Partial<CreditProfile> = {}): CreditProfile {
  return {
    months: 3, avgIncome: 2500, incomeMonths: 3, avgSurplus: 900, positiveMonths: 3,
    savingsRate: 900 / 2500, monthlyDebtService: 0, adherenceWithinRatio: 1, netWorthSlope: 0,
    repaymentOnTime: 0, repaymentTotal: 0, confidence: 0.7, ...over,
  };
}
function coverageOf(daysCovered: number): Coverage {
  return { daysCovered, ratio: daysCovered / 90, recencyDays: 1, windowDays: 90 };
}
function planFor(input: Partial<CoachPlanInput> & Pick<CoachPlanInput, 'profile' | 'coverage'>) {
  return buildCoachPlan({ confidenceTxns: txns(), expenseRatio: 0.6, products: DEFAULT_PRODUCTS, ...input });
}

const thinFile = planFor({ profile: baseProfile(), coverage: coverageOf(20) });
const alreadyStrong = planFor({ profile: baseProfile({ avgSurplus: 5000, savingsRate: 2 }), coverage: coverageOf(90) });

describe('buildCoachPrompt', () => {
  it('includes the baseline band and the top action to narrate', () => {
    const prompt = buildCoachPrompt(thinFile);
    expect(prompt).toContain(thinFile.baseline.band);
    expect(prompt).toContain(thinFile.actions[0].label);
    expect(prompt).toMatch(/RM/);
  });

  it('still produces a prompt when there is nothing to improve', () => {
    const prompt = buildCoachPrompt(alreadyStrong);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain(alreadyStrong.baseline.band);
  });
});

describe('coachPlanFallback', () => {
  it('summarizes the top action deterministically when the LLM is unavailable', () => {
    const text = coachPlanFallback(thinFile);
    expect(text).toContain(thinFile.actions[0].label);
    expect(text).toMatch(/RM/);
  });

  it('gives an encouraging line when there is nothing to improve', () => {
    const text = coachPlanFallback(alreadyStrong);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(alreadyStrong.baseline.band);
  });
});

describe('COACH_SYSTEM_PROMPT', () => {
  it('constrains length and sets the Pip persona', () => {
    expect(COACH_SYSTEM_PROMPT).toMatch(/sentences/i);
    expect(COACH_SYSTEM_PROMPT).toMatch(/pip/i);
  });
});

describe('benchmark hint in narration', () => {
  function planWithHint(): CoachPlan {
    const base = {
      scoreFrom: 700, scoreTo: 720, bandFrom: 'Good' as const, bandTo: 'Good' as const,
      confidenceFrom: 0.6, confidenceTo: 0.65, decisionFrom: 'refer' as const,
      decisionTo: 'approve' as const, maxAmountFrom: 500, maxAmountTo: 3000,
    };
    return {
      baseline: { score: 700, band: 'Good', confidence: 0.6, decision: 'refer', maxAmount: 500 },
      diagnosis: { constraint: 'affordability', label: 'A tight monthly surplus', sim: base, gain: 1 },
      actions: [{
        lever: 'surplus', label: 'Free up RM300/mo of spending', magnitude: '-RM300/mo',
        sim: base, impact: 1, changed: true,
        sourceHint: 'Most of that could come from here: Recreation & Social runs RM400/mo above the national Belanjawanku guide for your household.',
      }],
      whatIfs: [],
    } as unknown as CoachPlan;
  }

  it('passes the hint to the model so its prose can be specific about where the money is', () => {
    const prompt = buildCoachPrompt(planWithHint());
    expect(prompt).toContain('Recreation & Social');
    expect(prompt).toContain('Belanjawanku');
  });

  it('keeps the hint in the deterministic fallback, so it survives with no AI at all', () => {
    const line = coachPlanFallback(planWithHint());
    expect(line).toContain('Recreation & Social');
    expect(line).toContain('RM400/mo above');
  });
});
