// Lender requirements + rates (2026-08-03). The contract that matters: every bar shown to a
// borrower is READ OFF the lender's published policy/ladder, so it can never disagree with the
// engine that decides the application.
import {
  amountRangeLabel,
  aprPct,
  aprRangeLabel,
  criteriaBarsSummary,
  criteriaSummary,
  lenderCriteria,
  reachableTier,
  requirementRows,
  tenorRangeLabel,
  tierForScore,
  tierRows,
  type BorrowerStanding,
} from '../src/lib/lenderCriteria';
import { OFFLINE_LENDER, type LenderProfile } from '../src/lib/lenderDirectory';
import { decideLoan, DEFAULT_POLICY, DEFAULT_PRODUCTS, type LenderPolicy } from '../src/lib/loans';

const coop: LenderProfile = {
  id: 'koperasi-sejahtera',
  name: 'Koperasi Usahawan Sejahtera',
  blurb: 'Member-owned credit cooperative.',
  brandColor: '#1f8a5b',
  products: [
    { id: 'growth', label: 'Anggota Growth', minScore: 700, minAmount: 5000, maxAmount: 15000, tenorMonths: 24, apr: 0.1 },
    { id: 'starter', label: 'Anggota Starter', minScore: 600, minAmount: 1500, maxAmount: 4000, tenorMonths: 12, apr: 0.12 },
  ],
  policy: DEFAULT_POLICY,
};

const strongBorrower: BorrowerStanding = { score: 720, confidence: 0.82, daysCovered: 90, coverageRatio: 0.71 };
const thinBorrower: BorrowerStanding = { score: 540, confidence: 0.44, daysCovered: 22, coverageRatio: 0.24 };

describe('lenderCriteria', () => {
  it('summarises the ladder ranges and sorts tiers low to high', () => {
    const c = lenderCriteria(coop);
    expect(c.tiers.map((t) => t.id)).toEqual(['starter', 'growth']);
    expect(c.aprLow).toBeCloseTo(0.1);
    expect(c.aprHigh).toBeCloseTo(0.12);
    expect(c.minScore).toBe(600);
    expect(c.amountLow).toBe(1500);
    expect(c.amountHigh).toBe(15000);
    expect(c.tenorLow).toBe(12);
    expect(c.tenorHigh).toBe(24);
  });

  it('falls back to the engine policy when a lender publishes none', () => {
    const { policy, ...rest } = coop;
    expect(lenderCriteria(rest).policy).toEqual(DEFAULT_POLICY);
  });

  it('never throws on an empty ladder', () => {
    const empty = lenderCriteria({ ...coop, products: [] });
    expect(empty.tiers).toEqual([]);
    expect(aprRangeLabel(empty)).toBe('Rates not published');
    expect(criteriaSummary(empty)).toBe('No published ladder');
    expect(amountRangeLabel(empty)).toBe('');
    expect(tenorRangeLabel(empty)).toBe('');
  });
});

describe('labels', () => {
  it('renders APR with at most one decimal', () => {
    expect(aprPct(0.29)).toBe('29%');
    expect(aprPct(0.285)).toBe('28.5%');
    expect(aprPct(0.1)).toBe('10%');
  });

  it('collapses a single-value range to one figure', () => {
    const flat = lenderCriteria({
      ...coop,
      products: [{ id: 'starter', label: 'Flat', minScore: 600, minAmount: 2000, maxAmount: 2000, tenorMonths: 12, apr: 0.18 }],
    });
    expect(aprRangeLabel(flat)).toBe('18% APR');
    expect(amountRangeLabel(flat)).toBe('RM2,000');
    expect(tenorRangeLabel(flat)).toBe('12 months');
  });

  it('puts rate, entry bar, and amounts in the one-line summary', () => {
    expect(criteriaSummary(lenderCriteria(coop))).toBe('10%–12% APR · score 600+ · RM1,500–15,000');
  });

  it('drops the rate from the bars-only summary, for a header that already shows it', () => {
    expect(criteriaBarsSummary(lenderCriteria(coop))).toBe('Score 600+ · RM1,500–15,000 · 12–24 months');
    expect(criteriaBarsSummary(lenderCriteria({ ...coop, products: [] }))).toBe('No published ladder');
  });
});

