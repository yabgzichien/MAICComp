// Portfolio book statistics (2026-07-18 stats/advisor design). Pure: mean/median/std-dev
// for credit score, offered amount, and per-loan collection rate across the whole
// approved book (active + settled  mapBook itself is unfiltered; only portfolio.ts's
// live-exposure views exclude settled loans). No mode (meaningless on continuous values
// at this book size) and no raw variance (squared units nobody reads). No UI imports.
import { describe, expect, it } from 'vitest';
import { buildBookStats } from './bookStats';
import { SMALL_SAMPLE_MIN_LOANS } from './performance';
import type { ApplicationRecord, RepaymentEvent } from './applications';

function code(subject: string, score: number, band = 'Good'): string {
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
function approved(over: Partial<ApplicationRecord> & { score?: number; band?: string } = {}): ApplicationRecord {
  const subject = over.subject ?? `subject-${seq++}`;
  const { score = 700, band = 'Good', ...rest } = over;
  return {
    id: `id-${subject}`,
    passportCode: code(subject, score, band),
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

const event = (instalmentSeq: number, amount = 300): RepaymentEvent => ({ at: '2026-02-01T00:00:00.000Z', instalmentSeq, amount, outcome: 'on-time' });

describe('buildBookStats', () => {
  it('an empty book yields zeroed, small-sample stats', () => {
    const s = buildBookStats([]);
    expect(s.score).toEqual({ n: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, smallSample: true });
    expect(s.amount.n).toBe(0);
    expect(s.collectionRate.n).toBe(0);
  });

  it('median of an odd-length set is the middle value', () => {
    const apps = [approved({ subject: 'a', score: 600 }), approved({ subject: 'b', score: 700 }), approved({ subject: 'c', score: 900 })];
    expect(buildBookStats(apps).score.median).toBe(700);
  });

  it('median of an even-length set averages the two middle values', () => {
    const apps = [approved({ subject: 'a', score: 600 }), approved({ subject: 'b', score: 700 }), approved({ subject: 'c', score: 800 }), approved({ subject: 'd', score: 900 })];
    expect(buildBookStats(apps).score.median).toBe(750);
  });

  it('a single loan has zero standard deviation (no spread to measure)', () => {
    const apps = [approved({ score: 650 })];
    const s = buildBookStats(apps);
    expect(s.score.mean).toBe(650);
    expect(s.score.median).toBe(650);
    expect(s.score.stdDev).toBe(0);
  });

  it('computes mean and population standard deviation correctly against a hand-checked fixture', () => {
    // scores 2,4,4,4,5,5,7,9 -> mean 5, stdDev 2 (textbook population example)
    const scores = [2, 4, 4, 4, 5, 5, 7, 9];
    const apps = scores.map((score, i) => approved({ subject: `s${i}`, score }));
    const s = buildBookStats(apps);
    expect(s.score.mean).toBeCloseTo(5);
    expect(s.score.stdDev).toBeCloseTo(2);
  });

  it('is flagged small-sample below the shared threshold, not at or above it', () => {
    const below = Array.from({ length: SMALL_SAMPLE_MIN_LOANS - 1 }, (_, i) => approved({ subject: `b${i}` }));
    const atThreshold = Array.from({ length: SMALL_SAMPLE_MIN_LOANS }, (_, i) => approved({ subject: `t${i}` }));
    expect(buildBookStats(below).score.smallSample).toBe(true);
    expect(buildBookStats(atThreshold).score.smallSample).toBe(false);
  });

  it('summarizes offered amount as the amount statistic', () => {
    const apps = [approved({ subject: 'a', offeredAmount: 4000 }), approved({ subject: 'b', offeredAmount: 6000 })];
    const s = buildBookStats(apps);
    expect(s.amount.mean).toBe(5000);
    expect(s.amount.min).toBe(4000);
    expect(s.amount.max).toBe(6000);
  });

  it('excludes a loan with nothing due yet from the collection-rate statistic', () => {
    const apps = [approved({ subject: 'fresh' })]; // resolvedAt = now, monthsElapsed = 0, amountDue = 0
    expect(buildBookStats(apps, new Date('2026-01-01T00:00:00.000Z')).collectionRate.n).toBe(0);
  });

  it('includes a loan with real due-to-date history in the collection-rate statistic', () => {
    const apps = [approved({ repayments: [event(1), event(2)] })]; // 2 months elapsed by 2026-03-01, fully collected
    const s = buildBookStats(apps, new Date('2026-03-01T00:00:00.000Z'));
    expect(s.collectionRate.n).toBe(1);
    expect(s.collectionRate.mean).toBeCloseTo(1);
  });

  it('includes both active and settled loans (mapBook is unfiltered; only live-exposure views exclude settled)', () => {
    const settledPaid = Array.from({ length: 18 }, (_, i) => event(i + 1)); // Good band -> 18-month tenor
    const apps = [
      approved({ subject: 'settled', band: 'Good', score: 800, repayments: settledPaid }),
      approved({ subject: 'active', band: 'Good', score: 600 }),
    ];
    const s = buildBookStats(apps, new Date('2026-01-01T00:00:00.000Z'));
    expect(s.score.n).toBe(2);
  });
});
