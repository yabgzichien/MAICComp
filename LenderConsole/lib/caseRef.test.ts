import { describe, expect, it } from 'vitest';
import { caseIdFor, flagTimeLabel } from './caseRef';

describe('caseIdFor', () => {
  it('is deterministic for the same seed', () => {
    expect(caseIdFor('user_unknown')).toBe(caseIdFor('user_unknown'));
  });

  it('produces the FL- prefixed short form with no hardcoded year', () => {
    const id = caseIdFor('some-passport-subject');
    expect(id).toMatch(/^FL-[0-9A-F]{6}$/);
    expect(id).not.toMatch(/20\d{2}/);
  });

  it('differs for different seeds', () => {
    expect(caseIdFor('a')).not.toBe(caseIdFor('b'));
  });
});

describe('flagTimeLabel', () => {
  it('formats a timestamp as zero-padded HH:MM', () => {
    const d = new Date(2026, 6, 7, 9, 5);
    expect(flagTimeLabel(d)).toBe('09:05');
  });
});
