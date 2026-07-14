// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Post-disbursement early warning (Brief S) — pure diff between a loan's baseline
// passport and a fresh check-in. No crypto/UI involved; plain CreditPassport fixtures.
import { describe, expect, it } from 'vitest';
import { diffCheckIn, monitoringStatus } from './earlyWarning';
import type { CreditPassport } from './passport';

function passport(over: Partial<CreditPassport> = {}): CreditPassport {
  return {
    subject: 'a'.repeat(64),
    score: 672,
    band: 'Good',
    factorSummary: [],
    provenanceSummary: '',
    evidenceHash: 'e'.repeat(64),
    repaymentRecord: { onTime: 0, total: 0 },
    issuedAt: '2026-06-01T00:00:00.000Z',
    validUntil: '2027-06-01T00:00:00.000Z',
    ...over,
  };
}

const assessment = (over: Partial<CreditPassport['assessment']> = {}) => ({
  confidence: 0.8,
  coverageRatio: 0.8,
  coverageDays: 90,
  avgIncome: 3000,
  avgMonthlySurplus: 900,
  monthlyDebtService: 150,
  ...over,
});

describe('diffCheckIn — no signal', () => {
  it('produces no flags when nothing has moved', () => {
    const a = passport({ assessment: assessment() });
    const b = passport({ assessment: assessment() });
    expect(diffCheckIn(a, b).flags).toEqual([]);
  });

  it('does not throw and produces no assessment-based flags when either side lacks an assessment block', () => {
    const a = passport();
    const b = passport({ assessment: assessment({ avgIncome: 100 }) });
    expect(() => diffCheckIn(a, b)).not.toThrow();
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'income-drop')).toBe(false);
  });
});

describe('diffCheckIn — income-drop', () => {
  it('no flag below the 15% watch threshold', () => {
    const a = passport({ assessment: assessment({ avgIncome: 3000 }) });
    const b = passport({ assessment: assessment({ avgIncome: 2700 }) }); // 10% drop
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'income-drop')).toBe(false);
  });

  it('watch at >=15% and <30% drop', () => {
    const a = passport({ assessment: assessment({ avgIncome: 3000 }) });
    const b = passport({ assessment: assessment({ avgIncome: 2400 }) }); // 20% drop
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'income-drop');
    expect(f?.severity).toBe('watch');
    expect(f?.evidence).toContain('20%');
  });

  it('critical at >=30% drop', () => {
    const a = passport({ assessment: assessment({ avgIncome: 3000 }) });
    const b = passport({ assessment: assessment({ avgIncome: 1500 }) }); // 50% drop
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'income-drop');
    expect(f?.severity).toBe('critical');
  });

  it('a rise in income is never flagged as a drop', () => {
    const a = passport({ assessment: assessment({ avgIncome: 3000 }) });
    const b = passport({ assessment: assessment({ avgIncome: 4000 }) });
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'income-drop')).toBe(false);
  });

  it('a non-positive baseline income never produces a flag (undefined percentage)', () => {
    const a = passport({ assessment: assessment({ avgIncome: 0 }) });
    const b = passport({ assessment: assessment({ avgIncome: 0 }) });
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'income-drop')).toBe(false);
  });
});

