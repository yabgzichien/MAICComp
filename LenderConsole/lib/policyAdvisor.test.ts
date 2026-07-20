// Policy Advisor (2026-07-18 stats/advisor design). Pure, deterministic rules over
// buildPerformance's cohort rows  never chooses or applies a policy value, only
// suggests, with cited evidence. An LLM may only narrate an already-formed suggestion
// (server route, separate module); this module owns the actual decision logic. No UI
// imports, no ML.
import { describe, expect, it } from 'vitest';
import { buildPolicyAdvisor, DELINQUENCY_COLLECTION_THRESHOLD, RATE_REVIEW_MARGIN, UNDERPERFORM_MARGIN } from './policyAdvisor';
import { SMALL_SAMPLE_MIN_LOANS } from './performance';
import type { ApplicationRecord, RepaymentEvent } from './applications';

function code(subject: string, band: string, score = 700): string {
  return JSON.stringify({
    passport: {
      subject,
      score,
      band,
      factorSummary: [],
      provenanceSummary: '',
      evidenceHash: 'e'.repeat(64),
      repaymentRecord: { onTime: 0, total: 0 },
      issuedAt: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      assessment: { confidence: 0.8, coverageRatio: 0.9, coverageDays: 90, avgIncome: 3000, avgMonthlySurplus: 900, monthlyDebtService: 100 },
    },
    signature: 'a'.repeat(128),
  });
}

let seq = 0;
function approved(over: Partial<ApplicationRecord> & { band?: string } = {}): ApplicationRecord {
  const subject = over.subject ?? `subject-${seq++}`;
  const { band = 'Good', ...rest } = over;
  return {
    id: `id-${subject}`,
    passportCode: code(subject, band),
    subject,
    applicantLabel: 'Applicant',
    requestedAmount: 5000,
    engineDecision: 'approve',
    offeredAmount: 5000,
    installment: 300,
    status: 'approved',
    filedAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: '2026-01-01T00:00:00.000Z',
    notes: [],
    audit: [],
    ...rest,
  };
}

const onTime = (n: number): RepaymentEvent[] =>
  Array.from({ length: n }, (_, i) => ({ at: '2026-02-01T00:00:00.000Z', instalmentSeq: i + 1, amount: 300, outcome: 'on-time' as const }));

const NOW = new Date('2026-04-01T00:00:00.000Z'); // 3 months after resolvedAt

describe('buildPolicyAdvisor', () => {
  it('an empty book yields a single honest no-evidence suggestion', () => {
    const s = buildPolicyAdvisor([]);
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('no-evidence');
    expect(s[0].band).toBeNull();
  });

  it('a book where every band is below the small-sample threshold yields no-evidence, not a false-confident verdict', () => {
    const apps = [approved({ band: 'Good', repayments: onTime(3) }), approved({ subject: 'b', band: 'Strong', repayments: onTime(3) })];
    const s = buildPolicyAdvisor(apps, NOW);
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('no-evidence');
  });

  it('a band clearing the evidence threshold with zero realized loss suggests a rate review downward', () => {
    const apps = Array.from({ length: SMALL_SAMPLE_MIN_LOANS }, (_, i) => approved({ subject: `g${i}`, band: 'Good', repayments: onTime(3) }));
    const s = buildPolicyAdvisor(apps, NOW);
    const good = s.find((x) => x.band === 'Good');
    expect(good?.kind).toBe('rate-review-down');
    expect(good?.evidence.length).toBeGreaterThan(0);
    expect(good?.action).toMatch(/rate/i);
  });

  it('never suggests a value or auto-applies anything  action text is always "consider", never an applied change', () => {
    const apps = Array.from({ length: SMALL_SAMPLE_MIN_LOANS }, (_, i) => approved({ subject: `g${i}`, band: 'Good', repayments: onTime(3) }));
    const s = buildPolicyAdvisor(apps, NOW);
    for (const suggestion of s) expect(suggestion.action.toLowerCase()).toContain('consider');
  });

  it('a band with concentrated delinquency (low collection, not necessarily a loss yet) suggests a threshold review', () => {
    // 3 loans, each 1 of 3 due instalments paid -> collection rate 1/3, well under the threshold.
    const apps = Array.from({ length: SMALL_SAMPLE_MIN_LOANS }, (_, i) => approved({ subject: `g${i}`, band: 'Good', repayments: onTime(1) }));
    const s = buildPolicyAdvisor(apps, NOW);
    const good = s.find((x) => x.band === 'Good');
    expect(good?.kind).toBe('threshold-review');
  });

  it('a band underperforming its risk model beyond the margin suggests tightening, taking priority over a collection concern', () => {
    const missed = (n: number): RepaymentEvent[] => Array.from({ length: n }, (_, i) => ({ at: '2026-02-01T00:00:00.000Z', instalmentSeq: i + 1, amount: 0, outcome: 'missed' as const }));
    const apps = Array.from({ length: SMALL_SAMPLE_MIN_LOANS }, (_, i) => approved({ subject: `g${i}`, band: 'Good', repayments: missed(3) }));
    const s = buildPolicyAdvisor(apps, NOW);
    const good = s.find((x) => x.band === 'Good');
    expect(good?.kind).toBe('tighten');
  });

  it('named thresholds are sane fractions', () => {
    expect(RATE_REVIEW_MARGIN).toBeGreaterThan(0);
    expect(UNDERPERFORM_MARGIN).toBeGreaterThan(0);
    expect(DELINQUENCY_COLLECTION_THRESHOLD).toBeGreaterThan(0);
    expect(DELINQUENCY_COLLECTION_THRESHOLD).toBeLessThan(1);
  });
});
