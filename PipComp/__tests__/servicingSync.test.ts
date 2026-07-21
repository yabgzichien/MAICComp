// TDD: the borrower-local glue between mergeServicing.ts's shared record and the SQLite
// repayment schedule (Bidirectional Servicing Sync, 2026-07-18 design).
import { loanToServicingView, mergeLoanWithServicing, servicingWritePayload } from '../src/lib/servicingSync';
import { emptyServicingRecord } from '../src/lib/mergeServicing';
import type { ServicingRecord } from '../src/lib/mergeServicing';
import type { LoanApplication, Repayment } from '../src/db/loansRepo';

const SUBJECT = 'a'.repeat(64);

function application(overrides: Partial<LoanApplication> = {}): LoanApplication {
  return {
    id: 'app-1',
    productId: 'growth',
    requestedAmount: 5000,
    decision: 'approve',
    scoreAt: 700,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lenderLabel: 'TEKUN Nasional',
    liabilityAccountId: 'liab-1',
    lenderId: 'tekun',
    defaultedAt: null,
    defaultedSource: null,
    purpose: null,
    ...overrides,
  };
}

function repayment(overrides: Partial<Repayment> = {}): Repayment {
  return {
    id: 'r-1',
    applicationId: 'app-1',
    dueDate: '2026-02-01',
    paidOn: null,
    amount: 300,
    status: 'scheduled',
    ...overrides,
  };
}

describe('loanToServicingView', () => {
  it('derives tenorMonths from the repayment count and installment from the first row', () => {
    const repayments = [repayment({ id: 'r-1' }), repayment({ id: 'r-2' })];
    const view = loanToServicingView(SUBJECT, application(), repayments);
    expect(view.subject).toBe(SUBJECT);
    expect(view.lenderId).toBe('tekun');
    expect(view.tenorMonths).toBe(2);
    expect(view.installment).toBe(300);
    expect(view.defaulted).toEqual({ value: false, at: '2026-01-01T00:00:00.000Z', source: 'borrower' });
  });

  it('maps resolved repayments to events at their array position (1-based)', () => {
    const repayments = [
      repayment({ id: 'r-1', status: 'paid', paidOn: '2026-02-01T00:00:00.000Z' }),
      repayment({ id: 'r-2', status: 'scheduled' }),
      repayment({ id: 'r-3', status: 'missed' }),
    ];
    const view = loanToServicingView(SUBJECT, application(), repayments);
    expect(view.events).toEqual([
      { instalmentSeq: 1, outcome: 'on-time', at: '2026-02-01T00:00:00.000Z', source: 'borrower' },
      { instalmentSeq: 3, outcome: 'missed', at: repayments[2].dueDate, source: 'borrower' },
    ]);
  });

  it('a locally-defaulted application carries its provenance through', () => {
    const view = loanToServicingView(SUBJECT, application({ defaultedAt: '2026-03-01T00:00:00.000Z', defaultedSource: 'lender' }), []);
    expect(view.defaulted).toEqual({ value: true, at: '2026-03-01T00:00:00.000Z', source: 'lender' });
  });

  it('an application with no lenderId views as lenderId ""', () => {
    const view = loanToServicingView(SUBJECT, application({ lenderId: null }), []);
    expect(view.lenderId).toBe('');
  });
});

describe('servicingWritePayload', () => {
  it('builds an event write with the schedule seeded on every call', () => {
    const payload = servicingWritePayload(SUBJECT, application(), 18, 300, { event: { instalmentSeq: 1, outcome: 'on-time' } });
    expect(payload).toEqual({
      subject: SUBJECT,
      lenderId: 'tekun',
      source: 'borrower',
      tenorMonths: 18,
      installment: 300,
      event: { instalmentSeq: 1, outcome: 'on-time' },
    });
  });

  it('builds a default write', () => {
    const payload = servicingWritePayload(SUBJECT, application(), 18, 300, { default: true });
    expect(payload).toMatchObject({ default: true, source: 'borrower' });
  });

  it('returns null for a self-decided application with no lenderId — nothing to sync', () => {
    expect(servicingWritePayload(SUBJECT, application({ lenderId: null }), 18, 300, { default: true })).toBeNull();
  });
});

describe('mergeLoanWithServicing', () => {
  function serverRecord(overrides: Partial<ServicingRecord> = {}): ServicingRecord {
    return { ...emptyServicingRecord(SUBJECT, 'tekun', '2026-01-01T00:00:00.000Z'), tenorMonths: 2, installment: 300, ...overrides };
  }

  it('reports unchanged when the server carries nothing new', () => {
    const repayments = [repayment({ id: 'r-1', status: 'paid', paidOn: '2026-02-01T00:00:00.000Z' })];
    const server = serverRecord({ events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-02-01T00:00:00.000Z', source: 'borrower' }] });
    const result = mergeLoanWithServicing(SUBJECT, application(), repayments, server);
    expect(result).toEqual({ changed: false, repaymentUpdates: [], newDefault: null });
  });

  it('surfaces a lender-recorded event not yet reflected locally, mapped to the right repayment id', () => {
    const repayments = [repayment({ id: 'r-1', status: 'scheduled' }), repayment({ id: 'r-2', status: 'scheduled' })];
    const server = serverRecord({ events: [{ instalmentSeq: 2, outcome: 'missed', at: '2026-03-01T00:00:00.000Z', source: 'lender' }] });
    const result = mergeLoanWithServicing(SUBJECT, application(), repayments, server);
    expect(result.changed).toBe(true);
    expect(result.repaymentUpdates).toEqual([{ repaymentId: 'r-2', outcome: 'missed', at: '2026-03-01T00:00:00.000Z' }]);
  });

  it('a later lender correction supersedes a locally-recorded event', () => {
    const repayments = [repayment({ id: 'r-1', status: 'missed' })];
    const server = serverRecord({ events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-05-01T00:00:00.000Z', source: 'lender' }] });
    const result = mergeLoanWithServicing(SUBJECT, application(), repayments, server);
    expect(result.repaymentUpdates).toEqual([{ repaymentId: 'r-1', outcome: 'on-time', at: '2026-05-01T00:00:00.000Z' }]);
  });

  it('surfaces a lender-reported default not yet known locally', () => {
    const server = serverRecord({ defaulted: { value: true, at: '2026-04-01T00:00:00.000Z', source: 'lender' } });
    const result = mergeLoanWithServicing(SUBJECT, application(), [], server);
    expect(result.changed).toBe(true);
    expect(result.newDefault).toEqual({ at: '2026-04-01T00:00:00.000Z', source: 'lender' });
  });

  it('a local default is never re-raised by a server record that lacks one', () => {
    const app = application({ defaultedAt: '2026-02-01T00:00:00.000Z', defaultedSource: 'borrower' });
    const result = mergeLoanWithServicing(SUBJECT, app, [], serverRecord());
    expect(result).toEqual({ changed: false, repaymentUpdates: [], newDefault: null });
  });
});
