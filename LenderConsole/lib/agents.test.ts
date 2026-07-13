// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Deterministic "multi-agent" assessment panel — the asymmetric-authority matrix is the
// project's core safety claim: specialists and the orchestrator can only ESCALATE caution
// toward a human, never soften or override the deterministic engine's verdict/amount. That
// asymmetry is the single most important thing this file guards.
import { describe, expect, it } from 'vitest';
import {
  assessAffordability,
  assessCredit,
  assessFraud,
  assessOrchestrator,
  assessRisk,
  runAgentPanel,
  type AgentAssessment,
  type StackingSignal,
} from './agents';
import { MIN_CONFIDENCE_TO_APPROVE, type LoanDecision } from './loans';
import type { CreditPassport, PassportAssessment, PassportSpendingProfile } from './passport';

const assessment = (over: Partial<PassportAssessment> = {}): PassportAssessment => ({
  confidence: 0.8,
  coverageRatio: 0.8,
  coverageDays: 90,
  avgIncome: 3000,
  avgMonthlySurplus: 900,
  monthlyDebtService: 150,
  ...over,
});

const decision = (over: Partial<LoanDecision> = {}): LoanDecision => ({
  decision: 'approve',
  maxAmount: 5000,
  installment: 300,
  reasons: [],
  ...over,
});

function passport(over: Partial<CreditPassport> = {}): CreditPassport {
  return {
    subject: 'a'.repeat(64),
    score: 700,
    band: 'Good',
    factorSummary: [
      { key: 'cashflow', subScore: 80 },
      { key: 'income', subScore: 70 },
      { key: 'savings', subScore: 40 },
    ],
    provenanceSummary: 'source trust 80%; Benford conformity 95%',
    evidenceHash: 'e'.repeat(64),
    repaymentRecord: { onTime: 4, total: 5 },
    issuedAt: '2026-06-01T00:00:00.000Z',
    validUntil: '2027-06-01T00:00:00.000Z',
    assessment: assessment(),
    ...over,
  } as CreditPassport;
}

// ── assessFraud ────────────────────────────────────────────────────────────────

describe('assessFraud', () => {
  it('is positive at high confidence with no stacking', () => {
    const a = assessFraud(assessment({ confidence: 0.9 }), 'clean provenance');
    expect(a.tone).toBe('positive');
    expect(a.verdict).toBe('Low risk');
    expect(a.confidence).toBe(90);
  });

  it('is caution between the approval floor and the high-confidence bar', () => {
    const a = assessFraud(assessment({ confidence: MIN_CONFIDENCE_TO_APPROVE + 0.05 }), 'ok');
    expect(a.tone).toBe('caution');
  });

  it('is negative below the auto-approval confidence floor', () => {
    const a = assessFraud(assessment({ confidence: MIN_CONFIDENCE_TO_APPROVE - 0.1 }), 'thin');
    expect(a.tone).toBe('negative');
    expect(a.verdict).toBe('High risk');
  });

  it('cites the confidence percentage and provenance summary as signals', () => {
    const a = assessFraud(assessment({ confidence: 0.62 }), 'source trust 70%');
    expect(a.signals).toContain('Data confidence 62%');
    expect(a.signals).toContain('source trust 70%');
  });

  describe('stacking — escalation only, never softens', () => {
    const stack = (priorCount: number): StackingSignal => ({ priorCount, lastAgo: '2 h ago', windowHours: 24 });

    it('a single prior presentment escalates a positive base tone to caution', () => {
      const a = assessFraud(assessment({ confidence: 0.95 }), 'clean', stack(1));
      expect(a.tone).toBe('caution');
    });

    it('3+ prior presentments escalate to negative regardless of confidence', () => {
      const a = assessFraud(assessment({ confidence: 0.95 }), 'clean', stack(3));
      expect(a.tone).toBe('negative');
    });

    it('never softens an already-negative base tone back down', () => {
      const a = assessFraud(assessment({ confidence: 0.1 }), 'thin', stack(0));
      expect(a.tone).toBe('negative');
    });

    it('cites the stacking count and recency when present', () => {
      const a = assessFraud(assessment({ confidence: 0.9 }), 'clean', stack(2));
      expect(a.signals.some((s) => s.includes('Presented 2 time(s)') && s.includes('2 h ago'))).toBe(true);
    });

    it('omits the stacking signal entirely when there is no prior history', () => {
      const a = assessFraud(assessment({ confidence: 0.9 }), 'clean', stack(0));
      expect(a.signals.some((s) => s.includes('Presented'))).toBe(false);
    });
  });

  it('cites observed income variance when an income-quality block is supplied', () => {
    const a = assessFraud(assessment(), 'clean', undefined, { variationCoefficient: 0.25, sourceCount: 2, regularityRatio: 0.9, seasonal: true });
    expect(a.signals.some((s) => s.includes('Observed income variance 25%') && s.includes('2 source(s)') && s.includes('seasonal'))).toBe(true);
  });

  it('omits the income-quality signal when absent (back-compat)', () => {
    const a = assessFraud(assessment(), 'clean');
    expect(a.signals.some((s) => s.includes('Observed income variance'))).toBe(false);
  });
});

