import { DEFAULT_POLICY, decideLoan, DEFAULT_PRODUCTS, REASON_CATEGORY_LABELS, type LoanDecisionInput, type ReasonCategory } from '../src/lib/loans';

const baseInput: LoanDecisionInput = {
  score: 780,
  band: 'Strong',
  confidence: 0.9,
  avgMonthlySurplus: 1200,
  monthlyDebtService: 200,
  avgIncome: 3000,
  requestedAmount: 5000,
  products: DEFAULT_PRODUCTS,
  adverseRecord: 'none',
};

describe('decideLoan', () => {
  it('approves a strong score with high confidence, within affordability, and explains why', () => {
    const r = decideLoan(baseInput);
    expect(r.decision).toBe('approve');
    expect(r.maxAmount).toBeGreaterThan(0);
    expect(r.installment).toBeGreaterThan(0);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.some((x) => /tier|approve/i.test(x))).toBe(true);
  });

  it('routes a thin/low score to the Emergency Micro safety net (post-Phase 6 policy)', () => {
    // Phase 6 added an Emergency Micro tier (minScore 300, max RM500) so thin-score applicants
    // are no longer auto-declined  they get routed to a tiny, capped safety-net loan instead.
    // This reflects the inclusion thesis: a struggling hawker is not flatly excluded.
    const r = decideLoan({
      ...baseInput,
      score: 350,
      band: 'Building',
      avgMonthlySurplus: 100,
      avgIncome: 600,
    });
    expect(r.maxAmount).toBeLessThanOrEqual(500);
    expect(r.maxAmount).toBeGreaterThan(0);
    expect(r.reasons.some((x) => /Emergency/i.test(x))).toBe(true);
  });

  it('declines when the score is below even the Emergency minimum (300)', () => {
    const r = decideLoan({
      ...baseInput,
      score: 280,
      band: 'Building',
      avgMonthlySurplus: 100,
      avgIncome: 600,
    });
    expect(r.decision).toBe('decline');
    expect(r.maxAmount).toBe(0);
    expect(r.reasons.some((x) => /below|lowest|minimum/i.test(x))).toBe(true);
  });

  it('approves a mid score at a lower tier than a strong score', () => {
    const strong = decideLoan({ ...baseInput, score: 800, band: 'Excellent' });
    const mid = decideLoan({ ...baseInput, score: 560, band: 'Fair', avgMonthlySurplus: 600, avgIncome: 1800 });
    expect(strong.decision).toBe('approve');
    expect(mid.decision).toBe('approve');
    // Lower-tier products carry smaller ceilings, so the mid-score approval caps lower.
    expect(mid.maxAmount).toBeLessThanOrEqual(strong.maxAmount);
  });

  it('flips an otherwise-approve to refer when confidence is low', () => {
    const confident = decideLoan({ ...baseInput, confidence: 0.9 });
    const unsure = decideLoan({ ...baseInput, confidence: 0.2 });
    expect(confident.decision).toBe('approve');
    expect(unsure.decision).toBe('refer');
    expect(unsure.reasons.some((x) => /confidence/i.test(x))).toBe(true);
  });

  it('refers an applicant with a soft adverse record', () => {
    const r = decideLoan({ ...baseInput, adverseRecord: 'soft' });
    expect(r.decision).toBe('refer');
    expect(r.reasons.some((x) => /adverse/i.test(x))).toBe(true);
  });

  it('declines an applicant with a hard adverse record', () => {
    const r = decideLoan({ ...baseInput, adverseRecord: 'hard' });
    expect(r.decision).toBe('decline');
    expect(r.reasons.some((x) => /adverse/i.test(x))).toBe(true);
  });

  it('declines outright when the data-integrity floor is breached, regardless of a strong score', () => {
    const r = decideLoan({ ...baseInput, score: 800, band: 'Excellent', confidence: 0.9, integrityFloorBreached: true });
    expect(r.decision).toBe('decline');
    expect(r.maxAmount).toBe(0);
    expect(r.reasons.some((x) => /integrity/i.test(x))).toBe(true);
  });

  it('never lets the installment exceed the affordability cap on surplus', () => {
    // High requested amount against a thin surplus should be capped down, not blown through.
    const r = decideLoan({
      ...baseInput,
      requestedAmount: 20000,
      avgMonthlySurplus: 500,
      monthlyDebtService: 100,
      avgIncome: 2000,
    });
    // An offer (approve or refer) carries a non-zero maxAmount/installment that must respect the cap;
    // check the invariant whenever an offer is actually present, not just on full approval.
    if (r.maxAmount > 0) {
      expect(r.installment).toBeLessThanOrEqual(r.maxAmount); // sanity: never larger than principal itself in our ranges
      expect(r.installment).toBeLessThanOrEqual(500 * 0.4 + 0.01); // installment ≤ ~40% of avg surplus
    }
  });

  it('caps the approved amount so the resulting DSR stays within the cap', () => {
    const r = decideLoan({
      ...baseInput,
      requestedAmount: 20000,
      avgMonthlySurplus: 1500,
      monthlyDebtService: 700, // already high relative to income
      avgIncome: 2000,
    });
    // A referral can also carry a non-zero offer (e.g. confidence-driven), and the DSR
    // invariant must hold for it too  check whenever an offer is actually present.
    if (r.maxAmount > 0) {
      const dsr = (700 + r.installment) / 2000;
      expect(dsr).toBeLessThanOrEqual(0.4 + 1e-9);
    }
  });

  it('returns reasons on every decision branch', () => {
    const decisions = [
      decideLoan(baseInput),
      decideLoan({ ...baseInput, score: 350, band: 'Building' }),
      decideLoan({ ...baseInput, confidence: 0.1 }),
      decideLoan({ ...baseInput, adverseRecord: 'soft' }),
      decideLoan({ ...baseInput, adverseRecord: 'hard' }),
    ];
    for (const d of decisions) {
      expect(d.reasons.length).toBeGreaterThan(0);
      for (const reason of d.reasons) expect(typeof reason).toBe('string');
    }
  });
});

