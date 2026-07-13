import { describe, expect, it } from 'vitest';
import { buildCreditMemo, memoToMarkdown, fallbackNarrative } from './creditMemo';
import { runAgentPanel } from './agents';
import type { CreditPassport, PassportAssessment } from './passport';
import type { LoanDecision } from './loans';

function makeAssessment(overrides: Partial<PassportAssessment> = {}): PassportAssessment {
  return {
    confidence: 0.8,
    coverageRatio: 0.9,
    coverageDays: 90,
    avgIncome: 3000,
    avgMonthlySurplus: 900,
    monthlyDebtService: 200,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<LoanDecision> = {}): LoanDecision {
  return {
    decision: 'approve',
    maxAmount: 5000,
    installment: 300,
    reasons: ['Qualifies for the "Growth Capital" tier.', 'Auto-approved: all thresholds clear.'],
    ...overrides,
  };
}

function makePassport(overrides: Partial<CreditPassport> = {}): CreditPassport {
  return {
    subject: 'a'.repeat(64),
    score: 750,
    band: 'Strong',
    factorSummary: [
      { key: 'cashflow', subScore: 80 },
      { key: 'income', subScore: 70 },
    ],
    provenanceSummary: 'source trust 90%',
    evidenceHash: 'e'.repeat(64),
    repaymentRecord: { onTime: 3, total: 3 },
    issuedAt: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    assessment: makeAssessment(),
    holder: { name: 'Aisyah binti Rahman', nricMasked: '******-**-1234', verified: true, provider: 'MyDigital ID' },
    ...overrides,
  };
}

function build(passportOverrides = {}, decisionOverrides = {}, requested = 5000) {
  const passport = makePassport(passportOverrides);
  const decision = makeDecision(decisionOverrides);
  const panel = runAgentPanel(passport, decision);
  return buildCreditMemo(passport, decision, panel, requested);
}

describe('buildCreditMemo header', () => {
  it('carries applicant name, requested and offered amounts, and a short evidence hash', () => {
    const memo = build({}, { maxAmount: 4200 }, 5000);
    expect(memo.header.applicant).toBe('Aisyah binti Rahman');
    expect(memo.header.requestedAmount).toBe(5000);
    expect(memo.header.offeredAmount).toBe(4200);
    expect(memo.header.evidenceShort).toContain('…');
    expect(memo.header.evidenceShort.length).toBeLessThan(20);
  });

  it('falls back to "Applicant" when the passport has no holder', () => {
    const memo = build({ holder: undefined });
    expect(memo.header.applicant).toBe('Applicant');
  });
});

describe('buildCreditMemo decision', () => {
  it('labels each verdict', () => {
    expect(build({}, { decision: 'approve' }).decision.label).toBe('Approved');
    expect(build({}, { decision: 'refer' }).decision.label).toBe('Refer  manual review');
    expect(build({}, { decision: 'decline', maxAmount: 0, installment: 0 }).decision.label).toBe('Declined');
  });
});

describe('buildCreditMemo findings & rationale', () => {
  it('includes one finding per specialist plus the orchestrator', () => {
    const memo = build();
    const ids = memo.findings.map((f) => f.id);
    expect(ids).toEqual(['fraud', 'credit', 'affordability', 'risk', 'decision']);
  });

  it('carries the decision reasons verbatim as the rationale trail', () => {
    const reasons = ['Reason one.', 'Reason two.'];
    const memo = build({}, { reasons });
    expect(memo.rationale).toEqual(reasons);
  });
});

describe('buildCreditMemo CCA-2025 compliance note', () => {
  it('marks all duties met for a clean approve', () => {
    const memo = build();
    expect(memo.compliance.every((c) => c.met)).toBe(true);
    expect(memo.compliance.map((c) => c.id)).toContain('data-confidence');
  });

  it('flags the data-confidence duty as not met below the 50% floor', () => {
    const memo = build({ assessment: makeAssessment({ confidence: 0.4 }) }, { decision: 'refer' });
    const conf = memo.compliance.find((c) => c.id === 'data-confidence');
    expect(conf?.met).toBe(false);
  });

  it('flags coverage adequacy as not met for thin history', () => {
    const memo = build({ assessment: makeAssessment({ coverageDays: 20, coverageRatio: 0.2 }) });
    const cov = memo.compliance.find((c) => c.id === 'coverage');
    expect(cov?.met).toBe(false);
  });
});

describe('buildCreditMemo conditions', () => {
  it('lists manual-review conditions for a refer', () => {
    const memo = build({}, { decision: 'refer' });
    expect(memo.conditions.length).toBeGreaterThan(0);
    expect(memo.conditions.join(' ').toLowerCase()).toContain('review');
  });
});

describe('memoToMarkdown', () => {
  it('renders the major section headings and the applicant', () => {
    const md = memoToMarkdown(build());
    expect(md).toContain('# Credit Memo');
    expect(md).toContain('Aisyah binti Rahman');
    expect(md).toContain('Consumer Credit Act 2025');
    expect(md).toContain('## Rationale');
  });
});

describe('fallbackNarrative', () => {
  it('produces a non-empty summary and rationale without an LLM', () => {
    const n = fallbackNarrative(build());
    expect(n.summary.length).toBeGreaterThan(0);
    expect(n.rationale.length).toBeGreaterThan(0);
  });
});

// Grouped rationale (Brief J)

describe('grouped rationale (Brief J)', () => {
  const categorized = [
    { category: 'policy' as const, text: 'Qualifies for the "Growth Capital" tier.' },
    { category: 'affordability' as const, text: 'Approved amount capped at RM4,200.' },
    { category: 'data-quality' as const, text: 'We could not verify enough of the recorded data routed to manual review.' },
  ];

  it('groups categorized reasons under labeled headings, non-empty groups only', () => {
    const memo = build({}, { categorizedReasons: categorized, reasons: categorized.map((r) => r.text) });
    expect(memo.groupedRationale.length).toBe(3);
    const byCat = Object.fromEntries(memo.groupedRationale.map((g) => [g.category, g]));
    expect(byCat['affordability'].reasons).toEqual(['Approved amount capped at RM4,200.']);
    expect(byCat['data-quality'].label.length).toBeGreaterThan(0);
    expect(memo.groupedRationale.some((g) => g.category === 'integrity')).toBe(false); // empty group omitted
    // Flat rationale unchanged for narration back-compat.
    expect(memo.rationale).toEqual(categorized.map((r) => r.text));
  });

  it('back-compat: a decision without categorizedReasons yields no groups and keeps flat rationale', () => {
    const memo = build({}, { categorizedReasons: undefined });
    expect(memo.groupedRationale).toEqual([]);
    expect(memo.rationale.length).toBeGreaterThan(0);
  });

  it('memoToMarkdown renders grouped category headings when groups exist', () => {
    const memo = build({}, { categorizedReasons: categorized, reasons: categorized.map((r) => r.text) });
    const md = memoToMarkdown(memo);
    expect(md).toContain('Affordability');
    expect(md).toContain('could not verify enough');
  });
});

// Officer resolution flows into the memo conditions (Brief O)

describe('memo with an officer resolution', () => {
  it('prepends the resolution rationale to the conditions', () => {
    const passport = makePassport();
    const decision = makeDecision({ decision: 'refer' });
    const panel = runAgentPanel(passport, decision);
    const memo = buildCreditMemo(passport, decision, panel, 5000, {
      outcome: 'approved',
      rationale: 'Income verified by phone with employer.',
      officer: 'Hamdan Z.',
    });
    expect(memo.conditions[0]).toContain('Hamdan Z.');
    expect(memo.conditions[0]).toContain('Income verified by phone with employer.');
    expect(memo.conditions[0].toLowerCase()).toContain('approved');
  });

  it('without a resolution the conditions are unchanged', () => {
    const passport = makePassport();
    const decision = makeDecision({ decision: 'refer' });
    const panel = runAgentPanel(passport, decision);
    const withOut = buildCreditMemo(passport, decision, panel, 5000);
    expect(withOut.conditions.some((c) => c.includes('Hamdan'))).toBe(false);
  });
});

// Counter-offer note (Brief L)

describe('counter-offer note', () => {
  const CAP_REASON = 'Approved amount capped at RM3,445 so the installment (RM329/mo over 12 months at 28% APR) stays within 35% of avg surplus and a 40% DSR cap.';
  const EXCEEDS_REASON = 'Requested RM4,000 exceeds what affordability supports; offering RM3,445 instead.';
  const reducedDecision: LoanDecision = {
    decision: 'approve',
    maxAmount: 3445,
    installment: 329,
    reasons: [CAP_REASON, EXCEEDS_REASON],
    categorizedReasons: [
      { category: 'policy', text: 'Qualifies for the "Starter Capital" tier.' },
      { category: 'affordability', text: CAP_REASON },
      { category: 'affordability', text: EXCEEDS_REASON },
    ],
  };

  it('carries the original request, countered amount, and the driving constraint when the offer is reduced', () => {
    const passport = makePassport();
    const panel = runAgentPanel(passport, reducedDecision);
    const memo = buildCreditMemo(passport, reducedDecision, panel, 4000);
    expect(memo.counterOffer).not.toBeNull();
    expect(memo.counterOffer!.originalRequest).toBe(4000);
    expect(memo.counterOffer!.counteredAmount).toBe(3445);
    expect(memo.counterOffer!.constraint).toBe(CAP_REASON);
  });

  it('is absent when the offer meets the request (no counter)', () => {
    const fullDecision = { ...reducedDecision, maxAmount: 4000 };
    const passport = makePassport();
    const panel = runAgentPanel(passport, fullDecision);
    const memo = buildCreditMemo(passport, fullDecision, panel, 4000);
    expect(memo.counterOffer).toBeNull();
  });

  it('is absent on a no-offer decline the sample case (below-tier-minimum)', () => {
    const decline: LoanDecision = { decision: 'decline', maxAmount: 0, installment: 0, reasons: ['Affordability check failed.'] };
    const passport = makePassport();
    const panel = runAgentPanel(passport, decline);
    const memo = buildCreditMemo(passport, decline, panel, 10000);
    expect(memo.counterOffer).toBeNull();
  });

  it('renders in memoToMarkdown with the original request, countered amount, and a non-invented constraint', () => {
    const passport = makePassport();
    const panel = runAgentPanel(passport, reducedDecision);
    const memo = buildCreditMemo(passport, reducedDecision, panel, 4000);
    const md = memoToMarkdown(memo);
    expect(md).toContain('Counter-offer');
    expect(md).toContain('RM4,000');
    expect(md).toContain('RM3,445');
    expect(md).toContain('35% of avg surplus'); // the real cap reason, not invented
  });

  it('memoToMarkdown omits the counter-offer section when no counter applies', () => {
    const passport = makePassport();
    const fullDecision = { ...reducedDecision, maxAmount: 4000 };
    const panel = runAgentPanel(passport, fullDecision);
    const md = memoToMarkdown(buildCreditMemo(passport, fullDecision, panel, 4000));
    expect(md).not.toContain('Counter-offer');
  });
});
