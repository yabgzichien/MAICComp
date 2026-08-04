import {
  forecastNextMonthNet,
  FORECAST_METHOD,
  MIN_FORECAST_MONTHS,
  MAX_FORECAST_MONTHS,
} from '../src/lib/cashflowForecast';

describe('forecastNextMonthNet', () => {
  describe('window rules', () => {
    it('returns null below the minimum month count', () => {
      expect(forecastNextMonthNet([])).toBeNull();
      expect(forecastNextMonthNet([100])).toBeNull();
      expect(forecastNextMonthNet([100, 200, 300])).toBeNull();
      expect(MIN_FORECAST_MONTHS).toBe(4);
    });

    it('emits at exactly the minimum month count', () => {
      const f = forecastNextMonthNet([100, 200, 300, 400]);
      expect(f).not.toBeNull();
      expect(f!.monthsUsed).toBe(4);
      expect(f!.method).toBe(FORECAST_METHOD);
    });

    it('truncates a longer series to the latest six months', () => {
      // The first three entries are absurd; only the trailing six may influence the result.
      const long = [-9999, 9999, -9999, 100, 200, 300, 400, 500, 600];
      const short = [100, 200, 300, 400, 500, 600];
      expect(forecastNextMonthNet(long)).toEqual(forecastNextMonthNet(short));
      expect(forecastNextMonthNet(long)!.monthsUsed).toBe(MAX_FORECAST_MONTHS);
    });
  });

  describe('point estimate (linear recency weights)', () => {
    it('weights the newest month n times the oldest', () => {
      // weights 1,2,3,4 over 100,200,300,400 → 3000/10 = 300 (vs a plain mean of 250)
      const f = forecastNextMonthNet([100, 200, 300, 400])!;
      expect(f.nextMonthNet).toBeCloseTo(300, 10);
    });

    it('is order-sensitive: the same months reversed forecast lower', () => {
      const rising = forecastNextMonthNet([100, 200, 300, 400])!;
      const falling = forecastNextMonthNet([400, 300, 200, 100])!;
      expect(rising.nextMonthNet).toBeCloseTo(300, 10);
      expect(falling.nextMonthNet).toBeCloseTo(200, 10);
    });

    it('equals the mean when every month is identical', () => {
      const f = forecastNextMonthNet([500, 500, 500, 500])!;
      expect(f.nextMonthNet).toBeCloseTo(500, 10);
    });
  });

  describe('lower bound (one-sided 95% prediction bound)', () => {
    it('matches the hand-computed t-bound at n = 4', () => {
      // x̄ = 250, s = √(50000/3) = 129.0994, bound = 250 − 2.353·129.0994·√1.25
      const f = forecastNextMonthNet([100, 200, 300, 400])!;
      expect(f.lowerBound95).toBeCloseTo(-89.63, 2);
    });

    it('collapses onto the point estimate when variance is zero', () => {
      const f = forecastNextMonthNet([500, 500, 500, 500])!;
      expect(f.lowerBound95).toBeCloseTo(500, 10);
      expect(f.lowerBound95).toBeCloseTo(f.nextMonthNet, 10);
    });

    it('narrows as the series steadies (the reward for stable cash flow)', () => {
      const volatile = forecastNextMonthNet([100, 900, 200, 800])!;
      const steady = forecastNextMonthNet([480, 520, 490, 510])!;
      const width = (f: { nextMonthNet: number; lowerBound95: number }) => f.nextMonthNet - f.lowerBound95;
      expect(width(steady)).toBeLessThan(width(volatile));
    });

    it('reports a negative floor for an all-negative series rather than clamping to zero', () => {
      const f = forecastNextMonthNet([-100, -200, -150, -300])!;
      expect(f.nextMonthNet).toBeLessThan(0);
      expect(f.lowerBound95).toBeLessThan(f.nextMonthNet);
    });

    it('holds the bound ≤ point invariant across trends and window sizes', () => {
      const series = [
        [100, 200, 300, 400],
        [400, 300, 200, 100],
        [500, 500, 500, 100],
        [0, 0, 0, 0, 1000],
        [1000, 0, 0, 0, 0, 0],
        [-50, 120, -30, 90, 15, -5],
      ];
      for (const s of series) {
        const f = forecastNextMonthNet(s)!;
        expect(f.lowerBound95).toBeLessThanOrEqual(f.nextMonthNet);
      }
    });
  });

  describe('robustness', () => {
    it('rejects non-finite values', () => {
      expect(forecastNextMonthNet([100, 200, NaN, 400])).toBeNull();
      expect(forecastNextMonthNet([100, 200, Infinity, 400])).toBeNull();
    });

    it('is deterministic and does not mutate its input', () => {
      const input = [120, 340, 210, 450, 300];
      const snapshot = [...input];
      const a = forecastNextMonthNet(input);
      const b = forecastNextMonthNet(input);
      expect(a).toEqual(b);
      expect(input).toEqual(snapshot);
    });
  });
});
