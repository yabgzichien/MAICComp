// Console IA split (2026-07-18 design): pure helpers shared by the pipeline rail and the
// new Servicing tab  the one-chip priority rule and the servicing list's sort order. No
// UI imports.
import { describe, expect, it } from 'vitest';
import { chipKindFor, orderServicingList } from './servicing';
import { recordCheckIn, type ApplicationRecord } from './applications';

let seq = 0;
function approved(over: Partial<ApplicationRecord> = {}): ApplicationRecord {
  const subject = over.subject ?? `subject-${seq++}`;
  return {
    id: `id-${subject}`,
    passportCode: '{}',
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

describe('chipKindFor', () => {
  it('prioritizes watchlist over everything else', () => {
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
});

describe('orderServicingList', () => {
  it('includes only approved loans', () => {
    const apps = [approved({ subject: 'a' }), approved({ subject: 'b', status: 'referred' }), approved({ subject: 'c', status: 'declined' })];
    expect(orderServicingList(apps).map((a) => a.subject)).toEqual(['a']);
  });

  it('puts watchlist-flagged loans before every other approved loan', () => {
    let apps = [approved({ subject: 'a', resolvedAt: '2026-03-01T00:00:00.000Z' }), approved({ subject: 'b', resolvedAt: '2026-01-01T00:00:00.000Z' })];
    apps = recordCheckIn(apps, apps[1].id, '{}', [{ key: 'income-drop', severity: 'watch', evidence: 'x' }], new Date('2026-04-01T00:00:00.000Z'));
    const ordered = orderServicingList(apps);
    expect(ordered[0].subject).toBe('b'); // watchlisted, even though filed earlier than 'a'
    expect(ordered[1].subject).toBe('a');
  });

  it('orders non-watchlist loans by most-recently-disbursed first', () => {
    const apps = [
      approved({ subject: 'old', resolvedAt: '2026-01-01T00:00:00.000Z' }),
      approved({ subject: 'new', resolvedAt: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(orderServicingList(apps).map((a) => a.subject)).toEqual(['new', 'old']);
  });

  it('an empty book yields an empty list', () => {
    expect(orderServicingList([])).toEqual([]);
  });
});
