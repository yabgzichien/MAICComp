// Restored 2026-07-12 (CEO action plan P0.2) after a test-suite gutting incident.
// Maps the approved-applications store into the securitization pool shape, plus the
// Portfolio dashboard aggregates. No new risk math — PD/expected-loss/tranching all
// reuse securitization.ts; this module only maps and aggregates.
import { describe, expect, it } from 'vitest';
import { buildPortfolio, bookToPool, CONCENTRATION_THRESHOLD } from './portfolio';
import type { ApplicationRecord, DeclaredPurpose } from './applications';
import { summarizePool } from './securitization';

/** Minimal signed-shape passport code — parsePassportCode only JSON-parses + checks
 *  for {passport, signature}; no real crypto verification happens in portfolio.ts. */
function code(subject: string, score: number, band: string, confidence = 0.8): string {
  return JSON.stringify({
    passport: {
      subject,
      score,
      band,
      factorSummary: [],
      provenanceSummary: '',
      evidenceHash: 'e'.repeat(64),
      repaymentRecord: { onTime: 0, total: 0 },
      issuedAt: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      assessment: { confidence, coverageRatio: 0.9, coverageDays: 90, avgIncome: 3000, avgMonthlySurplus: 900, monthlyDebtService: 100 },
    },
    signature: 'a'.repeat(128),
  });
}

let seq = 0;
function approved(over: Partial<ApplicationRecord> & { score?: number; band?: string; confidence?: number; purpose?: DeclaredPurpose } = {}): ApplicationRecord {
  const subject = over.subject ?? `subject-${seq++}`;
  const { score = 700, band = 'Good', confidence = 0.8, ...rest } = over;
  return {
    id: `id-${subject}`,
    passportCode: code(subject, score, band, confidence),
    subject,
    applicantLabel: 'Applicant',
    requestedAmount: 5000,
    engineDecision: 'approve',
    offeredAmount: 5000,
    installment: 300,
    tierLabel: 'Growth Capital',
    status: 'approved',
    filedAt: '2026-07-01T00:00:00.000Z',
    notes: [],
    audit: [],
    ...rest,
  };
}

// ── bookToPool ─────────────────────────────────────────────────────────────────

describe('bookToPool', () => {
  it('keeps only approved rows with a positive offer', () => {
    const apps = [
      approved({ subject: 'a' }),
      approved({ subject: 'b', status: 'referred' }),
      approved({ subject: 'c', status: 'declined', offeredAmount: 0 }),
      approved({ subject: 'd', offeredAmount: 0 }), // approved but somehow zero offer
    ];
    const pool = bookToPool(apps);
    expect(pool.map((l) => l.id)).toEqual(['a']);
  });

  it('skips an approved row whose passport code fails to parse, rather than throwing', () => {
    const bad = approved({ subject: 'bad' });
    bad.passportCode = 'not json';
    expect(() => bookToPool([bad])).not.toThrow();
    expect(bookToPool([bad])).toEqual([]);
  });

  it('maps principal from the offered amount and score/band from the passport', () => {
    const pool = bookToPool([approved({ subject: 'x', offeredAmount: 4000, score: 672, band: 'Good' })]);
    expect(pool[0]).toMatchObject({ id: 'x', principal: 4000, score: 672, band: 'Good' });
  });

  it('falls back to "Building" band for an unrecognised band string', () => {
    const pool = bookToPool([approved({ subject: 'x', band: 'Mythical' })]);
    expect(pool[0].band).toBe('Building');
  });

  it('always reports fraudProb 0 — approved loans already cleared the fraud gate at underwriting', () => {
    const pool = bookToPool([approved({ subject: 'x' })]);
    expect(pool[0].fraudProb).toBe(0);
  });

  it('assigns apr/tenor by band from the display term table', () => {
    const pool = bookToPool([approved({ subject: 'x', band: 'Excellent' })]);
    expect(pool[0].apr).toBe(0.16);
    expect(pool[0].tenorMonths).toBe(24);
  });
});

// ── buildPortfolio ─────────────────────────────────────────────────────────────

