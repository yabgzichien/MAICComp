import {
  provenanceTrust,
  benfordConformity,
  leadingDigitHistogram,
  computeDataConfidence,
  reconcileBalances,
  incomePointAnomaly,
  isGenericIncomePayer,
  classifyIncomePayer,
  p2pIncomeValueRatio,
  incomeMonthlySkew,
  sourceIsolationGap,
  assessIncomeIntegrity,
  type ConfidenceTxn,
} from '../src/lib/dataConfidence';

describe('provenanceTrust', () => {
  it('trusts verified fully and manual least', () => {
    expect(provenanceTrust(['verified', 'verified'])).toBeCloseTo(1, 6);
    expect(provenanceTrust(['manual', 'manual'])).toBeCloseTo(0.4, 6);
    expect(provenanceTrust([])).toBe(0.5);
  });
});

// 100 amounts whose leading digits follow Benford's Law, spread across three
// decades (×1/×10/×100) so the dispersion gate sees a genuinely wide range 
// Benford-conforming data spans orders of magnitude by nature.
function benfordAmounts(): number[] {
  const counts = [0, 30, 18, 12, 10, 8, 7, 6, 5, 4]; // index = leading digit
  const out: number[] = [];
  for (let d = 1; d <= 9; d++)
    for (let i = 0; i < counts[d]; i++) out.push((d * 10 + (i % 9) + 1) * [1, 10, 100][i % 3]);
  return out;
}

describe('benfordConformity', () => {
  it('is high for a Benford-conforming set', () => {
    expect(benfordConformity(benfordAmounts())).toBeGreaterThan(0.8);
  });
  it('is low for a fabricated single-digit set', () => {
    expect(benfordConformity(new Array(50).fill(500))).toBeLessThan(0.6);
  });
  it('is neutral with too little data', () => {
    expect(benfordConformity([10, 20, 30])).toBe(0.5);
  });
});

