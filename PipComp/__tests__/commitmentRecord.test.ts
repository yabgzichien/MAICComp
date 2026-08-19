import { computeCommitmentRecord } from '../src/lib/commitmentRecord';
import type { CommitmentOccurrence, OccurrenceStatus } from '../src/lib/commitments';

function occ(status: OccurrenceStatus, month = '2026-06'): CommitmentOccurrence {
  return {
    id: Math.random().toString(36).slice(2),
    commitmentId: 'c1',
    dueDate: `${month}-05`,
    month,
    amount: 89,
    paidAmount: status === 'scheduled' || status === 'skipped' ? null : 89,
    paidOn: status === 'paid' || status === 'late' ? `${month}-04` : null,
    status,
    txnId: null,
    txnCreated: false,
    unitsAdded: null,
    priceMYR: null,
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('computeCommitmentRecord', () => {
  it('returns an empty record for no occurrences', () => {
    expect(computeCommitmentRecord([])).toEqual({ onTime: 0, late: 0, skipped: 0, total: 0, onTimeRatio: 0, monthsObserved: 0 });
  });

  it('a brand-new scheduled occurrence does not count toward the record either way', () => {
    const r = computeCommitmentRecord([occ('scheduled')]);
    expect(r).toEqual({ onTime: 0, late: 0, skipped: 0, total: 0, onTimeRatio: 0, monthsObserved: 0 });
  });

  it('tallies paid vs late and computes the ratio over resolved-and-owed rows only', () => {
    const r = computeCommitmentRecord([occ('paid', '2026-04'), occ('paid', '2026-05'), occ('late', '2026-06')]);
    expect(r.onTime).toBe(2);
    expect(r.late).toBe(1);
    expect(r.total).toBe(3);
    expect(r.onTimeRatio).toBeCloseTo(2 / 3);
    expect(r.monthsObserved).toBe(3);
  });

  it('excludes skipped rows from the total/ratio but still counts the observed month', () => {
    const r = computeCommitmentRecord([occ('paid', '2026-04'), occ('skipped', '2026-05')]);
    expect(r.total).toBe(1);
    expect(r.onTimeRatio).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.monthsObserved).toBe(2);
  });

  it('a perfect record ratio is 1', () => {
    const r = computeCommitmentRecord([occ('paid'), occ('paid', '2026-07')]);
    expect(r.onTimeRatio).toBe(1);
  });
});