describe('DEFAULT_PRODUCTS', () => {
  it('working-capital tiers (Starter/Growth/Scale) are ascending and sit in RM2k–20k', () => {
    const working = DEFAULT_PRODUCTS.filter((p) => p.id !== 'emergency');
    expect(working.length).toBeGreaterThanOrEqual(3);
    expect(working.length).toBeLessThanOrEqual(4);
    const sorted = [...working].sort((a, b) => a.minScore - b.minScore);
    expect(sorted).toEqual(working);
    for (const p of working) {
      expect(p.minAmount).toBeGreaterThanOrEqual(2000);
      expect(p.maxAmount).toBeLessThanOrEqual(20000);
      expect(p.minAmount).toBeLessThan(p.maxAmount);
      expect(p.tenorMonths).toBeGreaterThan(0);
      expect(p.apr).toBeGreaterThan(0);
      expect(p.apr).toBeLessThan(1);
    }
  });

  it('includes an Emergency Micro tier (sub-RM500 safety net for thin-coverage borrowers)', () => {
    const emergency = DEFAULT_PRODUCTS.find((p) => p.id === 'emergency')!;
    expect(emergency).toBeDefined();
    expect(emergency.maxAmount).toBeLessThanOrEqual(500);
    expect(emergency.minScore).toBe(300); // open to any score
  });
});