describe('diffCheckIn — surplus-erosion', () => {
  it('no flag below the 25% watch threshold', () => {
    const a = passport({ assessment: assessment({ avgMonthlySurplus: 900 }) });
    const b = passport({ assessment: assessment({ avgMonthlySurplus: 800 }) }); // ~11%
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'surplus-erosion')).toBe(false);
  });

  it('watch at >=25% and <50% erosion', () => {
    const a = passport({ assessment: assessment({ avgMonthlySurplus: 900 }) });
    const b = passport({ assessment: assessment({ avgMonthlySurplus: 600 }) }); // ~33%
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'surplus-erosion');
    expect(f?.severity).toBe('watch');
  });

  it('critical at >=50% erosion', () => {
    const a = passport({ assessment: assessment({ avgMonthlySurplus: 900 }) });
    const b = passport({ assessment: assessment({ avgMonthlySurplus: 400 }) }); // ~56%
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'surplus-erosion');
    expect(f?.severity).toBe('critical');
  });

  it('turning non-positive is ALWAYS critical, even if the percentage drop alone would only be a watch', () => {
    const a = passport({ assessment: assessment({ avgMonthlySurplus: 100 }) });
    const b = passport({ assessment: assessment({ avgMonthlySurplus: 0 }) }); // 100% drop, but small absolute move
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'surplus-erosion');
    expect(f?.severity).toBe('critical');
    expect(f?.evidence).toMatch(/non-positive/);
  });

  it('an already-non-positive baseline surplus produces no further erosion flag (pctDrop needs a positive baseline)', () => {
    const a = passport({ assessment: assessment({ avgMonthlySurplus: -100 }) });
    const b = passport({ assessment: assessment({ avgMonthlySurplus: -500 }) });
    expect(diffCheckIn(a, b).flags.some((x) => x.key === 'surplus-erosion')).toBe(false);
  });
});

describe('diffCheckIn — coverage-stagnation', () => {
  it('no flag below a 10-day drop', () => {
    const a = passport({ assessment: assessment({ coverageDays: 90 }) });
    const b = passport({ assessment: assessment({ coverageDays: 85 }) });
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'coverage-stagnation')).toBe(false);
  });

  it('watch at a 10-24 day drop', () => {
    const a = passport({ assessment: assessment({ coverageDays: 90 }) });
    const b = passport({ assessment: assessment({ coverageDays: 75 }) });
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'coverage-stagnation');
    expect(f?.severity).toBe('watch');
  });

  it('critical at a 25+ day drop', () => {
    const a = passport({ assessment: assessment({ coverageDays: 90 }) });
    const b = passport({ assessment: assessment({ coverageDays: 60 }) });
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'coverage-stagnation');
    expect(f?.severity).toBe('critical');
    expect(f?.evidence).toMatch(/tracking may have stopped/i);
  });

  it('coverage improving is never flagged', () => {
    const a = passport({ assessment: assessment({ coverageDays: 60 }) });
    const b = passport({ assessment: assessment({ coverageDays: 90 }) });
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'coverage-stagnation')).toBe(false);
  });
});

describe('diffCheckIn — momentum-reversal (transition only, not a level)', () => {
  const momentum = (direction: 'rising' | 'flat' | 'falling') => ({ lookbackDays: 90, scoreFrom: 650, scoreTo: 620, coverageDaysFrom: 80, coverageDaysTo: 90, direction });

  it('flags a transition from rising/flat into falling', () => {
    const a = passport({ momentum: momentum('rising') });
    const b = passport({ momentum: momentum('falling') });
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'momentum-reversal');
    expect(f?.severity).toBe('watch');
  });

  it('does NOT flag a persistently-falling trend (baseline was already falling)', () => {
    const a = passport({ momentum: momentum('falling') });
    const b = passport({ momentum: momentum('falling') });
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'momentum-reversal')).toBe(false);
  });

  it('no flag when the check-in has no momentum block at all', () => {
    const a = passport({ momentum: momentum('rising') });
    const b = passport();
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'momentum-reversal')).toBe(false);
  });

  it('no flag when the check-in is rising or flat', () => {
    const a = passport({ momentum: momentum('rising') });
    const b = passport({ momentum: momentum('flat') });
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'momentum-reversal')).toBe(false);
  });
});

