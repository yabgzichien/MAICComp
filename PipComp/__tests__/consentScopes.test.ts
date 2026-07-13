/**
 * TDD: Tests for src/lib/consentScopes.ts  the consent ceremony's single source
 * of truth. `buildPassportDraft` assembles the exact PassportInput (minus subject)
 * that will be signed; the tier scope rows are derived from that same draft, so
 * what the borrower reviews is what gets minted.
 * Written BEFORE implementation.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  buildConsentReceipts,
  buildPassportDraft,
  monitoringScopeRow,
  tier0ScopeRows,
  tier1ScopeRows,
  tier2ScopeRows,
  type PassportDraft,
  type PassportDraftArgs,
} from '../src/lib/consentScopes';
import type { IncomeQuality } from '../src/lib/incomeQuality';
import type { SpendingProfile } from '../src/lib/spendingProfile';
import type { ObligationSummary } from '../src/lib/obligations';
import { buildPassport, verifyPassport } from '../src/lib/passport';
import { leadingDigitHistogram } from '../src/lib/dataConfidence';
import type { DataConfidence } from '../src/lib/dataConfidence';
import type { CreditProfile, CreditScore } from '../src/lib/creditScore';
import type { Coverage } from '../src/lib/coverage';
import type { Momentum } from '../src/lib/momentum';
import { ENGINE_VERSION, MODEL_WEIGHTS_VERSION, POLICY_VERSION } from '../src/lib/versions';

// Wire sync SHA-512 so ed sync helpers work in tests.
ed.hashes.sha512 = sha512;

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

function makeTestKeypair() {
  const secretKey = ed.utils.randomSecretKey();
  const publicKeyHex = bytesToHex(ed.getPublicKey(secretKey));
  const sign = (bytes: Uint8Array): Promise<Uint8Array> => Promise.resolve(ed.sign(bytes, secretKey));
  return { publicKeyHex, sign };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const profile: CreditProfile = {
  months: 3,
  avgIncome: 3200,
  incomeMonths: 3,
  avgSurplus: 450,
  positiveMonths: 2,
  savingsRate: 0.14,
  monthlyDebtService: 120,
  adherenceWithinRatio: 1,
  netWorthSlope: 80,
  repaymentOnTime: 5,
  repaymentTotal: 6,
  confidence: 0.78,
};

const score: CreditScore = {
  score: 612,
  band: 'Good',
  confidence: 0.78,
  confidenceCapped: false,
  factors: [
    { key: 'income', label: 'Income', subScore: 80, weight: 0.3, contribution: 24, evidence: 'RM3,200/mo', explanation: '' },
    { key: 'savings', label: 'Savings', subScore: 70, weight: 0.2, contribution: 14, evidence: '14%', explanation: '' },
  ],
};

const dataConfidence: DataConfidence = {
  confidence: 0.78,
  reasons: [
    { key: 'provenance', ok: true, detail: 'extracted 70%' },
    { key: 'coverage', ok: true, detail: '41/90 days covered' },
  ],
};

const coverage: Coverage = { ratio: 41 / 90, daysCovered: 41, recencyDays: 1, windowDays: 90 };

const momentum: Momentum = {
  lookbackDays: 90,
  scoreFrom: 580,
  scoreTo: 612,
  coverageDaysFrom: 20,
  coverageDaysTo: 41,
  confidenceFrom: 0.6,
  confidenceTo: 0.78,
  direction: 'rising',
};

const amounts = [12, 23, 8.5, 145, 19, 210, 33];

const identity = { fullName: 'Aisyah binti Rahman', nricMasked: '9*****-**-**34', provider: 'MyKad eKYC (mock)' };

const incomeQuality: IncomeQuality = { variationCoefficient: 0.12, sourceCount: 2, regularityRatio: 1, seasonal: false };
const spendingProfile: SpendingProfile = { essentialsRatio: 0.62, expenseVolatility: 0.18, bufferDays: 12, savingsRate: 0.14 };
const noObligations: ObligationSummary = { obligations: [], evidencedMonthlyDebtService: 0 };
const occupation = { occupation: 'Ride-hailing driver', sector: 'Transport', employmentType: 'gig' as const, tenureMonths: 18 };

const baseArgs: PassportDraftArgs = {
  profile,
  score,
  dataConfidence,
  coverage,
  momentum,
  amounts,
  identity,
  includeIdentity: true,
  incomeQuality,
  obligations: noObligations,
  spendingProfile,
  occupation: null,
  includeSpending: false,
};

// ── buildPassportDraft ───────────────────────────────────────────────────────

describe('buildPassportDraft', () => {
  it('carries exactly the nine evidence aggregates from the profile', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.aggregates).toEqual({
      avgIncome: 3200,
      avgSurplus: 450,
      months: 3,
      incomeMonths: 3,
      savingsRate: 0.14,
      adherenceWithinRatio: 1,
      netWorthSlope: 80,
      repaymentOnTime: 5,
      repaymentTotal: 6,
    });
  });

  it('mirrors score, band, and factor sub-scores', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.score).toBe(612);
    expect(draft.band).toBe('Good');
    expect(draft.factorSummary).toEqual([
      { key: 'income', subScore: 80 },
      { key: 'savings', subScore: 70 },
    ]);
  });

  it('assessment carries confidence, coverage, income, surplus, and debt service', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.assessment).toEqual({
      confidence: 0.78,
      coverageRatio: 41 / 90,
      coverageDays: 41,
      avgIncome: 3200,
      avgMonthlySurplus: 450,
      monthlyDebtService: 120,
    });
  });

  it('joins the confidence reason details into the provenance summary', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.provenanceSummary).toBe('extracted 70%; 41/90 days covered');
  });

  it('falls back to a fixed provenance summary when there are no reasons', () => {
    const draft = buildPassportDraft({ ...baseArgs, dataConfidence: { confidence: 0.5, reasons: [] } });
    expect(draft.provenanceSummary).toBe('No provenance data available');
  });

  it('copies only the six signed momentum fields (not confidenceFrom/To)', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.momentum).toEqual({
      lookbackDays: 90,
      scoreFrom: 580,
      scoreTo: 612,
      coverageDaysFrom: 20,
      coverageDaysTo: 41,
      direction: 'rising',
    });
  });

  it('stamps the current engine/policy/model versions', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.provenanceMeta).toEqual({
      engineVersion: ENGINE_VERSION,
      policyVersion: POLICY_VERSION,
      modelWeightsVersion: MODEL_WEIGHTS_VERSION,
    });
  });

  it('computes the digit histogram from the given amounts', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.digitHistogram).toEqual(leadingDigitHistogram(amounts));
  });

  it('includes the verified holder when identity is granted', () => {
    const draft = buildPassportDraft(baseArgs);
    expect(draft.holder).toEqual({
      name: 'Aisyah binti Rahman',
      nricMasked: '9*****-**-**34',
      verified: true,
      provider: 'MyKad eKYC (mock)',
    });
  });

  it('omits the holder block when identity is toggled off', () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: false });
    expect(draft.holder).toBeUndefined();
  });

  it('omits the holder block when there is no verified identity, even if granted', () => {
    const draft = buildPassportDraft({ ...baseArgs, identity: null, includeIdentity: true });
    expect(draft.holder).toBeUndefined();
  });

  it('omits the momentum block when momentum is unavailable (below the history floor)', () => {
    const draft = buildPassportDraft({ ...baseArgs, momentum: null });
    expect(draft.momentum).toBeUndefined();
    expect(tier0ScopeRows(draft).map((r) => r.key)).not.toContain('momentum');
  });

  it('is mintable: buildPassport(draft + subject) round-trips verification', async () => {
    const { publicKeyHex, sign } = makeTestKeypair();
    const draft = buildPassportDraft(baseArgs);
    const { passport, signature } = await buildPassport({ ...draft, subject: publicKeyHex }, sign);
    const result = verifyPassport(passport, signature, publicKeyHex);
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

// ── tier0ScopeRows ───────────────────────────────────────────────────────────

describe('tier0ScopeRows', () => {
  const draft = buildPassportDraft(baseArgs);
  const rows = tier0ScopeRows(draft);
  const keys = rows.map((r) => r.key);

  it('covers every Tier 0 field carried by the draft', () => {
    expect(keys).toEqual([
      'score',
      'factors',
      'confidence',
      'coverage',
      'income',
      'surplus',
      'debtService',
      'repayment',
      'momentum',
      'digitHistogram',
      'provenance',
      'evidence',
      'versions',
      'incomeQuality',
    ]);
  });

  it('never lists identity rows in Tier 0', () => {
    expect(keys.some((k) => k.startsWith('holder'))).toBe(false);
  });

  it('shows the real values being shared', () => {
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.detail]));
    expect(byKey.score).toContain('612');
    expect(byKey.score).toContain('Good');
    expect(byKey.confidence).toContain('78%');
    expect(byKey.coverage).toContain('41');
    expect(byKey.income).toContain('RM3,200');
    expect(byKey.surplus).toContain('RM450');
    expect(byKey.debtService).toContain('RM120');
    expect(byKey.repayment).toContain('5 of 6');
    expect(byKey.momentum).toContain('rising');
    expect(byKey.momentum).toContain('612');
    expect(byKey.factors).toContain('income');
    expect(byKey.factors).toContain('80');
    expect(byKey.evidence).toContain('SHA-256');
    expect(byKey.versions).toContain(ENGINE_VERSION);
    expect(byKey.provenance).toBe('extracted 70%; 41/90 days covered');
  });

  it('omits rows for optional blocks the draft does not carry', () => {
    const thin: PassportDraft = { ...draft, momentum: undefined, digitHistogram: undefined };
    const thinKeys = tier0ScopeRows(thin).map((r) => r.key);
    expect(thinKeys).not.toContain('momentum');
    expect(thinKeys).not.toContain('digitHistogram');
    expect(thinKeys).toContain('score');
  });
});

// ── tier1ScopeRows ───────────────────────────────────────────────────────────

describe('tier1ScopeRows', () => {
  it('lists the verified name and masked IC when identity is carried', () => {
    const draft = buildPassportDraft(baseArgs);
    const rows = tier1ScopeRows(draft);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const details = rows.map((r) => r.detail).join(' | ');
    expect(details).toContain('Aisyah binti Rahman');
    expect(details).toContain('9*****-**-**34');
    expect(details).toContain('MyKad eKYC (mock)');
  });

  it('is empty when the draft carries no identity', () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: false });
    expect(tier1ScopeRows(draft)).toEqual([]);
  });
});

// ── buildConsentReceipts (Brief I stretch) ────────────────────────────────────

describe('buildConsentReceipts', () => {
  it('always grants Tier 0 whose scope matches the disclosed Tier 0 rows', () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: false });
    const receipts = buildConsentReceipts(draft, new Date('2026-07-01T00:00:00.000Z'));
    const t0 = receipts.find((r) => r.tier === 0)!;
    expect(t0).toBeDefined();
    expect(t0.scope).toEqual(tier0ScopeRows(draft).map((r) => r.key));
    expect(receipts.some((r) => r.tier === 1)).toBe(false);
  });

  it('adds a Tier 1 grant exactly when identity is carried, longer-lived than Tier 0', () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: true });
    const now = new Date('2026-07-01T00:00:00.000Z');
    const receipts = buildConsentReceipts(draft, now);
    const t1 = receipts.find((r) => r.tier === 1)!;
    expect(t1).toBeDefined();
    expect(t1.scope).toEqual(tier1ScopeRows(draft).map((r) => r.key));
    // Identity grant outlives the aggregate grant.
    const t0 = receipts.find((r) => r.tier === 0)!;
    expect(Date.parse(t1.expiresAt)).toBeGreaterThan(Date.parse(t0.expiresAt));
  });

  it('the receipts it produces satisfy buildPassport and verify end-to-end', async () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: true });
    const consent = buildConsentReceipts(draft);
    const kp = makeTestKeypair();
    const { passport, signature } = await buildPassport({ ...draft, subject: kp.publicKeyHex, consent }, kp.sign);
    const res = verifyPassport(passport, signature, kp.publicKeyHex);
    expect(res.valid).toBe(true);
    expect(passport.consent!.map((c) => c.tier)).toEqual([0, 1]);
  });
});

// ── Richer passport blocks (Brief P) ──────────────────────────────────────────

describe('income-quality block (Tier 0)', () => {
  it('is always carried and disclosed as a Tier 0 row', () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: false });
    expect(draft.incomeQuality).toEqual(incomeQuality);
    expect(tier0ScopeRows(draft).map((r) => r.key)).toContain('incomeQuality');
  });
});

describe('evidenced monthly debt service (Brief P)', () => {
  it('replaces the loans-only figure with the detected obligations sum when any are detected', () => {
    const obligations: ObligationSummary = {
      obligations: [{ label: 'Landlord Rent', kind: 'rent', monthlyAmount: 900, monthsObserved: 4 }],
      evidencedMonthlyDebtService: 900,
    };
    const draft = buildPassportDraft({ ...baseArgs, obligations });
    expect(draft.assessment!.monthlyDebtService).toBe(900);
  });

  it('falls back to the in-app loans figure when no obligations are detected', () => {
    const draft = buildPassportDraft(baseArgs); // noObligations
    expect(draft.assessment!.monthlyDebtService).toBe(120);
  });
});

describe('occupation block (Tier 1)', () => {
  it('attaches the self-declared occupation and lists its rows under Tier 1 when identity is granted', () => {
    const draft = buildPassportDraft({ ...baseArgs, occupation, includeIdentity: true });
    expect(draft.occupation).toEqual({ ...occupation, selfDeclared: true });
    const details = tier1ScopeRows(draft).map((r) => r.detail).join(' | ');
    expect(details).toContain('Ride-hailing driver');
    expect(details).toContain('Gig');
  });

  it('omits occupation when identity is toggled off', () => {
    const draft = buildPassportDraft({ ...baseArgs, occupation, includeIdentity: false });
    expect(draft.occupation).toBeUndefined();
  });

  it('grants Tier 1 for occupation even when the holder is excluded and verifies end-to-end', async () => {
    // identity excluded but occupation carried → Tier 1 still required and granted.
    const draft = buildPassportDraft({ ...baseArgs, identity: null, occupation, includeIdentity: true });
    expect(draft.holder).toBeUndefined();
    expect(draft.occupation).toBeDefined();
    const consent = buildConsentReceipts(draft);
    expect(consent.some((c) => c.tier === 1)).toBe(true);
    const kp = makeTestKeypair();
    const { passport, signature } = await buildPassport({ ...draft, subject: kp.publicKeyHex, consent }, kp.sign);
    expect(verifyPassport(passport, signature, kp.publicKeyHex).valid).toBe(true);
  });
});

describe('spending-profile block (Tier 2)', () => {
  it('attaches the spending profile with itemised obligations when the Tier 2 grant is on', () => {
    const obligations: ObligationSummary = {
      obligations: [{ label: 'TNB Electric', kind: 'utilities', monthlyAmount: 120, monthsObserved: 4 }],
      evidencedMonthlyDebtService: 120,
    };
    const draft = buildPassportDraft({ ...baseArgs, obligations, includeSpending: true });
    expect(draft.spendingProfile).toBeDefined();
    expect(draft.spendingProfile!.obligations).toHaveLength(1);
    expect(tier2ScopeRows(draft).map((r) => r.key)).toContain('obligations');
  });

  it('omits the spending block and its rows when the Tier 2 grant is off', () => {
    const draft = buildPassportDraft({ ...baseArgs, includeSpending: false });
    expect(draft.spendingProfile).toBeUndefined();
    expect(tier2ScopeRows(draft)).toEqual([]);
  });

  it('grants Tier 2 and verifies end-to-end when the spending block is carried', async () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: true, includeSpending: true });
    const consent = buildConsentReceipts(draft);
    expect(consent.map((c) => c.tier)).toEqual([0, 1, 2]);
    const kp = makeTestKeypair();
    const { passport, signature } = await buildPassport({ ...draft, subject: kp.publicKeyHex, consent }, kp.sign);
    expect(verifyPassport(passport, signature, kp.publicKeyHex).valid).toBe(true);
  });
});

// ── Post-disbursement monitoring grant (Brief S) ──────────────────────────────

describe('monitoringScopeRow', () => {
  it('describes the grant and cites the loan tenor', () => {
    const row = monitoringScopeRow(12);
    expect(row.key).toBe('monitoring');
    expect(row.detail).toContain('12 months');
  });
});

describe('buildConsentReceipts  Tier 3 monitoring', () => {
  it('is absent when no monitoring arg is passed (no active loan)', () => {
    const draft = buildPassportDraft(baseArgs);
    const receipts = buildConsentReceipts(draft);
    expect(receipts.some((r) => r.tier === 3)).toBe(false);
  });

  it('adds a Tier 3 grant with an expiry derived from the loan tenor, shorter than Tier 1', () => {
    const draft = buildPassportDraft({ ...baseArgs, includeIdentity: true });
    const now = new Date('2026-07-01T00:00:00.000Z');
    const receipts = buildConsentReceipts(draft, now, { tenorMonths: 6 });
    const t3 = receipts.find((r) => r.tier === 3)!;
    expect(t3).toBeDefined();
    expect(t3.scope).toEqual(['monitoring']);
    expect(t3.grantedAt).toBe(now.toISOString());
    // ~6 months out, well short of the Tier 1 (1-year) identity grant.
    const t1 = receipts.find((r) => r.tier === 1)!;
    expect(Date.parse(t3.expiresAt)).toBeGreaterThan(now.getTime());
    expect(Date.parse(t3.expiresAt)).toBeLessThan(Date.parse(t1.expiresAt));
  });

  it('the monitoring receipt satisfies buildPassport and verifies end-to-end', async () => {
    const draft = buildPassportDraft(baseArgs);
    const consent = buildConsentReceipts(draft, new Date(), { tenorMonths: 18 });
    const kp = makeTestKeypair();
    const { passport, signature } = await buildPassport({ ...draft, subject: kp.publicKeyHex, consent }, kp.sign);
    const res = verifyPassport(passport, signature, kp.publicKeyHex);
    expect(res.valid).toBe(true);
    expect(passport.consent!.some((c) => c.tier === 3)).toBe(true);
  });
});