describe('decideLoan  Phase 6 coverage-tier filter', () => {
  it('back-compat: omitting coverage inputs leaves behaviour identical', () => {
    const r = decideLoan(baseInput); // strong applicant, no coverage inputs
    expect(r.decision).toBe('approve');
    expect(r.reasons.some((x) => /coverage/i.test(x))).toBe(false);
  });

  it('coverage <30 days: forces REFER and caps to Emergency tier even on a strong applicant', () => {
    const r = decideLoan({ ...baseInput, coverageDaysCovered: 10, coverageRatio: 0.11 });
    expect(r.decision).toBe('refer');
    expect(r.maxAmount).toBeLessThanOrEqual(500);
    expect(r.reasons.some((x) => /coverage/i.test(x) && /Emergency/i.test(x))).toBe(true);
  });

  it('coverage 30–89 days: caps eligibility to Starter Capital (≤ RM5,000)', () => {
    const r = decideLoan({
      ...baseInput,
      score: 800,
      band: 'Excellent',
      coverageDaysCovered: 60,
      coverageRatio: 0.66,
    });
    expect(r.decision).toBe('approve');
    expect(r.maxAmount).toBeLessThanOrEqual(5000);
    expect(r.reasons.some((x) => /coverage/i.test(x) && /Starter/i.test(x))).toBe(true);
  });

  it('coverage ≥90 days and ratio ≥50%: full ladder available (matches today\'s behaviour)', () => {
    const r = decideLoan({
      ...baseInput,
      requestedAmount: 18000,
      coverageDaysCovered: 100,
      coverageRatio: 0.7,
    });
    expect(r.decision).toBe('approve');
    // With a strong applicant and high requested amount, the Scale tier ceiling (20k) is reachable.
    expect(r.maxAmount).toBeGreaterThan(5000);
  });

  it('coverage ≥90 days but ratio <50%: capped to Starter despite tenure (sparse-coverage cap)', () => {
    const r = decideLoan({
      ...baseInput,
      requestedAmount: 18000,
      coverageDaysCovered: 100,
      coverageRatio: 0.3,
    });
    expect(r.maxAmount).toBeLessThanOrEqual(5000);
    expect(r.reasons.some((x) => /coverage/i.test(x) && /Starter/i.test(x))).toBe(true);
  });
});

// ── Categorized reasons (Brief J)  every decision path carries its category ──

describe('categorized reasons (Brief J)', () => {
  it('derives the flat reasons list from the categorized list, in order', () => {
    const r = decideLoan(baseInput);
    expect(r.categorizedReasons).toBeDefined();
    expect(r.reasons).toEqual(r.categorizedReasons!.map((x) => x.text));
  });

  it('affordability: caps keep their numbers and carry the affordability category', () => {
    const r = decideLoan({ ...baseInput, requestedAmount: 20000, avgMonthlySurplus: 500 });
    const afford = r.categorizedReasons!.filter((x) => x.category === 'affordability');
    expect(afford.length).toBeGreaterThan(0);
    expect(afford.some((x) => /RM/.test(x.text))).toBe(true);
  });

  it('affordability: a no-headroom decline is categorized affordability', () => {
    const r = decideLoan({ ...baseInput, score: 560, band: 'Fair', avgMonthlySurplus: 0, monthlyDebtService: 900, avgIncome: 1800 });
    expect(r.decision).toBe('decline');
    expect(r.categorizedReasons!.some((x) => x.category === 'affordability')).toBe(true);
  });

  it('data-quality: the low-confidence refer reads as a remedy, never an accusation', () => {
    const r = decideLoan({ ...baseInput, confidence: 0.2 });
    const row = r.categorizedReasons!.find((x) => x.category === 'data-quality');
    expect(row).toBeDefined();
    expect(row!.text).toMatch(/could not verify enough/i);
    expect(row!.text).toMatch(/20%/);
    expect(row!.text).toMatch(/more verified history/i);
  });

  it('data-quality: coverage caps carry the data-quality category', () => {
    const r = decideLoan({ ...baseInput, coverageRatio: 15 / 90, coverageDaysCovered: 15 });
    expect(r.categorizedReasons!.filter((x) => x.category === 'data-quality').length).toBeGreaterThan(0);
  });

  it('integrity: the floor decline is categorized integrity and never reads as an accusation', () => {
    const r = decideLoan({ ...baseInput, integrityFloorBreached: true });
    const row = r.categorizedReasons!.find((x) => x.category === 'integrity');
    expect(row).toBeDefined();
    expect(row!.text).toMatch(/could not be validated automatically/i);
    expect(row!.text).not.toMatch(/breach|fabricat|fraud|fail/i);
  });

  it('record: adverse records are categorized record', () => {
    expect(decideLoan({ ...baseInput, adverseRecord: 'hard' }).categorizedReasons!.some((x) => x.category === 'record')).toBe(true);
    expect(decideLoan({ ...baseInput, adverseRecord: 'soft' }).categorizedReasons!.some((x) => x.category === 'record')).toBe(true);
  });

  it('policy: tier qualification and the below-minimum decline are categorized policy', () => {
    expect(decideLoan(baseInput).categorizedReasons!.some((x) => x.category === 'policy')).toBe(true);
    const declined = decideLoan({ ...baseInput, score: 280, band: 'Building' });
    expect(declined.categorizedReasons!.some((x) => x.category === 'policy')).toBe(true);
  });

  it('exposes a display label for every category', () => {
    const cats: ReasonCategory[] = ['affordability', 'data-quality', 'integrity', 'policy', 'record'];
    for (const c of cats) expect(REASON_CATEGORY_LABELS[c].length).toBeGreaterThan(0);
  });
});