describe('requirementRows', () => {
  it('cites the lender’s own thresholds, not the engine defaults', () => {
    const strict: LenderPolicy = { ...DEFAULT_POLICY, minConfidenceToApprove: 0.85, maxDsr: 0.3, fullLadderFromDays: 60 };
    const rows = requirementRows(lenderCriteria({ ...coop, policy: strict }));
    expect(rows.find((r) => r.id === 'instant')!.label).toContain('85%');
    expect(rows.find((r) => r.id === 'dsr')!.label).toContain('30%');
    expect(rows.find((r) => r.id === 'full-ladder')!.label).toContain('60 days');
  });

  it('marks every bar a strong borrower clears', () => {
    const rows = requirementRows(lenderCriteria(coop), strongBorrower);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.score.status).toBe('met');
    expect(byId.assessable.status).toBe('met');
    expect(byId.instant.status).toBe('met');
    expect(byId.history.status).toBe('met');
    expect(byId['full-ladder'].status).toBe('met');
    expect(byId.score.detail).toBe('Yours: 720');
  });

  it('marks the bars a thin file misses', () => {
    const rows = requirementRows(lenderCriteria(coop), thinBorrower);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.score.status).toBe('unmet');
    expect(byId.instant.status).toBe('unmet');
    expect(byId.history.status).toBe('unmet');
    expect(byId['full-ladder'].status).toBe('unmet');
    // Still above the 35% floor to be assessed at all, which is a different (softer) verdict.
    expect(byId.assessable.status).toBe('met');
  });

  it('reports the amount-dependent caps as info, never as a pass or fail', () => {
    for (const you of [undefined, strongBorrower, thinBorrower]) {
      const rows = requirementRows(lenderCriteria(coop), you);
      expect(rows.find((r) => r.id === 'surplus')!.status).toBe('info');
      expect(rows.find((r) => r.id === 'dsr')!.status).toBe('info');
    }
  });

  it('gives no verdict at all without a borrower standing', () => {
    const rows = requirementRows(lenderCriteria(coop));
    expect(rows.filter((r) => r.status !== 'info')).toHaveLength(0);
    expect(rows.filter((r) => r.id === 'score')[0].detail).toBeNull();
  });
});

describe('tiers', () => {
  it('picks the highest rung the score clears, mirroring the engine', () => {
    const c = lenderCriteria(coop);
    expect(tierForScore(720, c.tiers)!.id).toBe('growth');
    expect(tierForScore(640, c.tiers)!.id).toBe('starter');
    expect(tierForScore(540, c.tiers)).toBeNull();
  });

  it('flags reachable rungs, and none without a standing', () => {
    const c = lenderCriteria(coop);
    expect(tierRows(c, { ...strongBorrower, score: 640 }).map((t) => t.qualified)).toEqual([true, false]);
    expect(tierRows(c).every((t) => !t.qualified)).toBe(true);
  });

  it('caps the reachable rung by coverage, not score alone', () => {
    const c = lenderCriteria({ ...coop, products: DEFAULT_PRODUCTS });
    // Score 700 reaches Growth, but 13 covered days is emergency-only under DEFAULT_POLICY.
    expect(tierForScore(700, c.tiers)!.id).toBe('growth');
    expect(reachableTier(c, { score: 700, confidence: 0.59, daysCovered: 13, coverageRatio: 0.14 })!.id).toBe('emergency');
    // A part-window borrower is capped to starter even with a Growth-level score.
    expect(reachableTier(c, { score: 700, confidence: 0.8, daysCovered: 60, coverageRatio: 0.66 })!.id).toBe('starter');
    // Full window, sparse coverage: same cap.
    expect(reachableTier(c, { score: 700, confidence: 0.8, daysCovered: 90, coverageRatio: 0.4 })!.id).toBe('starter');
    // Full window, real coverage: the ladder opens.
    expect(reachableTier(c, { score: 700, confidence: 0.8, daysCovered: 90, coverageRatio: 0.8 })!.id).toBe('growth');
  });

  // The mirror of loans.ts's coverage filter is only worth having if it agrees with the engine
  // that decides the application, so pin the two together across the interesting inputs.
  it('agrees with the tier decideLoan actually selects', () => {
    const c = lenderCriteria({ ...coop, products: DEFAULT_PRODUCTS });
    for (const score of [320, 520, 660, 780]) {
      for (const [daysCovered, coverageRatio] of [
        [10, 0.11],
        [29, 0.32],
        [30, 0.33],
        [89, 0.98],
        [90, 0.42],
        [90, 0.9],
      ] as const) {
        const you: BorrowerStanding = { score, confidence: 0.8, daysCovered, coverageRatio };
        const decided = decideLoan({
          score,
          band: 'Good',
          confidence: 0.8,
          // Roomy affordability: this test is about tier selection, not the amount cap.
          avgMonthlySurplus: 9000,
          monthlyDebtService: 0,
          avgIncome: 20000,
          requestedAmount: 20000,
          products: DEFAULT_PRODUCTS,
          coverageRatio,
          coverageDaysCovered: daysCovered,
        });
        expect(reachableTier(c, you)?.label ?? null).toBe(decided.breakdown?.tierLabel ?? null);
      }
    }
  });

  it('handles the offline fallback lender the directory degrades to', () => {
    const c = lenderCriteria(OFFLINE_LENDER);
    expect(c.tiers).toHaveLength(DEFAULT_PRODUCTS.length);
    expect(c.policy).toEqual(DEFAULT_POLICY);
    expect(criteriaSummary(c)).toContain('APR');
  });
});
