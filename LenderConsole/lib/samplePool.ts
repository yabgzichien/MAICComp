// lib/samplePool.ts
// Runtime generator for the demo pool (xorshift32, seed 1337)  instead of committing a
// 9,000-line generated data file, the console reproduces the same 1,000-loan pool
// deterministically at module load. Used as the Capital Markets "sample" source and the
// empty-book fallback (Brief Q). Originally a port of a borrower-app generator that wrote
// a committed data file; that generator and its output were removed on 2026-08-04 when the
// borrower app's securitization engine turned out to be unreachable. This is now the only
// copy  the console is where capital-markets logic lives.

import type { CreditBand, PoolLoan } from './securitization';

const N = 1000;

const BANDS: { band: CreditBand; weight: number; scoreLo: number; scoreHi: number }[] = [
  { band: 'Building', weight: 0.1, scoreLo: 380, scoreHi: 499 },
  { band: 'Fair', weight: 0.25, scoreLo: 500, scoreHi: 619 },
  { band: 'Good', weight: 0.35, scoreLo: 620, scoreHi: 739 },
  { band: 'Strong', weight: 0.22, scoreLo: 740, scoreHi: 819 },
  { band: 'Excellent', weight: 0.08, scoreLo: 820, scoreHi: 900 },
];

// APRs track DEFAULT_PRODUCTS via each band's score range, so the sample book describes a
// pool the console could actually originate: Building (380-499) -> Emergency, Fair -> Starter,
// Good -> Growth, Strong/Excellent -> Scale. Tenors are unchanged. TERMS is a lookup, not a
// rand() call, so the pool's principal/fraudProb sequence is untouched by this repricing.
const TERMS: Record<CreditBand, { apr: number; tenorMonths: number }> = {
  Building: { apr: 0.18, tenorMonths: 12 },
  Fair: { apr: 0.16, tenorMonths: 12 },
  Good: { apr: 0.14, tenorMonths: 18 },
  Strong: { apr: 0.12, tenorMonths: 24 },
  Excellent: { apr: 0.12, tenorMonths: 24 },
};

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Deterministic pool identical to PipComp's SAMPLE_POOL. Built once, then frozen-shared. */
function generateSamplePool(): PoolLoan[] {
  let seed = 1337;
  const rand = (): number => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const randInt = (lo: number, hi: number): number => Math.floor(rand() * (hi - lo + 1)) + lo;

  const pickBand = () => {
    const r = rand();
    let acc = 0;
    for (const b of BANDS) {
      acc += b.weight;
      if (r <= acc) return b;
    }
    return BANDS[BANDS.length - 1];
  };
  const pickPrincipal = (): number => {
    const u = rand() * rand();
    const raw = 2000 + u * (20000 - 2000);
    return Math.round(raw / 50) * 50;
  };
  const pickFraudProb = (band: CreditBand): number => {
    const tail = rand() < 0.08;
    if (tail) return Math.round(clamp(0.2 + rand() * 0.4, 0, 1) * 100) / 100;
    const base = band === 'Building' ? 0.06 : 0.03;
    return Math.round(clamp(rand() * base, 0, 1) * 100) / 100;
  };

  const loans: PoolLoan[] = [];
  for (let i = 0; i < N; i++) {
    const b = pickBand();
    const score = randInt(b.scoreLo, b.scoreHi);
    const terms = TERMS[b.band];
    // Property order matches the generator so the rand() sequence (principal before
    // fraudProb) reproduces the identical pool.
    loans.push({
      id: `L${String(i + 1).padStart(4, '0')}`,
      principal: pickPrincipal(),
      apr: terms.apr,
      tenorMonths: terms.tenorMonths,
      score,
      band: b.band,
      fraudProb: pickFraudProb(b.band),
    });
  }
  return loans;
}

export const SAMPLE_POOL: PoolLoan[] = generateSamplePool();