// ── Decision breakdown (Brief K)  the caps the engine already computes, exposed ──

describe('decision breakdown (Brief K)', () => {
  it('exposes the intermediate caps on an approve, consistent with the offer', () => {
    const r = decideLoan(baseInput);
    expect(r.breakdown).toBeDefined();
    const b = r.breakdown!;
    expect(b.requestedAmount).toBe(5000);
    expect(b.offered).toBe(r.maxAmount);
    expect(b.tierLabel.length).toBeGreaterThan(0);
    expect(b.tierCeiling).toBeGreaterThan(0);
    expect(b.surplusCapPrincipal).toBeGreaterThan(0);
    expect(b.dsrCapPrincipal).toBeGreaterThan(0);
  });

  it('the offer never exceeds the tier ceiling or either cap', () => {
    const r = decideLoan({ ...baseInput, requestedAmount: 20000, avgMonthlySurplus: 500, monthlyDebtService: 100, avgIncome: 2000 });
    const b = r.breakdown!;
    expect(r.maxAmount).toBeLessThanOrEqual(b.tierCeiling + 1e-6);
    expect(r.maxAmount).toBeLessThanOrEqual(Math.max(b.surplusCapPrincipal, 0) + 1e-6);
    expect(r.maxAmount).toBeLessThanOrEqual(Math.max(b.dsrCapPrincipal, 0) + 1e-6);
  });

  it('is absent when no tier was selected (hard adverse, integrity floor, below the ladder)', () => {
    expect(decideLoan({ ...baseInput, adverseRecord: 'hard' }).breakdown).toBeUndefined();
    expect(decideLoan({ ...baseInput, integrityFloorBreached: true }).breakdown).toBeUndefined();
    expect(decideLoan({ ...baseInput, score: 280, band: 'Building' }).breakdown).toBeUndefined();
  });

  it('is present with offered 0 on an affordability decline, keeping the caps that bit', () => {
    const r = decideLoan({ ...baseInput, score: 560, band: 'Fair', avgMonthlySurplus: 0, monthlyDebtService: 900, avgIncome: 1800 });
    expect(r.decision).toBe('decline');
    expect(r.breakdown).toBeDefined();
    expect(r.breakdown!.offered).toBe(0);
    expect(r.breakdown!.tierMinAmount).toBeGreaterThan(0);
  });
});

// ── Lender policy (Brief N)  mirrored in LenderConsole/lib/loans.test.ts ─────
// A starter-tier fixture where affordability genuinely binds, so tightening a cap
// visibly shrinks the offer (at baseInput's scale tier the ceiling binds instead).
const starterInput: LoanDecisionInput = { ...baseInput, score: 560, band: 'Fair' };

