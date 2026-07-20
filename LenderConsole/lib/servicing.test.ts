// Console IA split (2026-07-18) + settled loans (2026-07-18 stats/advisor design): pure
// helpers shared by the pipeline rail and the Servicing tab  the one-chip priority rule,
// the settled predicate, and the Servicing tab's three-section sort order. No UI imports.
import { describe, expect, it } from 'vitest';
import { chipKindFor, isSettled, orderServicingSections } from './servicing';
import { markDefault, recordCheckIn, recordRepayment, type ApplicationRecord, type RepaymentEvent } from './applications';

// Good band -> 18-month tenor per portfolio.ts's BAND_TERMS.
function passportCode(subject: string, band = 'Good'): string {
  return JSON.stringify({
    passport: {
      subject,
      score: 660,
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
function approved(over: Partial<ApplicationRecord> = {}): ApplicationRecord {
  const subject = over.subject ?? `subject-${seq++}`;
  return {
    id: `id-${subject}`,
    passportCode: passportCode(subject, (over as { band?: string }).band ?? 'Good'),
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
    ...over,
  };
}

const paidEvents = (n: number): RepaymentEvent[] =>
  Array.from({ length: n }, (_, i) => ({ at: '2026-02-01T00:00:00.000Z', instalmentSeq: i + 1, amount: 300, outcome: 'on-time' as const }));

describe('chipKindFor', () => {
  it('prioritizes a default over everything else, including watchlist', () => {
    const defaulted = { value: true as const, at: '2026-07-01T00:00:00.000Z', source: 'lender' as const };
    expect(chipKindFor(approved({ source: 'direct', defaulted }), true, 'delinquent', true)).toBe('defaulted');
  });

  it('prioritizes watchlist over everything else short of a default', () => {
    expect(chipKindFor(approved({ source: 'direct' }), true, 'delinquent')).toBe('watchlist');
  });

  it('falls back to delinquent over late and direct when not watchlisted', () => {
    expect(chipKindFor(approved({ source: 'direct' }), false, 'delinquent')).toBe('delinquent');
  });

  it('falls back to late over direct when not watchlisted or delinquent', () => {
    expect(chipKindFor(approved({ source: 'direct' }), false, 'late')).toBe('late');
  });

  it('falls back to direct when current and not watchlisted', () => {
    expect(chipKindFor(approved({ source: 'direct' }), false, 'current')).toBe('direct');
  });

  it('is null when nothing applies', () => {
    expect(chipKindFor(approved(), false, 'current')).toBeNull();
    expect(chipKindFor(approved(), false, null)).toBeNull();
  });

  it('settled beats delinquent/late/direct but loses to watchlist', () => {
    expect(chipKindFor(approved({ source: 'direct' }), false, 'delinquent', true)).toBe('settled');
    expect(chipKindFor(approved(), true, 'current', true)).toBe('watchlist');
  });
});

describe('isSettled', () => {
  it('is false with no repayments recorded', () => {
    expect(isSettled(approved())).toBe(false);
  });

  it('is false when fewer instalments are paid than the tenor (18 for Good band)', () => {
    expect(isSettled(approved({ repayments: paidEvents(17) }))).toBe(false);
  });

  it('is true once paid instalments reach the full tenor', () => {
    expect(isSettled(approved({ repayments: paidEvents(18) }))).toBe(true);
  });

  it('is false for a non-approved record (no schedule)', () => {
    expect(isSettled(approved({ status: 'declined', offeredAmount: 0, repayments: paidEvents(18) }))).toBe(false);
  });

  it('a missed instalment can never let the loan reach settled (one slot is permanently unpaid)', () => {
    const events: RepaymentEvent[] = [
      { at: '2026-02-01T00:00:00.000Z', instalmentSeq: 1, amount: 0, outcome: 'missed' },
      ...paidEvents(17).map((e, i) => ({ ...e, instalmentSeq: i + 2 })),
    ];
    expect(isSettled(approved({ repayments: events }))).toBe(false);
  });
});

describe('orderServicingSections', () => {
  it('includes only approved loans across all four sections', () => {
    const apps = [approved({ subject: 'a' }), approved({ subject: 'b', status: 'referred' }), approved({ subject: 'c', status: 'declined' })];
    const s = orderServicingSections(apps);
    expect([...s.defaulted, ...s.watchlist, ...s.active, ...s.settled].map((a) => a.subject)).toEqual(['a']);
  });

  it('a defaulted loan lands in its own section, excluded from watchlist/active/settled even with check-ins or a full paid schedule', () => {
    let apps = [approved({ subject: 'a', repayments: paidEvents(18) })];
    apps = recordCheckIn(apps, apps[0].id, '{}', [{ key: 'income-drop', severity: 'watch', evidence: 'x' }], new Date('2026-04-01T00:00:00.000Z'));
    apps = markDefault(apps, apps[0].id, 'lender', new Date('2026-05-01T00:00:00.000Z'));
    const s = orderServicingSections(apps);
    expect(s.defaulted.map((a) => a.subject)).toEqual(['a']);
    expect(s.watchlist).toEqual([]);
    expect(s.settled).toEqual([]);
    expect(s.active).toEqual([]);
  });

  it('a settled loan is excluded from the watchlist even if it carries active check-in flags', () => {
    let apps = [approved({ subject: 'a', repayments: paidEvents(18) })];
    apps = recordCheckIn(apps, apps[0].id, '{}', [{ key: 'income-drop', severity: 'watch', evidence: 'x' }], new Date('2026-04-01T00:00:00.000Z'));
    const s = orderServicingSections(apps);
    expect(s.watchlist).toEqual([]);
    expect(s.settled.map((a) => a.subject)).toEqual(['a']);
  });

  it('puts watchlist-flagged loans in watchlist, not active', () => {
    let apps = [approved({ subject: 'a' })];
    apps = recordCheckIn(apps, apps[0].id, '{}', [{ key: 'income-drop', severity: 'watch', evidence: 'x' }], new Date('2026-04-01T00:00:00.000Z'));
    const s = orderServicingSections(apps);
    expect(s.watchlist.map((a) => a.subject)).toEqual(['a']);
    expect(s.active).toEqual([]);
  });

  it('orders each section by most-recently-disbursed first', () => {
    const apps = [
      approved({ subject: 'old', resolvedAt: '2026-01-01T00:00:00.000Z' }),
      approved({ subject: 'new', resolvedAt: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(orderServicingSections(apps).active.map((a) => a.subject)).toEqual(['new', 'old']);
  });

  it('an empty book yields four empty sections', () => {
    expect(orderServicingSections([])).toEqual({ defaulted: [], watchlist: [], active: [], settled: [] });
  });

  it('recordRepayment interplay: a loan mid-schedule stays active, not settled', () => {
    const apps = [approved({ repayments: paidEvents(5) })];
    const s = orderServicingSections(apps);
    expect(s.active).toHaveLength(1);
    expect(s.settled).toHaveLength(0);
  });
});
