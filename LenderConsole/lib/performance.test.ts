// Portfolio repayment performance (2026-07-18 design). Pure: per-loan schedule/status
// classification plus band-level cohort aggregation (on-time rate, collection rate,
// realized-vs-expected loss, interest collected). No new risk math — expected loss reuses
// securitization.ts's loanPD; this module only aligns repayment events to a derived
// schedule and aggregates. Fixture style (passport `code()` helper) mirrors portfolio.test.ts
// since band is read off the parsed passport, never the unsigned display field.
import { describe, expect, it } from 'vitest';
import { buildPerformance, loanPerformance, monthsElapsed, SMALL_SAMPLE_MIN_LOANS } from './performance';
import { mapBook } from './portfolio';
import type { ApplicationRecord, RepaymentEvent } from './applications';
import { loanPD, DEFAULT_ASSUMPTIONS } from './securitization';

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
function approved(over: Partial<ApplicationRecord> & { band?: string; repayments?: RepaymentEvent[] } = {}): ApplicationRecord {
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
    tierLabel: 'Growth Capital',
    status: 'approved',
    filedAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: '2026-01-01T00:00:00.000Z',
    notes: [],
    audit: [],
    ...rest,
  };
}

const event = (instalmentSeq: number, outcome: RepaymentEvent['outcome'], amount = 300): RepaymentEvent => ({
  at: '2026-02-01T00:00:00.000Z',
  instalmentSeq,
  amount: outcome === 'missed' ? 0 : amount,
  outcome,
});

// ── monthsElapsed ────────────────────────────────────────────────────────────────

describe('monthsElapsed', () => {
  it('is 0 for the same date', () => {
    expect(monthsElapsed('2026-01-01T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'))).toBe(0);
  });

  it('counts whole calendar months elapsed', () => {
    expect(monthsElapsed('2026-01-01T00:00:00.000Z', new Date('2026-04-01T00:00:00.000Z'))).toBe(3);
  });

  it('does not count a partial month (day-of-month not yet reached)', () => {
    expect(monthsElapsed('2026-01-15T00:00:00.000Z', new Date('2026-02-10T00:00:00.000Z'))).toBe(0);
  });

  it('never goes negative', () => {
    expect(monthsElapsed('2026-06-01T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'))).toBe(0);
  });
});

// ── loanPerformance (per-loan schedule + status) ──────────────────────────────────

describe('loanPerformance', () => {
  it('nothing due yet (now = disbursement date) reads current, zero due', () => {
    const app = approved();
    const b = mapBook([app])[0];
    const perf = loanPerformance(b, new Date('2026-01-01T00:00:00.000Z'));
    expect(perf.status).toBe('current');
    expect(perf.dueCount).toBe(0);
    expect(perf.amountDue).toBe(0);
    expect(perf.paidCount).toBe(0);
  });

  it('fully paid to date reads current', () => {
    const app = approved({ repayments: [event(1, 'on-time'), event(2, 'on-time'), event(3, 'on-time')] });
    const b = mapBook([app])[0];
    const perf = loanPerformance(b, new Date('2026-04-01T00:00:00.000Z')); // 3 months elapsed
    expect(perf.status).toBe('current');
    expect(perf.dueCount).toBe(3);
    expect(perf.paidCount).toBe(3);
    expect(perf.amountCollected).toBe(900);
    expect(perf.amountDue).toBe(900);
  });

  it('exactly one instalment behind reads late', () => {
    const app = approved({ repayments: [event(1, 'on-time'), event(2, 'on-time')] });
    const b = mapBook([app])[0];
    const perf = loanPerformance(b, new Date('2026-04-01T00:00:00.000Z')); // 3 due, 2 paid
    expect(perf.status).toBe('late');
    expect(perf.dueCount).toBe(3);
    expect(perf.paidCount).toBe(2);
  });

  it('two or more instalments behind reads delinquent', () => {
    const app = approved({ repayments: [event(1, 'on-time')] });
    const b = mapBook([app])[0];
    const perf = loanPerformance(b, new Date('2026-04-01T00:00:00.000Z')); // 3 due, 1 paid
    expect(perf.status).toBe('delinquent');
  });

  it('any missed instalment reads delinquent even after catching back up (not just a behind-count)', () => {
    const app = approved({ repayments: [event(1, 'missed'), event(2, 'on-time'), event(3, 'on-time')] });
    const b = mapBook([app])[0];
    const perf = loanPerformance(b, new Date('2026-04-01T00:00:00.000Z')); // 3 due, 2 paid (behind=1) but 1 missed
    expect(perf.status).toBe('delinquent');
    expect(perf.missedCount).toBe(1);
    expect(perf.paidCount).toBe(2);
  });

  it('caps dueCount at the loan tenor even long after maturity', () => {
    const app = approved({ repayments: [event(1, 'on-time'), event(2, 'on-time')] }); // Good band → 18-month tenor
    const b = mapBook([app])[0];
    const perf = loanPerformance(b, new Date('2030-01-01T00:00:00.000Z'));
    expect(perf.dueCount).toBe(b.loan.tenorMonths);
  });

  it('a record with no offer (no schedule) is excluded upstream by mapBook, never reaches loanPerformance', () => {
    const declined = approved({ status: 'declined', offeredAmount: 0 });
    expect(mapBook([declined])).toEqual([]);
  });
});

