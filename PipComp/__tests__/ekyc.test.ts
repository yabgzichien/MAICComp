import { validateNric, parseNric, maskNric, normalizeNric } from '../src/lib/ekyc';

const NOW = new Date('2026-06-11T00:00:00Z');

describe('normalizeNric', () => {
  it('strips dashes/spaces to 12 digits', () => {
    expect(normalizeNric('900115-10-5678')).toBe('900115105678');
    expect(normalizeNric(' 9001 1510 5678 ')).toBe('900115105678');
  });
  it('rejects wrong length or non-digits', () => {
    expect(normalizeNric('12345')).toBeNull();
    expect(normalizeNric('90011510567X')).toBeNull();
  });
});

describe('validateNric', () => {
  it('accepts a well-formed IC', () => {
    expect(validateNric('900115-10-5678', NOW).valid).toBe(true);
  });
  it('rejects a bad length', () => {
    expect(validateNric('900115-10-56', NOW).valid).toBe(false);
  });
  it('rejects an impossible birth date', () => {
    expect(validateNric('901315-10-5678', NOW).valid).toBe(false); // month 13
    expect(validateNric('900230-10-5678', NOW).valid).toBe(false); // 30 Feb
  });
  it('rejects an unassigned state code', () => {
    expect(validateNric('900115-17-5678', NOW).valid).toBe(false); // 17 unassigned
    expect(validateNric('900115-00-5678', NOW).valid).toBe(false);
  });
});

describe('parseNric', () => {
  it('derives DOB, gender, and state of birth', () => {
    const r = parseNric('900115-10-5678', NOW)!;
    expect(r.dob).toBe('1990-01-15'); // 90 -> 1900s (current 2-digit year is 26)
    expect(r.gender).toBe('F'); // last digit 8 even -> female
    expect(r.stateOfBirth).toBe('Selangor'); // code 10
  });
  it('treats a final odd digit as male', () => {
    expect(parseNric('900115-10-5677', NOW)!.gender).toBe('M');
  });
  it('maps a 20xx year for a low YY', () => {
    expect(parseNric('050228-14-1234', NOW)!.dob).toBe('2005-02-28');
    expect(parseNric('050228-14-1234', NOW)!.stateOfBirth).toBe('Wilayah Persekutuan Kuala Lumpur');
  });
  it('labels a foreign-born state code', () => {
    expect(parseNric('900115-71-5678', NOW)!.stateOfBirth).toMatch(/foreign|outside/i);
  });
  it('returns null for an invalid IC', () => {
    expect(parseNric('bad', NOW)).toBeNull();
  });
});

describe('maskNric', () => {
  it('shows only the last 4 digits', () => {
    expect(maskNric('900115-10-5678')).toBe('••••••-••-5678');
  });
});
