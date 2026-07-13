import { suggestByKey, suggestForMerchant } from '../src/lib/recommend';
import type { MemoryMap } from '../src/lib/types';

const MEMORY: MemoryMap = {
  tealive: 'coffee',
  grab: 'transport',
  'automobile innovative': 'fuel',
};

describe('suggestByKey', () => {
  it('returns the learned category on a hit', () => {
    expect(suggestByKey(MEMORY, 'grab')).toBe('transport');
  });

  it('returns null on a miss', () => {
    expect(suggestByKey(MEMORY, 'senheng')).toBeNull();
  });
});

describe('suggestForMerchant', () => {
  it('normalizes the raw label before lookup', () => {
    expect(suggestForMerchant(MEMORY, '  TEALIVE ')).toBe('coffee');
    expect(suggestForMerchant(MEMORY, 'Automobile Innovative')).toBe('fuel');
  });

  it('matches the learning loop from the brief (Automobile Innovative -> Fuel)', () => {
    expect(suggestForMerchant(MEMORY, 'AUTOMOBILE INNOVATIVE')).toBe('fuel');
  });

  it('returns null for an unseen merchant', () => {
    expect(suggestForMerchant(MEMORY, 'Nandos')).toBeNull();
  });
});
