import { buildCreditPrompt, CREDIT_COACH_SYSTEM_PROMPT } from '../src/llm/creditPrompt';
import type { CreditScore } from '../src/lib/creditScore';

const sampleScore: CreditScore = {
  score: 650,
  band: 'Good',
  confidence: 0.8,
  confidenceCapped: false,
  factors: [
    {
      key: 'cashflow',
      label: 'Cash-flow surplus & consistency',
      subScore: 72,
      weight: 0.25,
      contribution: 18,
      evidence: 'avg surplus RM500/mo, 10/12 months positive',
      explanation: 'Surplus is thin or uneven; widening the gap between income and spending helps most here.',
    },
    {
      key: 'savings',
      label: 'Savings rate',
      subScore: 45,
      weight: 0.15,
      contribution: 6.75,
      evidence: '10% of income retained',
      explanation: 'Saving 10–20% of income would lift this.',
    },
  ],
};

describe('buildCreditPrompt', () => {
  it('includes the band and numeric score', () => {
    const prompt = buildCreditPrompt(sampleScore);
    expect(prompt).toContain('Good');
    expect(prompt).toContain('650');
  });

  it('includes each factor label', () => {
    const prompt = buildCreditPrompt(sampleScore);
    expect(prompt).toContain('Cash-flow surplus & consistency');
    expect(prompt).toContain('Savings rate');
  });

  it('includes each factor subScore', () => {
    const prompt = buildCreditPrompt(sampleScore);
    expect(prompt).toContain('72');
    expect(prompt).toContain('45');
  });

  it('includes each factor evidence string', () => {
    const prompt = buildCreditPrompt(sampleScore);
    expect(prompt).toContain('avg surplus RM500/mo, 10/12 months positive');
    expect(prompt).toContain('10% of income retained');
  });

  it('ends with an improvement instruction', () => {
    const prompt = buildCreditPrompt(sampleScore);
    expect(prompt).toMatch(/improve/i);
  });
});

describe('CREDIT_COACH_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof CREDIT_COACH_SYSTEM_PROMPT).toBe('string');
    expect(CREDIT_COACH_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('mentions the sentence constraint', () => {
    expect(CREDIT_COACH_SYSTEM_PROMPT).toMatch(/sentences/i);
  });

  it('mentions Pip persona', () => {
    expect(CREDIT_COACH_SYSTEM_PROMPT).toMatch(/pip/i);
  });
});
