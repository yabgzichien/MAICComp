// TDD: the pure merge rule for the shared servicing ledger (Bidirectional Servicing Sync,
// 2026-07-18 design). Byte-identical behaviour is expected from
// LenderConsole/lib/mergeServicing.ts — this file is the canonical spec both ports are
// tested against (same test cases as the console's own mergeServicing.test.ts).
import { emptyServicingRecord, mergeServicing } from '../src/lib/mergeServicing';
import type { ServicingRecord } from '../src/lib/mergeServicing';

const SUBJECT = 'a'.repeat(64);
const LENDER = 'tekun';

function record(overrides: Partial<ServicingRecord> = {}): ServicingRecord {
  return {
    ...emptyServicingRecord(SUBJECT, LENDER, '2026-07-18T00:00:00.000Z'),
    ...overrides,
  };
}

describe('mergeServicing', () => {
  it('unions events by instalmentSeq from both sides', () => {
    const a = record({ events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-07-01T00:00:00.000Z', source: 'lender' }] });
    const b = record({ events: [{ instalmentSeq: 2, outcome: 'missed', at: '2026-07-02T00:00:00.000Z', source: 'borrower' }] });
    const merged = mergeServicing(a, b);
    expect(merged.events).toEqual([
      { instalmentSeq: 1, outcome: 'on-time', at: '2026-07-01T00:00:00.000Z', source: 'lender' },
      { instalmentSeq: 2, outcome: 'missed', at: '2026-07-02T00:00:00.000Z', source: 'borrower' },
    ]);
  });

  it('on a same-instalment conflict, the later `at` wins — a correction supersedes', () => {
    const older = record({ events: [{ instalmentSeq: 1, outcome: 'missed', at: '2026-07-01T00:00:00.000Z', source: 'lender' }] });
    const newer = record({ events: [{ instalmentSeq: 1, outcome: 'late', at: '2026-07-05T00:00:00.000Z', source: 'borrower' }] });
    expect(mergeServicing(older, newer).events).toEqual([{ instalmentSeq: 1, outcome: 'late', at: '2026-07-05T00:00:00.000Z', source: 'borrower' }]);
    expect(mergeServicing(newer, older).events).toEqual([{ instalmentSeq: 1, outcome: 'late', at: '2026-07-05T00:00:00.000Z', source: 'borrower' }]);
  });

  it('is commutative: mergeServicing(a, b) deep-equals mergeServicing(b, a)', () => {
    const a = record({
      tenorMonths: 12,
      installment: 500,
      events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-07-01T00:00:00.000Z', source: 'lender' }],
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    const b = record({
      events: [
        { instalmentSeq: 1, outcome: 'late', at: '2026-06-30T00:00:00.000Z', source: 'borrower' },
        { instalmentSeq: 2, outcome: 'missed', at: '2026-08-01T00:00:00.000Z', source: 'lender' },
      ],
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(mergeServicing(a, b)).toEqual(mergeServicing(b, a));
  });

  it('is idempotent: merging a record with itself changes nothing', () => {
    const a = record({
      tenorMonths: 12,
      installment: 500,
      events: [{ instalmentSeq: 1, outcome: 'on-time', at: '2026-07-01T00:00:00.000Z', source: 'lender' }],
    });
    expect(mergeServicing(a, a)).toEqual(a);
  });

  describe('defaulted latch', () => {
    it('true wins over false regardless of which side carries it', () => {
      const clean = record({ defaulted: { value: false, at: '2026-07-10T00:00:00.000Z', source: 'lender' } });
      const defaulted = record({ defaulted: { value: true, at: '2026-07-05T00:00:00.000Z', source: 'borrower' } });
      expect(mergeServicing(clean, defaulted).defaulted).toEqual({ value: true, at: '2026-07-05T00:00:00.000Z', source: 'borrower' });
      expect(mergeServicing(defaulted, clean).defaulted).toEqual({ value: true, at: '2026-07-05T00:00:00.000Z', source: 'borrower' });
    });

    it('never flips back to false once latched true, even against a later "false" record', () => {
      const defaulted = record({ defaulted: { value: true, at: '2026-07-05T00:00:00.000Z', source: 'lender' } });
      const laterClean = record({ defaulted: { value: false, at: '2026-09-01T00:00:00.000Z', source: 'borrower' }, updatedAt: '2026-09-01T00:00:00.000Z' });
      expect(mergeServicing(defaulted, laterClean).defaulted.value).toBe(true);
    });

    it('when both sides raised it, keeps the earlier `at` — when it actually happened', () => {
      const first = record({ defaulted: { value: true, at: '2026-07-05T00:00:00.000Z', source: 'lender' } });
      const second = record({ defaulted: { value: true, at: '2026-07-09T00:00:00.000Z', source: 'borrower' } });
      expect(mergeServicing(first, second).defaulted).toEqual({ value: true, at: '2026-07-05T00:00:00.000Z', source: 'lender' });
    });
  });

  describe('tenorMonths / installment seeding', () => {
    it('an absent (0) coordinate is filled in from the other side', () => {
      const seeded = record({ tenorMonths: 18, installment: 320 });
      const blank = record();
      expect(mergeServicing(blank, seeded)).toMatchObject({ tenorMonths: 18, installment: 320 });
      expect(mergeServicing(seeded, blank)).toMatchObject({ tenorMonths: 18, installment: 320 });
    });

    it('both absent stays absent', () => {
      expect(mergeServicing(record(), record())).toMatchObject({ tenorMonths: 0, installment: 0 });
    });
  });

  it('carries subject and lenderId through', () => {
    const a = record({ subject: SUBJECT, lenderId: LENDER });
    const b = record({ subject: SUBJECT, lenderId: LENDER });
    const merged = mergeServicing(a, b);
    expect(merged.subject).toBe(SUBJECT);
    expect(merged.lenderId).toBe(LENDER);
  });
});