describe('diffCheckIn — repayment-decline (only on genuinely NEW repayments)', () => {
  it('no flag when no new repayments have been recorded since the baseline', () => {
    const a = passport({ repaymentRecord: { onTime: 4, total: 5 } });
    const b = passport({ repaymentRecord: { onTime: 4, total: 5 } }); // total unchanged
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'repayment-decline')).toBe(false);
  });

  it('no flag below a 15-point ratio drop', () => {
    const a = passport({ repaymentRecord: { onTime: 5, total: 5 } }); // 100%
    const b = passport({ repaymentRecord: { onTime: 6, total: 7 } }); // ~86%, 14pt drop
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'repayment-decline')).toBe(false);
  });

  it('watch at a 15-29 point ratio drop', () => {
    const a = passport({ repaymentRecord: { onTime: 5, total: 5 } }); // 100%
    const b = passport({ repaymentRecord: { onTime: 6, total: 8 } }); // 75%, 25pt drop
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'repayment-decline');
    expect(f?.severity).toBe('watch');
  });

  it('critical at a 30+ point ratio drop', () => {
    const a = passport({ repaymentRecord: { onTime: 5, total: 5 } }); // 100%
    const b = passport({ repaymentRecord: { onTime: 5, total: 10 } }); // 50%, 50pt drop
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'repayment-decline');
    expect(f?.severity).toBe('critical');
  });

  it('a baseline with no repayment history yet (total 0) is treated as a clean 100% starting ratio', () => {
    const a = passport({ repaymentRecord: { onTime: 0, total: 0 } });
    const b = passport({ repaymentRecord: { onTime: 3, total: 10 } }); // 30%, 70pt drop from the implicit 100%
    const f = diffCheckIn(a, b).flags.find((x) => x.key === 'repayment-decline');
    expect(f?.severity).toBe('critical');
  });

  it('no flag when the check-in also has zero total (nothing to compare)', () => {
    const a = passport({ repaymentRecord: { onTime: 0, total: 0 } });
    const b = passport({ repaymentRecord: { onTime: 0, total: 0 } });
    expect(diffCheckIn(a, b).flags.some((f) => f.key === 'repayment-decline')).toBe(false);
  });
});

describe('diffCheckIn — independence and combination', () => {
  it('carries multiple independent flags at once when several signals cross', () => {
    const a = passport({ assessment: assessment({ avgIncome: 3000, avgMonthlySurplus: 900, coverageDays: 90 }), momentum: { lookbackDays: 90, scoreFrom: 650, scoreTo: 660, coverageDaysFrom: 80, coverageDaysTo: 90, direction: 'rising' }, repaymentRecord: { onTime: 5, total: 5 } });
    const b = passport({ assessment: assessment({ avgIncome: 1000, avgMonthlySurplus: 100, coverageDays: 50 }), momentum: { lookbackDays: 90, scoreFrom: 660, scoreTo: 600, coverageDaysFrom: 90, coverageDaysTo: 90, direction: 'falling' }, repaymentRecord: { onTime: 4, total: 8 } });
    const keys = diffCheckIn(a, b).flags.map((f) => f.key).sort();
    expect(keys).toEqual(['coverage-stagnation', 'income-drop', 'momentum-reversal', 'repayment-decline', 'surplus-erosion'].sort());
  });
});

// ── monitoringStatus ───────────────────────────────────────────────────────────

describe('monitoringStatus', () => {
  const NOW = new Date('2026-07-11T12:00:00.000Z');

  it('is not-granted when the passport carries no Tier 3 consent receipt', () => {
    const p = passport({ consent: [{ tier: 0, scope: ['score'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2027-06-01T00:00:00.000Z' }] });
    expect(monitoringStatus(p, NOW)).toBe('not-granted');
  });

  it('is not-granted when there is no consent block at all', () => {
    expect(monitoringStatus(passport(), NOW)).toBe('not-granted');
  });

  it('is active while the Tier 3 grant has not yet expired', () => {
    const p = passport({ consent: [{ tier: 3, scope: ['monitoring'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2026-08-01T00:00:00.000Z' }] });
    expect(monitoringStatus(p, NOW)).toBe('active');
  });

  it('is expired once past the Tier 3 grant\'s expiresAt', () => {
    const p = passport({ consent: [{ tier: 3, scope: ['monitoring'], grantedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-06-01T00:00:00.000Z' }] });
    expect(monitoringStatus(p, NOW)).toBe('expired');
  });

  it('at the exact expiry instant is still active (strict less-than, not less-or-equal)', () => {
    const p = passport({ consent: [{ tier: 3, scope: ['monitoring'], grantedAt: '2026-06-01T00:00:00.000Z', expiresAt: NOW.toISOString() }] });
    expect(monitoringStatus(p, NOW)).toBe('active');
  });
});
