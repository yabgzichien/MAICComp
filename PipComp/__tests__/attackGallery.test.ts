import {
  ATTACKS,
  PAYLOAD_SAMPLE_LIMIT,
  buildAttackPayload,
  runAttack,
  runControl,
  runGallery,
  signalLabel,
} from '../src/lib/attackGallery';

function result(id: string) {
  const a = ATTACKS.find((x) => x.id === id);
  if (!a) throw new Error(`no attack ${id}`);
  return runAttack(a);
}

describe('attackGallery', () => {
  it('catches the injected-salary asymmetric attack (the Phase-11 target)', () => {
    const r = result('injected-salary');
    expect(r.verdict).toBe('caught');
    expect(r.decision === 'decline' || r.decision === 'refer').toBe(true);
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it('catches the ledger balance break via the reconciliation ring (declines)', () => {
    const r = result('balance-break');
    expect(r.floorBreached).toBe(true);
    expect(r.decision).toBe('decline');
    expect(r.verdict).toBe('caught');
  });

  it('flags the income-only curated statement via the plausibility check', () => {
    const r = result('income-only');
    // Confidence is dented; the attack is at least flagged, never cleanly approved.
    expect(r.verdict).not.toBe('missed');
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it('runs the whole gallery and classifies every attack', () => {
    const results = runGallery();
    expect(results.length).toBe(ATTACKS.length);
    for (const r of results) {
      expect(['caught', 'flagged', 'missed']).toContain(r.verdict);
      expect(r.txnCount).toBeGreaterThan(0);
    }
  });

  it('catches every attack in the corpus  the demo\'s 6/6 invariant', () => {
    // Regression lock for the fairness patch (Brief D): loosening Benford and the
    // payer tiers for honest narrow-band earners must not let any attack through.
    const verdicts = Object.fromEntries(runGallery().map((r) => [r.id, r.verdict]));
    expect(verdicts).toEqual({
      'injected-salary': 'caught',
      'all-p2p-income': 'caught',
      'round-number-fabrication': 'caught',
      'income-only': 'caught',
      'balance-break': 'caught',
      'source-isolation': 'caught',
    });
  });
});

describe('the control (what makes 6/6 mean anything)', () => {
  it('lets honest data through the same probe the attacks face', () => {
    // The load-bearing claim of the whole gallery. An engine that declined every applicant would
    // also "catch" all six attacks; this is the only test that distinguishes the two.
    const c = runControl();
    expect(c.passed).toBe(true);
    expect(c.decision).toBe('approve');
    expect(c.maxAmount).toBeGreaterThan(0);
  });

  it('scores honest data clearly above every attack', () => {
    const c = runControl();
    for (const r of runGallery()) {
      expect(c.confidence).toBeGreaterThan(r.confidence);
    }
  });

  it('is deterministic', () => {
    expect(runControl()).toEqual(runControl());
  });
});

describe('signal labels (naming the check before quoting it)', () => {
  it('names every check the corpus actually fires', () => {
    for (const r of runGallery()) {
      for (const s of r.signals) {
        expect(signalLabel(s.key)).not.toBe('Data-integrity check'); // no unmapped keys on the demo path
        expect(s.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('folds the ML features under one name and falls back safely', () => {
    expect(signalLabel('ml_round_ratio')).toBe('The fraud model');
    expect(signalLabel('ml_anything_else')).toBe('The fraud model');
    expect(signalLabel('something_new')).toBe('Data-integrity check');
  });
});

describe('attack payloads (the rows the demo shows, not just describes)', () => {
  it('isolates the two injected P2P deposits behind the salary spike', () => {
    const p = result('injected-salary').payload;
    expect(p.rule).toBe('hand-typed');
    expect(p.count).toBe(2);
    expect(p.rows.map((r) => r.amount)).toEqual([9000, 9500]);
    for (const row of p.rows) {
      expect(row.source).toBe('manual');
      expect(row.type).toBe('income');
      expect(row.label).toBe('DUITNOW TRANSFER');
    }
  });

  it('points at the exact row where the running balance stops reconciling', () => {
    const p = result('balance-break').payload;
    expect(p.rule).toBe('balance-break');
    expect(p.count).toBe(1);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].amount).toBe(5000);
    expect(p.rows[0].balanceBreak).toBe(true);
  });

  it('names the omission when the ledger carries no expense side at all', () => {
    const p = result('income-only').payload;
    expect(p.rule).toBe('no-expenses');
    expect(p.rows.every((r) => r.type === 'income')).toBe(true);
    expect(p.caption).toContain('no expense rows');
  });

  it('samples income rows first  the valuable side is what fraud targets', () => {
    // 46 hand-typed rows, only 6 of them income: the sample must still lead with the income.
    const p = result('round-number-fabrication').payload;
    expect(p.rule).toBe('hand-typed');
    expect(p.count).toBe(46);
    expect(p.rows.every((r) => r.type === 'income')).toBe(true);
  });

  it('caps the sample but reports the true count behind it', () => {
    for (const r of runGallery()) {
      expect(r.payload.rows.length).toBeLessThanOrEqual(PAYLOAD_SAMPLE_LIMIT);
      expect(r.payload.count).toBeGreaterThanOrEqual(r.payload.rows.length);
    }
  });

  it('gives every attack in the corpus something concrete to show', () => {
    for (const r of runGallery()) {
      expect(r.payload.rule).not.toBe('none');
      expect(r.payload.rows.length).toBeGreaterThan(0);
      expect(r.payload.caption).not.toHaveLength(0);
    }
  });

  it('is a pure function of the ledger', () => {
    for (const a of ATTACKS) expect(buildAttackPayload(a.build())).toEqual(buildAttackPayload(a.build()));
  });

  it('says so honestly when a ledger hides nothing structural', () => {
    const clean = buildAttackPayload([
      { amount: 1200, source: 'extracted', type: 'income', merchantRaw: 'ACME SDN BHD' },
      { amount: 40, source: 'extracted', type: 'expense', merchantRaw: 'Kedai' },
    ]);
    expect(clean.rule).toBe('none');
    expect(clean.rows).toEqual([]);
  });
});