describe('buildPortfolio', () => {
  it('an empty book produces a zeroed portfolio with no breakdowns or concentrations', () => {
    const p = buildPortfolio([]);
    expect(p.totalExposure).toBe(0);
    expect(p.loanCount).toBe(0);
    expect(p.bandBreakdown).toEqual([]);
    expect(p.purposeBreakdown).toEqual([]);
    expect(p.concentrations).toEqual([]);
  });

  it('totalExposure/loanCount/weightedAvgScore/PD/expectedLoss reuse summarizePool exactly', () => {
    const apps = [approved({ subject: 'a', offeredAmount: 5000, band: 'Good' }), approved({ subject: 'b', offeredAmount: 3000, band: 'Excellent' })];
    const p = buildPortfolio(apps);
    const expectedSummary = summarizePool(bookToPool(apps));
    expect(p.totalExposure).toBe(expectedSummary.totalPrincipal);
    expect(p.loanCount).toBe(expectedSummary.loanCount);
    expect(p.weightedAvgScore).toBeCloseTo(expectedSummary.weightedAvgScore, 9);
    expect(p.weightedAvgPD).toBeCloseTo(expectedSummary.weightedAvgPD, 9);
    expect(p.expectedLossRate).toBeCloseTo(expectedSummary.expectedLossRate, 9);
  });

  it('weightedAvgConfidence is principal-weighted across the book', () => {
    const apps = [
      approved({ subject: 'a', offeredAmount: 8000, confidence: 0.9 }),
      approved({ subject: 'b', offeredAmount: 2000, confidence: 0.5 }),
    ];
    const p = buildPortfolio(apps);
    expect(p.weightedAvgConfidence).toBeCloseTo((0.9 * 8000 + 0.5 * 2000) / 10000, 9);
  });

  it('defaults confidence to 0 when the passport carries no assessment block', () => {
    const noAssessment = approved({ subject: 'x' });
    const parsed = JSON.parse(noAssessment.passportCode);
    delete parsed.passport.assessment;
    noAssessment.passportCode = JSON.stringify(parsed);
    const p = buildPortfolio([noAssessment]);
    expect(p.weightedAvgConfidence).toBe(0);
  });

  it('bandBreakdown is ordered Building→Fair→Good→Strong→Excellent, not by exposure size', () => {
    const apps = [
      approved({ subject: 'a', band: 'Excellent', offeredAmount: 9000 }),
      approved({ subject: 'b', band: 'Building', offeredAmount: 1000 }),
    ];
    const p = buildPortfolio(apps);
    expect(p.bandBreakdown.map((r) => r.label)).toEqual(['Building', 'Excellent']);
  });

  it('bandBreakdown percentages sum to 1 across the book', () => {
    const apps = [approved({ subject: 'a', band: 'Good', offeredAmount: 6000 }), approved({ subject: 'b', band: 'Fair', offeredAmount: 4000 })];
    const p = buildPortfolio(apps);
    expect(p.bandBreakdown.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(1, 9);
  });

  it('purposeBreakdown maps declared categories to display labels, defaulting to "Undeclared"', () => {
    const apps = [
      approved({ subject: 'a', purpose: { category: 'stock' } }),
      approved({ subject: 'b' }), // no purpose declared
    ];
    const p = buildPortfolio(apps);
    expect(p.purposeBreakdown.map((r) => r.label).sort()).toEqual(['Stock / inventory', 'Undeclared'].sort());
  });

  it('purposeBreakdown is sorted by exposure (largest first) — unlike the fixed band order', () => {
    const apps = [
      approved({ subject: 'a', purpose: { category: 'stock' }, offeredAmount: 2000 }),
      approved({ subject: 'b', purpose: { category: 'equipment' }, offeredAmount: 8000 }),
    ];
    const p = buildPortfolio(apps);
    expect(p.purposeBreakdown[0].label).toBe('Equipment');
  });

  it('flags a band concentration above the 40% default threshold', () => {
    const apps = [
      approved({ subject: 'a', band: 'Good', offeredAmount: 9000 }),
      approved({ subject: 'b', band: 'Fair', offeredAmount: 1000 }),
    ];
    const p = buildPortfolio(apps);
    expect(p.concentrations.some((c) => c.kind === 'band' && c.label === 'Good')).toBe(true);
    expect(p.concentrations.some((c) => c.label === 'Fair')).toBe(false);
  });

  it('flags a purpose concentration above the threshold, independent of band', () => {
    const apps = [
      approved({ subject: 'a', purpose: { category: 'stock' }, offeredAmount: 7000, band: 'Good' }),
      approved({ subject: 'b', purpose: { category: 'equipment' }, offeredAmount: 3000, band: 'Fair' }),
    ];
    const p = buildPortfolio(apps);
    expect(p.concentrations.some((c) => c.kind === 'purpose' && c.label === 'Stock / inventory')).toBe(true);
  });

  it('a custom concentration threshold is honoured', () => {
    const apps = [approved({ subject: 'a', band: 'Good', offeredAmount: 6000 }), approved({ subject: 'b', band: 'Fair', offeredAmount: 4000 })];
    const loose = buildPortfolio(apps, { concentrationThreshold: 0.7 });
    const strict = buildPortfolio(apps, { concentrationThreshold: 0.3 });
    expect(loose.concentrations.some((c) => c.label === 'Good')).toBe(false);
    expect(strict.concentrations.some((c) => c.label === 'Good')).toBe(true);
    expect(strict.concentrations.some((c) => c.label === 'Fair')).toBe(true);
  });

  it('the exported CONCENTRATION_THRESHOLD constant is the actual default used', () => {
    expect(CONCENTRATION_THRESHOLD).toBe(0.4);
  });
});
