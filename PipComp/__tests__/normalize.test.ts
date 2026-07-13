import { merchantKey } from '../src/lib/normalize';

describe('merchantKey', () => {
  it('lowercases and trims', () => {
    expect(merchantKey('  Automobile Innovative  ')).toBe('automobile innovative');
  });

  it('is case/space tolerant (same key for variants)', () => {
    expect(merchantKey('TEALIVE')).toBe(merchantKey('Tealive'));
    expect(merchantKey('Touch n Go   Parking')).toBe('touch n go parking');
  });

  it('drops card-network noise after a star', () => {
    expect(merchantKey('GRAB*RIDE 8F2K')).toBe('grab');
    expect(merchantKey('Jaya Grocer*KL')).toBe('jaya grocer');
  });

  it('does NOT merge genuinely different toll labels (documented limitation)', () => {
    const a = merchantKey('Exit Toll: SPE - SETIAWANGSA SOUTH BOUND');
    const b = merchantKey('Exit Toll: PLUS - JALAN DUTA');
    expect(a).not.toBe(b);
  });

  it('handles non-string input defensively', () => {
    // @ts-expect-error testing runtime robustness
    expect(merchantKey(null)).toBe('null');
  });
});