describe('leadingDigitHistogram', () => {
  it('counts leading digits 1–9 (index 0 = digit 1)', () => {
    expect(leadingDigitHistogram([12, 150, 23, 9.5, 900])).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 2]);
  });
  it('uses absolute values and skips zero / sub-1 amounts', () => {
    expect(leadingDigitHistogram([-45, 0, 0.4, 7])).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 0]);
  });
  it('returns nine zeros for an empty list', () => {
    expect(leadingDigitHistogram([])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('agrees with benfordConformity on the digits it feeds it', () => {
    const amounts = benfordAmounts();
    const hist = leadingDigitHistogram(amounts);
    expect(hist.reduce((s, c) => s + c, 0)).toBe(amounts.length);
    expect(hist[0]).toBe(30); // 30 amounts led by digit 1 in the fixture
  });
});

describe('computeDataConfidence', () => {
  it('is high for clean extracted data', () => {
    const txns: ConfidenceTxn[] = benfordAmounts().map((amount, i) => ({
      amount: amount + i * 0.01, // unique, non-round
      source: 'extracted',
      merchantKey: `m${i}`,
      date: `2026-0${(i % 6) + 1}-15`,
    }));
    expect(computeDataConfidence(txns).confidence).toBeGreaterThan(0.7);
  });
  it('is low for manual, round, duplicated data', () => {
    const txns: ConfidenceTxn[] = new Array(40).fill(0).map(() => ({
      amount: 500,
      source: 'manual',
      merchantKey: 'x',
      date: '2026-01-01',
    }));
    expect(computeDataConfidence(txns).confidence).toBeLessThan(0.4);
  });

  it('high-fraud-probability profile yields materially lower confidence than heuristics alone', () => {
    // Build a fabricated-like profile
    const fabricated: ConfidenceTxn[] = Array.from({ length: 50 }, (_, i) => ({
      amount: 100 * (1 + (i % 5)),  // round multiples of 100
      source: 'manual' as const,
      merchantKey: i % 3 === 0 ? 'grab' : 'shopee',  // only 2 merchants
      date: `2025-01-${String((i * 7 % 28) + 1).padStart(2, '0')}`,  // very regular dates
    }));

    const result = computeDataConfidence(fabricated);
    // Should be lower than the same profile without ML (rough sanity check: < 0.5)
    expect(result.confidence).toBeLessThan(0.5);
    // ML reasons should appear in the reasons list
    expect(result.reasons.some(r => r.key.startsWith('ml_'))).toBe(true);
  });

  describe('with optional coverageRatio', () => {
    // Shared base profile  modest-quality data so coverage can move the dial visibly.
    const baseTxns: ConfidenceTxn[] = Array.from({ length: 40 }, (_, i) => ({
      amount: 30 + i * 0.73, // unique, non-round
      source: 'extracted' as const,
      merchantKey: `m${i}`,
      date: `2026-0${(i % 6) + 1}-15`,
    }));

    it('back-compat: omitting coverageRatio yields identical results to today', () => {
      const a = computeDataConfidence(baseTxns);
      const b = computeDataConfidence(baseTxns, undefined);
      expect(b.confidence).toBeCloseTo(a.confidence, 9);
      expect(b.reasons).toEqual(a.reasons);
    });

    it('high coverage yields higher confidence than low coverage on the same txns', () => {
      const hi = computeDataConfidence(baseTxns, 0.8);
      const lo = computeDataConfidence(baseTxns, 0.05);
      expect(hi.confidence).toBeGreaterThan(lo.confidence);
    });

    it('appends a coverage reason row reporting the percentage', () => {
      const r = computeDataConfidence(baseTxns, 0.62);
      const row = r.reasons.find((x) => x.key === 'coverage');
      expect(row).toBeDefined();
      expect(row!.detail).toContain('62%');
      expect(row!.ok).toBe(true); // 62% >= 30% threshold
    });

    it('coverage reason marks ok=false when below the 30% threshold', () => {
      const r = computeDataConfidence(baseTxns, 0.15);
      expect(r.reasons.find((x) => x.key === 'coverage')!.ok).toBe(false);
    });
  });

  describe('with optional expenseRatio (plausibility)', () => {
    const baseTxns: ConfidenceTxn[] = Array.from({ length: 40 }, (_, i) => ({
      amount: 30 + i * 0.73,
      source: 'extracted' as const,
      merchantKey: `m${i}`,
      date: `2026-0${(i % 6) + 1}-15`,
    }));

    it('back-compat: omitting expenseRatio leaves results unchanged', () => {
      const a = computeDataConfidence(baseTxns, 0.6);
      const b = computeDataConfidence(baseTxns, 0.6, undefined);
      expect(b.confidence).toBeCloseTo(a.confidence, 9);
      expect(b.reasons).toEqual(a.reasons);
    });

    it('implausibly low expenses vs income reduce confidence and flag a reason', () => {
      const healthy = computeDataConfidence(baseTxns, 0.6, 0.75); // spends 75% of income
      const implausible = computeDataConfidence(baseTxns, 0.6, 0.1); // spends only 10%
      expect(implausible.confidence).toBeLessThan(healthy.confidence);
      const row = implausible.reasons.find((x) => x.key === 'plausibility')!;
      expect(row).toBeDefined();
      expect(row.ok).toBe(false);
    });

    it('a healthy expense ratio passes the plausibility check (ok=true, no penalty)', () => {
      const r = computeDataConfidence(baseTxns, 0.6, 0.7);
      const row = r.reasons.find((x) => x.key === 'plausibility')!;
      expect(row.ok).toBe(true);
      // No haircut at/above the floor: equals the no-plausibility result.
      expect(r.confidence).toBeCloseTo(computeDataConfidence(baseTxns, 0.6).confidence, 9);
    });
  });
});

// ── Asymmetric-fraud integrity rings ──────────────────────────────────────────

const expenseBase = (): ConfidenceTxn[] =>
  Array.from({ length: 60 }, (_, i) => ({
    amount: 18 + i * 1.37, // unique, non-round
    source: 'extracted' as const,
    merchantKey: `k${i}`,
    merchantRaw: `Kedai ${i}`,
    date: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
    type: 'expense' as const,
  }));

const realIncome = (): ConfidenceTxn[] =>
  [1450, 1500, 1550, 1480, 1520, 1510].map((amount, i) => ({
    amount,
    source: 'extracted' as const,
    merchantKey: 'acme',
    merchantRaw: 'ACME SDN BHD',
    date: `2026-0${(i % 6) + 1}-28`,
    type: 'income' as const,
  }));

const fakeIncome = (): ConfidenceTxn[] =>
  [9000, 9500].map((amount, i) => ({
    amount,
    source: 'manual' as const,
    merchantKey: 'p2p',
    merchantRaw: 'DUITNOW TRANSFER',
    date: `2026-0${i + 1}-15`,
    type: 'income' as const,
  }));

describe('isGenericIncomePayer', () => {
  it('treats registered companies / gateways / payroll as verified', () => {
    expect(isGenericIncomePayer({ amount: 1, source: 'manual', merchantRaw: 'ACME SDN BHD' })).toBe(false);
    expect(isGenericIncomePayer({ amount: 1, source: 'manual', merchantRaw: 'GrabPay payout' })).toBe(false);
    expect(isGenericIncomePayer({ amount: 1, source: 'manual', merchantRaw: 'Monthly salary' })).toBe(false);
  });
  it('treats P2P transfers, bare names, and blanks as generic', () => {
    expect(isGenericIncomePayer({ amount: 1, source: 'manual', merchantRaw: 'DUITNOW TRANSFER' })).toBe(true);
    expect(isGenericIncomePayer({ amount: 1, source: 'manual', merchantRaw: 'John Tan' })).toBe(true);
    expect(isGenericIncomePayer({ amount: 1, source: 'manual', merchantRaw: '' })).toBe(true);
  });
});

describe('reconcileBalances (Ring 1.1)', () => {
  const chain = (incomeBalance: number): ConfidenceTxn[] => [
    { amount: 100, source: 'extracted', type: 'expense', date: '2026-01-01', balance: 900 },
    { amount: 500, source: 'extracted', type: 'income', date: '2026-01-02', balance: incomeBalance },
    { amount: 200, source: 'extracted', type: 'expense', date: '2026-01-03', balance: incomeBalance - 200 },
  ];
  it('a consistent ledger has no breaks', () => {
    // prev balance is the first row's; 900 → +500 = 1400 → −200 = 1200
    const txns: ConfidenceTxn[] = [
      { amount: 1000, source: 'extracted', type: 'income', date: '2026-01-01', balance: 1000 },
      ...chain(1400).slice(0),
    ];
    const r = reconcileBalances(txns);
    expect(r.breaks).toBe(0);
    expect(r.incomeCoincidentBreaks).toBe(0);
    expect(r.reconcilablePairs).toBeGreaterThan(0);
  });
  it('flags an income row whose balance jump does not reconcile', () => {
    const txns: ConfidenceTxn[] = [
      { amount: 1000, source: 'extracted', type: 'income', date: '2026-01-01', balance: 1000 },
      ...chain(5000), // income balance jumped to 5000 instead of 1400
    ];
    const r = reconcileBalances(txns);
    expect(r.incomeCoincidentBreaks).toBeGreaterThanOrEqual(1);
  });
  it('is inert when rows carry no balance', () => {
    expect(reconcileBalances(realIncome()).reconcilablePairs).toBe(0);
  });
});

describe('incomePointAnomaly (Ring 1.2)', () => {
  it('fires on an isolated high income from a weak source', () => {
    const r = incomePointAnomaly([...realIncome(), ...fakeIncome()]);
    expect(r.maxModZ).toBeGreaterThan(3.5);
    expect(r.weakSource).toBe(true);
  });
  it('stays quiet for a regular income stream', () => {
    const r = incomePointAnomaly(realIncome());
    expect(r.maxModZ).toBeLessThan(3.5);
  });
  it('uses MAD, not σ  the outlier cannot hide itself by inflating the threshold', () => {
    // With σ the two 9000s would inflate the spread; MAD stays anchored to the genuine cluster.
    expect(incomePointAnomaly([...realIncome(), ...fakeIncome()]).maxModZ).toBeGreaterThan(10);
  });
});

describe('p2pIncomeValueRatio (Ring 2.2)', () => {
  it('measures the income value share from generic payers', () => {
    expect(p2pIncomeValueRatio(realIncome())).toBeCloseTo(0, 6);
    expect(p2pIncomeValueRatio([...realIncome(), ...fakeIncome()])).toBeGreaterThan(0.6);
  });
});

describe('incomeMonthlySkew (Ring 2.1)', () => {
  const month = (mk: string, inc: number, exp: number): ConfidenceTxn[] => [
    { amount: inc, source: 'manual', type: 'income', date: `${mk}-10` },
    { amount: exp, source: 'extracted', type: 'expense', date: `${mk}-12` },
  ];
  it('flags an income spike with no spending response', () => {
    const txns = [...month('2026-01', 1500, 1000), ...month('2026-02', 1500, 1000), ...month('2026-03', 1500, 1000), ...month('2026-04', 6000, 1000)];
    expect(incomeMonthlySkew(txns)).toBe(true);
  });
  it('does not flag stable income', () => {
    const txns = [...month('2026-01', 1500, 1000), ...month('2026-02', 1500, 1000), ...month('2026-03', 1500, 1000), ...month('2026-04', 1600, 1000)];
    expect(incomeMonthlySkew(txns)).toBe(false);
  });
});

describe('sourceIsolationGap (Ring 3.1)', () => {
  it('is large when expenses are verified but income is manual', () => {
    const txns: ConfidenceTxn[] = [
      { amount: 2000, source: 'extracted', type: 'expense', date: '2026-01-01' },
      { amount: 2000, source: 'manual', type: 'income', date: '2026-01-02' },
    ];
    expect(sourceIsolationGap(txns)).toBeGreaterThan(0.6);
  });
  it('is ~0 when income and expenses share the same pipeline', () => {
    const txns: ConfidenceTxn[] = [
      { amount: 2000, source: 'extracted', type: 'expense', date: '2026-01-01' },
      { amount: 2000, source: 'extracted', type: 'income', date: '2026-01-02' },
    ];
    expect(sourceIsolationGap(txns)).toBeCloseTo(0, 6);
  });
});

describe('assessIncomeIntegrity + computeDataConfidence (the asymmetric attack)', () => {
  it('breaches the floor and caps confidence for injected high income', () => {
    const attack = [...expenseBase(), ...realIncome(), ...fakeIncome()];
    const integ = assessIncomeIntegrity(attack);
    expect(integ.floorBreached).toBe(true); // ≥2 hard conditions (weak outlier + source isolation)
    expect(integ.hardCap).toBe(true);

    const r = computeDataConfidence(attack);
    expect(r.confidence).toBeLessThanOrEqual(0.39);
    expect(r.integrityFloorBreached).toBe(true);
    expect(r.reasons.some((x) => x.key.startsWith('integrity_'))).toBe(true);
  });

  it('leaves a genuine type-bearing profile untouched (no penalty, no cap, no reasons added)', () => {
    const genuine = [...expenseBase(), ...realIncome()];
    const stripped = genuine.map(({ type, merchantRaw, ...rest }) => rest); // drop integrity inputs
    const withType = computeDataConfidence(genuine);
    const withoutType = computeDataConfidence(stripped);
    expect(withType.integrityFloorBreached).toBe(false);
    expect(withType.confidence).toBeCloseTo(withoutType.confidence, 9);
    expect(withType.reasons.some((x) => x.key.startsWith('integrity_'))).toBe(false);
  });

  it('back-compat: type-free input is byte-identical to before (no integrity field effect)', () => {
    const txns: ConfidenceTxn[] = expenseBase().map(({ type, merchantRaw, ...rest }) => rest);
    const r = computeDataConfidence(txns);
    expect(r.integrityFloorBreached).toBe(false);
    expect(r.reasons.some((x) => x.key.startsWith('integrity_'))).toBe(false);
  });
});

// ── Brief D fairness patch  Benford dispersion gate ──────────────────────────

describe('benford dispersion gate', () => {
  // 60 honest daily gig payouts RM80–120: plenty of rows, but well under an
  // order of magnitude of spread  Benford is structurally uninformative here.
  const narrowIncomes = Array.from({ length: 60 }, (_, i) => 80 + ((i * 7) % 40) + 0.45);

  it('returns neutral 0.5 when amounts span too narrow a range', () => {
    expect(benfordConformity(narrowIncomes)).toBe(0.5);
  });

  it('stays live when the same data spans multiple decades', () => {
    const wide = narrowIncomes.map((a, i) => a * [1, 10, 100][i % 3]);
    expect(benfordConformity(wide)).not.toBe(0.5);
  });
});

// ── Brief D fairness patch  three-tier payer classification ──────────────────

describe('classifyIncomePayer', () => {
  const t = (merchantRaw: string): ConfidenceTxn => ({ amount: 50, source: 'extracted', merchantRaw, type: 'income' });

  it('verified: registered/commercial payer strings (unchanged)', () => {
    expect(classifyIncomePayer(t('ACME SDN BHD'))).toBe('verified');
    expect(classifyIncomePayer(t('GRAB MALAYSIA PAYOUT'))).toBe('verified');
  });

  it('qr-merchant: DuitNow QR / QRPay receipt strings are neutral, not P2P', () => {
    expect(classifyIncomePayer(t('DUITNOW QR 8834 GERAI MAKCIK KIAH'))).toBe('qr-merchant');
    expect(classifyIncomePayer(t('QRPAY SALES 00123'))).toBe('qr-merchant');
    expect(classifyIncomePayer(t('MERCHANT QR PAYMENT RECEIVED'))).toBe('qr-merchant');
  });

  it('generic: ad-hoc transfers, cash deposits, blanks, and bare names stay penalized', () => {
    expect(classifyIncomePayer(t('DUITNOW TRANSFER'))).toBe('generic');
    expect(classifyIncomePayer(t('TRANSFER FROM AHMAD'))).toBe('generic');
    expect(classifyIncomePayer(t('CASH DEPOSIT'))).toBe('generic');
    expect(classifyIncomePayer(t(''))).toBe('generic');
    expect(classifyIncomePayer(t('AHMAD BIN ALI'))).toBe('generic');
  });

  it('isGenericIncomePayer treats only the generic tier as generic', () => {
    expect(isGenericIncomePayer(t('DUITNOW QR 8834 GERAI MAKCIK KIAH'))).toBe(false);
    expect(isGenericIncomePayer(t('DUITNOW TRANSFER'))).toBe(true);
  });

  it('p2pIncomeValueRatio counts only the generic tier', () => {
    const txns: ConfidenceTxn[] = [
      { amount: 600, source: 'extracted', merchantRaw: 'DUITNOW QR 88 GERAI', type: 'income' },
      { amount: 300, source: 'extracted', merchantRaw: 'ACME SDN BHD', type: 'income' },
      { amount: 100, source: 'extracted', merchantRaw: 'TRANSFER FROM AHMAD', type: 'income' },
    ];
    expect(p2pIncomeValueRatio(txns)).toBeCloseTo(0.1, 9);
  });
});

// ── Brief D fairness fixtures ─────────────────────────────────────────────────

describe('fairness fixtures (Brief D)', () => {
  // (a) Honest narrow-band gig earner: 60 daily Grab payouts RM80–120 plus
  // ordinary small expenses, all extracted. Authentic data whose Benford signal
  // is structurally meaningless  must clear the 0.50 approve floor.
  const gigProfile = (): ConfidenceTxn[] => [
    ...Array.from({ length: 60 }, (_, i) => ({
      amount: 80 + ((i * 7) % 40) + 0.45,
      source: 'extracted' as const,
      merchantKey: 'grab',
      merchantRaw: 'GRAB MALAYSIA PAYOUT',
      date: `2026-0${(i % 3) + 4}-${String((i % 28) + 1).padStart(2, '0')}`,
      type: 'income' as const,
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      amount: 8 + ((i * 37) % 370) / 10,
      source: 'extracted' as const,
      merchantKey: `kedai${i}`,
      merchantRaw: `Kedai ${i}`,
      date: `2026-0${(i % 3) + 4}-${String(((i * 2) % 28) + 1).padStart(2, '0')}`,
      type: 'expense' as const,
    })),
  ];

  it('(a) narrow-band gig profile: Benford neutral with an ok reason, confidence clears the approve floor', () => {
    const r = computeDataConfidence(gigProfile(), 0.85, 0.6);
    const benfordRow = r.reasons.find((x) => x.key === 'benford')!;
    expect(benfordRow.ok).toBe(true);
    expect(benfordRow.detail).toBe('amount range too narrow for Benford analysis');
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.integrityFloorBreached).toBeFalsy();
  });

  // (b) Hawker whose income is predominantly DuitNow-QR receipts, extracted
  // from e-wallet screenshots  real sales, not undocumented P2P transfers.
  const hawkerProfile = (): ConfidenceTxn[] => [
    ...Array.from({ length: 40 }, (_, i) => ({
      amount: 15 + ((i * 13) % 75) + 0.6,
      source: 'extracted' as const,
      merchantKey: 'qr-sales',
      merchantRaw: 'DUITNOW QR 8834 GERAI MAKCIK KIAH',
      date: `2026-0${(i % 3) + 4}-${String((i % 28) + 1).padStart(2, '0')}`,
      type: 'income' as const,
    })),
    ...Array.from({ length: 25 }, (_, i) => ({
      amount: 5 + ((i * 17) % 45) + 0.3,
      source: 'extracted' as const,
      merchantKey: `pasar${i}`,
      merchantRaw: `Pasar ${i}`,
      date: `2026-0${(i % 3) + 4}-${String(((i * 3) % 28) + 1).padStart(2, '0')}`,
      type: 'expense' as const,
    })),
  ];

  it('(b) hawker with DuitNow-QR income: no payer penalty, no hard cap', () => {
    const txns = hawkerProfile();
    const integrity = assessIncomeIntegrity(txns);
    expect(integrity.hardCap).toBe(false);
    expect(integrity.reasons.some((x) => x.key === 'integrity_income_payer')).toBe(false);

    const r = computeDataConfidence(txns, 0.8, 0.7);
    expect(r.reasons.some((x) => x.key === 'integrity_income_payer')).toBe(false);
    expect(r.confidence).toBeGreaterThan(0.5);
  });
});
