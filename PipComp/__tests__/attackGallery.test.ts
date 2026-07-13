import { ATTACKS, runAttack, runGallery } from '../src/lib/attackGallery';

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
    expect(r.firedSignals.length).toBeGreaterThan(0);
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
    expect(r.firedSignals.length).toBeGreaterThan(0);
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
