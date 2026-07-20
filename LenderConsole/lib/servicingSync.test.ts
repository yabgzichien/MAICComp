// TDD: the console-local glue between mergeServicing.ts's shared record and
// ApplicationRecord (Bidirectional Servicing Sync, 2026-07-18 design).
import { describe, expect, it } from 'vitest';
import { appToServicingView, mergeAppWithServicing, servicingWritePayload } from './servicingSync';
import type { ApplicationRecord, RepaymentEvent } from './applications';
import { emptyServicingRecord, type ServicingRecord } from './mergeServicing';

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

const SUBJECT = 'a'.repeat(64);

function approved(over: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 'id-1',
    passportCode: passportCode(SUBJECT),
    subject: SUBJECT,
    applicantLabel: 'Applicant',
    requestedAmount: 5000,
    engineDecision: 'approve',
    offeredAmount: 5000,
    installment: 300,
    status: 'approved',
    filedAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: '2026-01-01T00:00:00.000Z',
    notes: [],
    audit: [{ at: '2026-01-01T00:00:00.000Z', action: 'filed' }],
    ...over,
  };
}

describe('appToServicingView', () => {
  it('derives tenorMonths from mapBook and carries the loan\'s subject/installment', () => {
    const view = appToServicingView(approved(), 'tekun');
    expect(view.subject).toBe(SUBJECT);
    expect(view.lenderId).toBe('tekun');
    expect(view.tenorMonths).toBe(18); // Good band
    expect(view.installment).toBe(300);
    expect(view.defaulted).toEqual({ value: false, at: '2026-01-01T00:00:00.000Z', source: 'lender' });
  });

  it('maps local repayments to events attributed to the lender', () => {
    const repayments: RepaymentEvent[] = [{ at: '2026-02-01T00:00:00.000Z', instalmentSeq: 1, amount: 300, outcome: 'on-time' }];
    const view = appToServicingView(approved({ repayments }), 'tekun');
    expect(view.events).toEqual([{ instalmentSeq: 1, outcome: 'on-time', at: '2026-02-01T00:00:00.000Z', source: 'lender' }]);
  });

  it('tenorMonths reads 0 for a record mapBook can\'t schedule', () => {
    const view = appToServicingView(approved({ status: 'declined', offeredAmount: 0 }), 'tekun');
    expect(view.tenorMonths).toBe(0);
  });
});

describe('servicingWritePayload', () => {
  it('builds an event write with the loan\'s decided terms seeded on every call', () => {
    const payload = servicingWritePayload(approved(), 'tekun', { event: { instalmentSeq: 1, outcome: 'on-time' } });
    expect(payload).toEqual({
      subject: SUBJECT,
      lenderId: 'tekun',
      source: 'lender',
      tenorMonths: 18,
      installment: 300,
      event: { instalmentSeq: 1, outcome: 'on-time' },
    });
  });

  it('builds a default write', () => {
    const payload = servicingWritePayload(approved(), 'tekun', { default: true });
    expect(payload).toMatchObject({ subject: SUBJECT, lenderId: 'tekun', source: 'lender', default: true });
  });

  it('returns null when the loan cannot be scheduled', () => {
    expect(servicingWritePayload(approved({ status: 'declined', offeredAmount: 0 }), 'tekun', { default: true })).toBeNull();
  });
});

describe('mergeAppWithServicing', () => {
  function serverRecord(overrides: Partial<ServicingRecord> = {}): ServicingRecord {
    return { ...emptyServicingRecord(SUBJECT, 'tekun', '2026-01-01T00:00:00.000Z'), tenorMonths: 18, installment: 300, ...overrides };
  }

  it('reports unchanged when the server carries nothing new', () => {
    const app = approved({ repayments: [{ at: '2026-02-01T00:00:00.000Z', instalmentSeq: 1, amount: 300, outcome: 'on-time' }] });
    const server = serverRecord({ events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-02-01T00:00:00.000Z', source: 'lender' }] });
    const result = mergeAppWithServicing(app, 'tekun', server);
    expect(result.changed).toBe(false);
    expect(result.app).toBe(app);
  });

  it('appends a borrower-recorded event not yet known locally, deriving amount from installment', () => {
    const app = approved();
    const server = serverRecord({ events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-02-01T00:00:00.000Z', source: 'borrower' }] });
    const result = mergeAppWithServicing(app, 'tekun', server);
    expect(result.changed).toBe(true);
    expect(result.app.repayments).toEqual([{ at: '2026-02-01T00:00:00.000Z', instalmentSeq: 1, amount: 300, outcome: 'on-time' }]);
    expect(result.app.audit[result.app.audit.length - 1].detail).toMatch(/borrower app/i);
  });

  it('a missed borrower-recorded event gets amount 0', () => {
    const app = approved();
    const server = serverRecord({ events: [{ instalmentSeq: 1, outcome: 'missed', at: '2026-02-01T00:00:00.000Z', source: 'borrower' }] });
    const result = mergeAppWithServicing(app, 'tekun', server);
    expect(result.app.repayments).toEqual([{ at: '2026-02-01T00:00:00.000Z', instalmentSeq: 1, amount: 0, outcome: 'missed' }]);
  });

  it('a later borrower correction supersedes an earlier locally-recorded event', () => {
    const app = approved({
      repayments: [{ at: '2026-02-01T00:00:00.000Z', instalmentSeq: 1, amount: 0, outcome: 'missed' }],
      audit: [{ at: '2026-01-01T00:00:00.000Z', action: 'filed' }, { at: '2026-02-01T00:00:00.000Z', action: 'repayment', detail: 'instalment 1: missed' }],
    });
    const server = serverRecord({ events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-02-05T00:00:00.000Z', source: 'borrower' }] });
    const result = mergeAppWithServicing(app, 'tekun', server);
    expect(result.app.repayments).toEqual([{ at: '2026-02-05T00:00:00.000Z', instalmentSeq: 1, amount: 300, outcome: 'on-time' }]);
  });

  it('adopts a server-side default not yet known locally', () => {
    const app = approved();
    const server = serverRecord({ defaulted: { value: true, at: '2026-03-01T00:00:00.000Z', source: 'borrower' } });
    const result = mergeAppWithServicing(app, 'tekun', server);
    expect(result.changed).toBe(true);
    expect(result.app.defaulted).toEqual({ value: true, at: '2026-03-01T00:00:00.000Z', source: 'borrower' });
    expect(result.app.audit[result.app.audit.length - 1].action).toBe('defaulted');
  });

  it('a local default is never overwritten (or unset) by a server record that lacks one', () => {
    const app = approved({ defaulted: { value: true, at: '2026-02-01T00:00:00.000Z', source: 'lender' } });
    const server = serverRecord(); // defaulted: false
    const result = mergeAppWithServicing(app, 'tekun', server);
    expect(result.changed).toBe(false);
    expect(result.app.defaulted).toEqual({ value: true, at: '2026-02-01T00:00:00.000Z', source: 'lender' });
  });
});