// ── assessCredit ────────────────────────────────────────────────────────────────

describe('assessCredit', () => {
  it('is positive at score >= 700', () => {
    const a = assessCredit(passport({ score: 700 }));
    expect(a.tone).toBe('positive');
  });

  it('is caution between 550 and 699', () => {
    const a = assessCredit(passport({ score: 600 }));
    expect(a.tone).toBe('caution');
  });

  it('is negative below 550', () => {
    const a = assessCredit(passport({ score: 500 }));
    expect(a.tone).toBe('negative');
  });

  it('cites the score, average factor, and the single weakest factor', () => {
    const a = assessCredit(
      passport({ score: 672, factorSummary: [{ key: 'cashflow', subScore: 80 }, { key: 'track_record', subScore: 20 }] }),
    );
    expect(a.signals).toContain('Score 672/900');
    expect(a.signals).toContain('Avg factor 50/100');
    expect(a.signals.some((s) => s.includes('Weakest: track_record (20/100)'))).toBe(true);
  });

  it('confidence scales linearly with score out of 900', () => {
    const a = assessCredit(passport({ score: 450 }));
    expect(a.confidence).toBe(50);
  });
});

// ── assessAffordability ───────────────────────────────────────────────────────

describe('assessAffordability', () => {
  it('is Weak with zero confidence when there is no offer', () => {
    const a = assessAffordability(assessment(), decision({ maxAmount: 0 }));
    expect(a.tone).toBe('negative');
    expect(a.verdict).toBe('Weak');
    expect(a.confidence).toBe(0);
  });

  it('is Weak when average income is non-positive, even with a nominal offer', () => {
    const a = assessAffordability(assessment({ avgIncome: 0 }), decision({ maxAmount: 100 }));
    expect(a.tone).toBe('negative');
  });

  it('is Strong when DSR is comfortably under half the cap and surplus ratio is healthy', () => {
    const a = assessAffordability(assessment({ avgIncome: 3000, monthlyDebtService: 100, avgMonthlySurplus: 900 }), decision());
    expect(a.tone).toBe('positive');
    expect(a.verdict).toBe('Strong');
  });

  it('is Adequate (caution) when affordable but past the strong thresholds', () => {
    const a = assessAffordability(assessment({ avgIncome: 3000, monthlyDebtService: 1000, avgMonthlySurplus: 200 }), decision());
    expect(a.tone).toBe('caution');
    expect(a.verdict).toBe('Adequate');
  });

  it('cites DSR percentage, monthly surplus, and the approved amount', () => {
    const a = assessAffordability(assessment({ avgIncome: 2540, monthlyDebtService: 120, avgMonthlySurplus: 520 }), decision({ maxAmount: 2769 }));
    expect(a.signals).toContain('DSR 5%');
    expect(a.signals).toContain('Surplus RM520/mo');
    expect(a.signals).toContain('Approved RM2,769');
  });

  it('cites detected recurring obligations when a spending profile is supplied', () => {
    const spendingProfile: PassportSpendingProfile = {
      essentialsRatio: 0.6,
      expenseVolatility: 0.1,
      bufferDays: 10,
      savingsRate: 0.2,
      obligations: [
        { label: 'TNB Electric', kind: 'utilities', monthlyAmount: 70, monthsObserved: 3 },
        { label: 'Unifi Fibre', kind: 'utilities', monthlyAmount: 50, monthsObserved: 3 },
      ],
    };
    const a = assessAffordability(assessment(), decision(), spendingProfile);
    expect(a.signals.some((s) => s === '2 recurring obligation(s) evidence RM120/mo')).toBe(true);
  });

  it('omits the obligations signal when the spending profile has none or is absent', () => {
    const a = assessAffordability(assessment(), decision());
    expect(a.signals.some((s) => s.includes('recurring obligation'))).toBe(false);
  });
});

// ── assessRisk ────────────────────────────────────────────────────────────────

describe('assessRisk', () => {
  it('is negative under 30 covered days regardless of everything else', () => {
    const a = assessRisk(assessment({ coverageDays: 20, coverageRatio: 0.9 }), { onTime: 5, total: 5 });
    expect(a.tone).toBe('negative');
  });

  it('is caution between 30 and 89 days, or under 50% coverage ratio', () => {
    const a = assessRisk(assessment({ coverageDays: 60, coverageRatio: 0.9 }), { onTime: 5, total: 5 });
    expect(a.tone).toBe('caution');
  });

  it('is positive at 90+ days and >=50% coverage ratio with a clean repayment record', () => {
    const a = assessRisk(assessment({ coverageDays: 90, coverageRatio: 0.7 }), { onTime: 5, total: 5 });
    expect(a.tone).toBe('positive');
    expect(a.verdict).toBe('Low volatility');
  });

  it('demotes a positive tone to caution when on-time ratio is under 80%', () => {
    const a = assessRisk(assessment({ coverageDays: 90, coverageRatio: 0.7 }), { onTime: 3, total: 5 });
    expect(a.tone).toBe('caution');
  });

  it('never uses repayment history to upgrade an already-negative tone', () => {
    const a = assessRisk(assessment({ coverageDays: 20, coverageRatio: 0.9 }), { onTime: 0, total: 5 });
    expect(a.tone).toBe('negative');
  });

  it('reads "no repayment history yet" when total is zero, rather than a fabricated ratio', () => {
    const a = assessRisk(assessment({ coverageDays: 90, coverageRatio: 0.8 }), { onTime: 0, total: 0 });
    expect(a.signals).toContain('No repayment history yet');
  });

  it('cites coverage days and ratio, plus the on-time count when history exists', () => {
    const a = assessRisk(assessment({ coverageDays: 90, coverageRatio: 0.7 }), { onTime: 4, total: 5 });
    expect(a.signals).toContain('Coverage 90d, 70%');
    expect(a.signals).toContain('Repayment 4/5 on time');
  });
});

