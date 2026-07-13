import { applyDateEdit, fullDate, isValidIsoDate, shortDate } from '../src/lib/dates';
import type { ExtractedTxn } from '../src/lib/types';

function txn(over: Partial<ExtractedTxn>): ExtractedTxn {
  return {
    merchant: 'Test Merchant',
    amount: 10,
    type: 'expense',
    date: '2026-05-12',
    method: null,
    ...over,
  };
}

describe('shortDate', () => {
  it('formats an ISO date as "D Mon"', () => {
    expect(shortDate('2026-06-01')).toBe('1 Jun');
  });

  it('returns empty string for null/bad input', () => {
    expect(shortDate(null)).toBe('');
    expect(shortDate('garbage')).toBe('');
  });
});

describe('fullDate', () => {
  it('formats an ISO date as "D Mon YYYY"', () => {
    expect(fullDate('2026-06-01')).toBe('1 Jun 2026');
  });

  it('returns empty string for null/bad input', () => {
    expect(fullDate(null)).toBe('');
    expect(fullDate('garbage')).toBe('');
  });
});

describe('isValidIsoDate', () => {
  it('accepts genuinely valid YYYY-MM-DD dates', () => {
    expect(isValidIsoDate('2026-05-12')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects strings that fail the shape check', () => {
    expect(isValidIsoDate(null)).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('garbage')).toBe(false);
    expect(isValidIsoDate('2026-5-1')).toBe(false);
  });

  it('rejects dates that JS would silently roll over to a different valid date', () => {
    // new Date('2026-13-45') doesn't throw  it rolls over to 2027-02-14.
    expect(isValidIsoDate('2026-13-45')).toBe(false);
    // Feb 30 rolls over to Mar 2.
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    // 2026 is not a leap year  Feb 29 rolls over to Mar 1.
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
  });
});

describe('applyDateEdit', () => {
  it('updates only the edited item when the year is unchanged', () => {
    const items = [
      txn({ merchant: 'A', date: '2026-05-12' }),
      txn({ merchant: 'B', date: '2026-05-20' }),
      txn({ merchant: 'C', date: '2026-06-01' }),
    ];
    const next = applyDateEdit(items, 0, '2026-05-15');
    expect(next[0].date).toBe('2026-05-15');
    expect(next[1].date).toBe('2026-05-20');
    expect(next[2].date).toBe('2026-06-01');
    // returns a new array
    expect(next).not.toBe(items);
  });

  it('propagates the new year to other items, preserving their month/day', () => {
    const items = [
      txn({ merchant: 'A', date: '2026-05-12' }),
      txn({ merchant: 'B', date: '2026-07-20' }),
      txn({ merchant: 'C', date: '2026-12-31' }),
    ];
    const next = applyDateEdit(items, 0, '2025-05-12');
    expect(next[0].date).toBe('2025-05-12');
    expect(next[1].date).toBe('2025-07-20');
    expect(next[2].date).toBe('2025-12-31');
  });

  it('leaves null dates on other items untouched during propagation', () => {
    const items = [
      txn({ merchant: 'A', date: '2026-05-12' }),
      txn({ merchant: 'B', date: null }),
      txn({ merchant: 'C', date: '2026-12-31' }),
    ];
    const next = applyDateEdit(items, 0, '2025-05-12');
    expect(next[1].date).toBeNull();
    expect(next[2].date).toBe('2025-12-31');
  });

  it('does not propagate when the edited item had no original (null) date', () => {
    const items = [
      txn({ merchant: 'A', date: null }),
      txn({ merchant: 'B', date: '2026-07-20' }),
    ];
    const next = applyDateEdit(items, 0, '2025-05-12');
    expect(next[0].date).toBe('2025-05-12');
    expect(next[1].date).toBe('2026-07-20'); // untouched  nothing to "change" from
  });

  it('does not propagate when the original date was unparseable garbage', () => {
    const items = [
      txn({ merchant: 'A', date: 'not-a-date' }),
      txn({ merchant: 'B', date: '2026-07-20' }),
    ];
    const next = applyDateEdit(items, 0, '2025-05-12');
    expect(next[0].date).toBe('2025-05-12');
    expect(next[1].date).toBe('2026-07-20');
  });

  it('clears just the edited item when the new date is null (no propagation)', () => {
    const items = [
      txn({ merchant: 'A', date: '2026-05-12' }),
      txn({ merchant: 'B', date: '2026-07-20' }),
    ];
    const next = applyDateEdit(items, 0, null);
    expect(next[0].date).toBeNull();
    expect(next[1].date).toBe('2026-07-20');
  });

  it('does not propagate when the original date rolls over to a different valid date (e.g. 2026-13-45)', () => {
    const items = [
      txn({ merchant: 'A', date: '2026-13-45' }), // rolls over to 2027-02-14, but is not a *valid* ISO date
      txn({ merchant: 'B', date: '2026-07-20' }),
    ];
    const next = applyDateEdit(items, 0, '2025-05-12');
    expect(next[0].date).toBe('2025-05-12');
    expect(next[1].date).toBe('2026-07-20'); // untouched  original year was not genuinely valid
  });

  it('does not propagate when the new date rolls over to a different valid date (e.g. 2026-02-30)', () => {
    const items = [
      txn({ merchant: 'A', date: '2026-05-12' }),
      txn({ merchant: 'B', date: '2026-07-20' }),
    ];
    const next = applyDateEdit(items, 0, '2026-02-30'); // rolls over to 2026-03-02 but isn't genuinely valid
    expect(next[0].date).toBe('2026-02-30'); // edited item gets the literal value verbatim
    expect(next[1].date).toBe('2026-07-20'); // no propagation  new date is not genuinely valid
  });

  it('sets the edited item to the literal new date and ignores unparseable new dates for propagation', () => {
    const items = [
      txn({ merchant: 'A', date: '2026-05-12' }),
      txn({ merchant: 'B', date: '2026-07-20' }),
    ];
    const next = applyDateEdit(items, 0, 'garbage-date');
    expect(next[0].date).toBe('garbage-date');
    expect(next[1].date).toBe('2026-07-20');
  });
});