// ── buildPerformance (cohort aggregation) ─────────────────────────────────────────

describe('buildPerformance', () => {
  it('an empty book has no bands, zero rates, and no repayment data', () => {
    const dash = buildPerformance([]);
    expect(dash.bands).toEqual([]);
    expect(dash.totalExposure).toBe(0);
    expect(dash.hasRepaymentData).toBe(false);
  });

  it('hasRepaymentData is false when loans are booked but nothing has been recorded yet', () => {
    const dash = buildPerformance([approved(), approved({ subject: 'b' })], new Date('2026-01-01T00:00:00.000Z'));
    expect(dash.hasRepaymentData).toBe(false);
  });

  it('groups by band and flags a cohort under the small-sample threshold', () => {
    const apps = [approved({ band: 'Good' }), approved({ subject: 'b', band: 'Strong' })];
    const dash = buildPerformance(apps, new Date('2026-01-01T00:00:00.000Z'));
    expect(dash.bands.find((r) => r.band === 'Good')?.smallSample).toBe(true);
    expect(SMALL_SAMPLE_MIN_LOANS).toBeGreaterThan(1);
  });

  it('a band reaching the small-sample threshold is not flagged', () => {
    const apps = Array.from({ length: SMALL_SAMPLE_MIN_LOANS }, (_, i) => approved({ subject: `g${i}`, band: 'Good' }));
    const dash = buildPerformance(apps, new Date('2026-01-01T00:00:00.000Z'));
    expect(dash.bands.find((r) => r.band === 'Good')?.smallSample).toBe(false);
  });

  it('computes exposure-weighted on-time and collection rates for a band', () => {
    const apps = [
      approved({ subject: 'a', band: 'Good', repayments: [event(1, 'on-time'), event(2, 'on-time')] }),
      approved({ subject: 'b', band: 'Good', repayments: [event(1, 'on-time'), event(2, 'late', 300)] }),
    ];
    const dash = buildPerformance(apps, new Date('2026-03-01T00:00:00.000Z')); // 2 due each
    const good = dash.bands.find((r) => r.band === 'Good')!;
    expect(good.loanCount).toBe(2);
    expect(good.onTimeRate).toBeCloseTo(3 / 4); // 3 on-time of 4 recorded events
    expect(good.collectionRate).toBeCloseTo(1); // all 4 instalments collected (late still collected)
    expect(dash.hasRepaymentData).toBe(true);
  });

  it('realized loss rate reflects missed instalments as a share of band exposure', () => {
    const apps = [approved({ band: 'Good', offeredAmount: 5000, installment: 300, repayments: [event(1, 'missed')] })];
    const dash = buildPerformance(apps, new Date('2026-02-01T00:00:00.000Z')); // 1 due, missed
    const good = dash.bands.find((r) => r.band === 'Good')!;
    expect(good.realizedLossRate).toBeCloseTo(300 / 5000);
  });

  it('expected loss rate per band matches securitization loanPD × lgd (fraud-neutral, approved loans)', () => {
    const apps = [approved({ band: 'Excellent' })];
    const dash = buildPerformance(apps, new Date('2026-01-01T00:00:00.000Z'));
    const excellent = dash.bands.find((r) => r.band === 'Excellent')!;
    const expected = loanPD('Excellent', 0, DEFAULT_ASSUMPTIONS) * DEFAULT_ASSUMPTIONS.lgd;
    expect(excellent.expectedLossRate).toBeCloseTo(expected);
  });

  it('excludes referred/declined/zero-offer rows from every band', () => {
    const apps = [approved({ band: 'Good' }), approved({ subject: 'r', status: 'referred', band: 'Good' }), approved({ subject: 'd', status: 'declined', offeredAmount: 0, band: 'Good' })];
    const dash = buildPerformance(apps, new Date('2026-01-01T00:00:00.000Z'));
    expect(dash.bands.find((r) => r.band === 'Good')?.loanCount).toBe(1);
  });

  it('interest collected is the portion of amounts collected beyond straight-line principal repaid', () => {
    // Good band ⇒ 18-month tenor. 2 of 18 instalments paid ⇒ ~1/9 of principal is "repaid".
    const apps = [approved({ band: 'Good', offeredAmount: 5000, installment: 300, repayments: [event(1, 'on-time'), event(2, 'on-time')] })];
    const dash = buildPerformance(apps, new Date('2026-03-01T00:00:00.000Z'));
    const principalPortion = 5000 * (2 / 18);
    expect(dash.interestCollected).toBeCloseTo(600 - principalPortion);
  });
});
