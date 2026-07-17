import { SAMPLE_IDENTITY } from '../src/data/sampleIdentity';
import { parseNric, validateNric } from '../src/lib/ekyc';

describe('SAMPLE_IDENTITY (tour prefill)', () => {
  it('passes the real NRIC validator', () => {
    expect(validateNric(SAMPLE_IDENTITY.nric).valid).toBe(true);
  });

  it('parses to the expected synthetic profile', () => {
    const info = parseNric(SAMPLE_IDENTITY.nric)!;
    expect(info.stateOfBirth).toBe('Selangor');
    expect(info.dob).toBe('1998-04-12');
  });

  it('carries a non-empty name', () => {
    expect(SAMPLE_IDENTITY.fullName.length).toBeGreaterThan(0);
  });
});
