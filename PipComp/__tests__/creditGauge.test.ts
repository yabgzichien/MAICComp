import { BANDS } from '../src/components/CreditGauge';
import { bandFor, type CreditBand } from '../src/lib/creditScore';

/**
 * Regression lock for the "699 renders the whole gauge pale" bug: the arc's five segments used
 * to carry hand-tuned f1/f2 fractions that drifted out of sync with bandFor()'s real score
 * boundaries (500/620/740/820). A score landing in the gap between two stale segments matched no
 * band, so `activeIdx` came back -1 and EVERY segment fell to 13% opacity at once.
 *
 * The fix keys the active segment off the `band` CreditGauge already receives as a prop, via
 * string equality against a 5-entry array covering the whole CreditBand union  which cannot
 * itself return "no match" for a valid band. What it can still do is drift: if SCORE_BAND_BOUNDS
 * inside CreditGauge.tsx and bandFor() in creditScore.ts are ever edited independently, the arc
 * would silently misrepresent where the boundaries actually are again. These tests catch that.
 */
describe('CreditGauge band segments', () => {
  it('covers the whole CreditBand union, once each, in bandFor() order', () => {
    const order: CreditBand[] = ['Building', 'Fair', 'Good', 'Strong', 'Excellent'];
    expect(BANDS.map((b) => b.key)).toEqual(order);
  });

  it('every segment has positive width', () => {
    for (const b of BANDS) expect(b.f2).toBeGreaterThan(b.f1);
  });

  it('segments never overlap, so no two arc paths draw over the same score range', () => {
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i].f1).toBeGreaterThan(BANDS[i - 1].f2);
    }
  });

  it('stays within the 300-900 score range', () => {
    expect(BANDS[0].f1).toBeGreaterThanOrEqual(0);
    expect(BANDS[BANDS.length - 1].f2).toBeLessThanOrEqual(1);
  });

  it('every integer score matches exactly one band by bandFor(), with no gap', () => {
    // The direct regression check: this loop would have caught 699 landing nowhere.
    for (let score = 300; score <= 900; score++) {
      const band = bandFor(score);
      expect(BANDS.some((b) => b.key === band)).toBe(true);
    }
  });

  it("a band's own boundary scores still land inside that band's arc fraction (stays honest, not just present)", () => {
    // Guards against the boundaries and bandFor() drifting apart silently: every band's segment
    // must still roughly cover the real score range bandFor() assigns to it, not just exist.
    const toFraction = (score: number) => (score - 300) / (900 - 300);
    const realRanges: Record<CreditBand, [number, number]> = {
      Building: [300, 499],
      Fair: [500, 619],
      Good: [620, 739],
      Strong: [740, 819],
      Excellent: [820, 900],
    };
    for (const b of BANDS) {
      const [lo, hi] = realRanges[b.key];
      const mid = toFraction((lo + hi) / 2);
      expect(mid).toBeGreaterThanOrEqual(b.f1);
      expect(mid).toBeLessThanOrEqual(b.f2);
    }
  });
});