describe('lender policy (Brief N)', () => {
  it('locks DEFAULT_POLICY to the historical hardcoded thresholds + pricing defaults', () => {
    expect(DEFAULT_POLICY).toEqual({
      minConfidenceToApprove: 0.5,
      maxInstallmentShareOfSurplus: 0.35,
      maxDsr: 0.4,
      emergencyOnlyBelowDays: 30,
      fullLadderFromDays: 90,
      minCoverageRatioForFullLadder: 0.5,
      costOfFunds: 0.05,
      targetReturn: 0.06,
    });
  });

  it('regression guard: omitted policy and an explicit DEFAULT_POLICY are identical on every path', () => {
    const cases: LoanDecisionInput[] = [
      baseInput,
      starterInput,
      { ...baseInput, confidence: 0.2 },
      { ...baseInput, coverageRatio: 15 / 90, coverageDaysCovered: 15 },
      { ...baseInput, coverageRatio: 40 / 90, coverageDaysCovered: 40 },
      { ...baseInput, requestedAmount: 20000, avgMonthlySurplus: 300 },
      { ...baseInput, score: 280, band: 'Building' },
      { ...baseInput, adverseRecord: 'soft' },
      { ...starterInput, avgMonthlySurplus: 0, monthlyDebtService: 900, avgIncome: 1800 },
    ];
    for (const c of cases) expect(decideLoan({ ...c, policy: DEFAULT_POLICY })).toEqual(decideLoan(c));
  });

  it('a tighter DSR cap shrinks the offer and is cited in the reasons', () => {
    const dflt = decideLoan(starterInput);
    const tight = decideLoan({ ...starterInput, policy: { ...DEFAULT_POLICY, maxDsr: 0.2 } });
    expect(tight.maxAmount).toBeLessThan(dflt.maxAmount);
    expect(tight.reasons.join(' ')).toMatch(/20% DSR cap/);
  });

  it('a tighter surplus share shrinks the offer and is cited in the reasons', () => {
    const dflt = decideLoan(starterInput);
    const tight = decideLoan({ ...starterInput, policy: { ...DEFAULT_POLICY, maxInstallmentShareOfSurplus: 0.25 } });
    expect(tight.maxAmount).toBeLessThan(dflt.maxAmount);
    expect(tight.reasons.join(' ')).toMatch(/25% of avg surplus/);
  });

  it('a custom confidence floor flips a default approve to refer and cites the custom floor', () => {
    const r = decideLoan({ ...baseInput, confidence: 0.55, policy: { ...DEFAULT_POLICY, minConfidenceToApprove: 0.6 } });
    expect(r.decision).toBe('refer');
    expect(r.reasons.join(' ')).toMatch(/60% auto-approval floor/);
  });

  it('custom coverage gates move the tier boundaries', () => {
    // 40 covered days sits in the default Starter band; raising the emergency gate to 45
    // pushes the same applicant into emergency-only + forced referral.
    const covered = { ...baseInput, coverageRatio: 40 / 90, coverageDaysCovered: 40 };
    expect(decideLoan(covered).maxAmount).toBeGreaterThan(500);
    const custom = decideLoan({ ...covered, policy: { ...DEFAULT_POLICY, emergencyOnlyBelowDays: 45 } });
    expect(custom.decision).toBe('refer');
    expect(custom.maxAmount).toBeLessThanOrEqual(500);
  });

  it('a custom full-ladder coverage ratio is cited in the sparse-coverage reason', () => {
    const r = decideLoan({
      ...baseInput,
      coverageRatio: 0.55,
      coverageDaysCovered: 90,
      policy: { ...DEFAULT_POLICY, minCoverageRatioForFullLadder: 0.6 },
    });
    expect(r.reasons.join(' ')).toMatch(/60%/);
    expect(r.maxAmount).toBeLessThanOrEqual(5000);
  });
});