// ── assessOrchestrator — the escalation-only asymmetry (core safety claim) ────

describe('assessOrchestrator', () => {
  const specialist = (tone: AgentAssessment['tone'], id: AgentAssessment['id'] = 'fraud'): AgentAssessment => ({
    id,
    label: id,
    verdict: tone,
    tone,
    confidence: 80,
    signals: ['x'],
    rationale: 'r',
  });

  it('throws on an empty specialist list rather than fabricating a verdict', () => {
    expect(() => assessOrchestrator([], decision())).toThrow();
  });

  it('an engine DECLINE always concurs — the panel can never argue the borrower back in', () => {
    const o = assessOrchestrator([specialist('positive'), specialist('positive', 'credit')], decision({ decision: 'decline' }));
    expect(o.concurs).toBe(true);
    expect(o.tone).toBe('negative');
    expect(o.verdict).toBe('Recommend decline');
  });

  it('an engine REFER always concurs, even with all-positive specialists', () => {
    const o = assessOrchestrator([specialist('positive'), specialist('positive', 'credit')], decision({ decision: 'refer' }));
    expect(o.concurs).toBe(true);
    expect(o.tone).toBe('caution');
  });

  it('an engine APPROVE with a negative specialist DISSENTS toward caution — it never overturns the approval itself', () => {
    const o = assessOrchestrator([specialist('positive'), specialist('negative', 'risk')], decision({ decision: 'approve' }));
    expect(o.concurs).toBe(false);
    expect(o.tone).toBe('caution');
    expect(o.verdict).toMatch(/dissent/i);
  });

  it('an engine APPROVE with only caution-level specialists concurs, with conditions', () => {
    const o = assessOrchestrator([specialist('positive'), specialist('caution', 'risk')], decision({ decision: 'approve' }));
    expect(o.concurs).toBe(true);
    expect(o.tone).toBe('caution');
  });

  it('an engine APPROVE with every specialist positive is a clean concur-approve', () => {
    const o = assessOrchestrator([specialist('positive'), specialist('positive', 'credit')], decision({ decision: 'approve' }));
    expect(o.concurs).toBe(true);
    expect(o.tone).toBe('positive');
  });

  it('lists every non-positive specialist by label:verdict when flagging concerns', () => {
    const o = assessOrchestrator(
      [specialist('positive'), { ...specialist('negative', 'risk'), label: 'Risk & Stability', verdict: 'High volatility' }],
      decision({ decision: 'approve' }),
    );
    expect(o.signals).toContain('Risk & Stability: High volatility');
  });

  it('reports "all clear" when every specialist is positive', () => {
    const o = assessOrchestrator([specialist('positive'), specialist('positive', 'credit')], decision({ decision: 'approve' }));
    expect(o.signals[0]).toMatch(/all.*clear/i);
  });
});

// ── runAgentPanel ─────────────────────────────────────────────────────────────

describe('runAgentPanel', () => {
  it('throws when the passport carries no assessment block', () => {
    const p = passport();
    delete (p as { assessment?: unknown }).assessment;
    expect(() => runAgentPanel(p, decision())).toThrow(/assessment/i);
  });

  it('wires all four specialists plus the orchestrator', () => {
    const result = runAgentPanel(passport(), decision());
    expect(result.specialists.map((s) => s.id)).toEqual(['fraud', 'credit', 'affordability', 'risk']);
    expect(result.orchestrator.id).toBe('decision');
  });

  it('a hard decline produces a concurring, negative-tone orchestrator regardless of the passport quality', () => {
    const result = runAgentPanel(passport({ score: 850 }), decision({ decision: 'decline', maxAmount: 0 }));
    expect(result.orchestrator.concurs).toBe(true);
    expect(result.orchestrator.tone).toBe('negative');
  });

  it('threads a stacking signal into the fraud specialist only', () => {
    const stacking: StackingSignal = { priorCount: 4, lastAgo: 'just now', windowHours: 24 };
    const result = runAgentPanel(passport({ assessment: assessment({ confidence: 0.95 }) }), decision(), stacking);
    const fraud = result.specialists.find((s) => s.id === 'fraud')!;
    expect(fraud.tone).toBe('negative');
  });
});
