/**
 * tools/demoPassport/generateApplicants.js
 * One-time offline script  generates the pre-signed demo APPLICANT passports the
 * console's queue-seed action files (Brief O), and writes them to
 * LenderConsole/app/demoApplicants.ts.
 *
 * Why these exist: the queues spec assumed the existing sample/suspect codes could
 * seed a varied pipeline, but the sample passport can only ever DECLINE under the
 * default ladder and the suspect code fails verification by design. A working
 * demo pipeline needs an approvable file and referable files, so each profile
 * below is engineered against the real decideLoan policy.
 *
 * 13-persona mix (Demo Data plan Task 5, spec §C): 6 approvals across Fair/Good/
 * Strong (§C says "5-6"; 6 lands cleanly with Farid's existing Fair case), 2
 * engine-refers (one coverage-gated, one confidence-gated), 1 counter-offer
 * (positive offer below request), 2 declines (one affordability, one the
 * applicant's score sits below every tier), 1 watchlist pair (an approved
 * passport + a later check-in for the SAME subject showing income/surplus
 * deterioration  Brief S), and 1 stacking case (an existing passport's code
 * listed a second time so the seeder can present it twice within 24h).
 *
 * Honest scope note on the "hard-adverse" decline the spec names: `decideLoan`'s
 * `adverseRecord: 'hard'` path exists (see PipComp/src/lib/loans.ts /
 * LenderConsole/lib/loans.ts) but is never carried on the SIGNED passport
 * adverse-record data isn't cross-institution shared in this build (no CTOS/
 * registry integration), so a pasted passport alone can never trigger it. The
 * second decline here instead uses the "score below every tier's minimum"
 * policy path  a distinct grouped-reason category (`policy`, not
 * `affordability`), same spirit (deeply ineligible, not a borderline case).
 *
 * Run: node tools/demoPassport/generateApplicants.js
 * (Re-run after rotating the issuer key via tools/issuerKey/generate.js.)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const ed = require('@noble/ed25519');
const { sha512 } = require(path.join(__dirname, '../../node_modules/@noble/hashes/sha2.js'));
ed.hashes.sha512 = sha512;

// ── Issuer secret + version stamps (same sources as generate.js) ───────────────
const issuerKeyTs = fs.readFileSync(path.join(__dirname, '../../src/data/issuerKey.ts'), 'utf8');
const secretMatch = issuerKeyTs.match(/ISSUER_SECRET_KEY\s*=\s*'([0-9a-f]+)'/);
if (!secretMatch) {
  console.error('Could not read ISSUER_SECRET_KEY  run tools/issuerKey/generate.js first.');
  process.exit(1);
}
const issuerSecret = Buffer.from(secretMatch[1], 'hex');

const versionsTs = fs.readFileSync(path.join(__dirname, '../../src/lib/versions.ts'), 'utf8');
function readVersion(name) {
  const m = versionsTs.match(new RegExp(name + "\\s*=\\s*'([^']+)'"));
  if (!m) {
    console.error(`Could not read ${name} from src/lib/versions.ts.`);
    process.exit(1);
  }
  return m[1];
}
const provenanceMeta = {
  engineVersion: readVersion('ENGINE_VERSION'),
  policyVersion: readVersion('POLICY_VERSION'),
  modelWeightsVersion: readVersion('MODEL_WEIGHTS_VERSION'),
};

// Long demo validity, same convention as the sample passport.
const issuedAt = '2026-06-01T08:00:00.000Z';
const validUntil = '2027-06-01T08:00:00.000Z';
// The watchlist check-in happens after the base loan  a later issuance date, still valid.
const checkinIssuedAt = '2026-06-20T08:00:00.000Z';

function benfordPctOf(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    deviation += Math.abs(counts[d - 1] / total - Math.log10(1 + 1 / d));
  }
  return Math.round(Math.max(0, Math.min(1, 1 - deviation / 1.7)) * 100);
}

// ── The 13-applicant mix ────────────────────────────────────────────────────────
// `role` and `expectedVerdict`/`expectedCounterOffer` are test/seeder metadata, not
// part of the signed passport. `subjectGroup` ties the watchlist check-in to its
// base passport (same keypair  the same borrower, later in time); `duplicateOf`
// makes an entry a literal re-listing of an earlier one's signed code (stacking).

const PROFILES = [
  {
    label: 'Farid bin Osman',
    requestedAmount: 4000,
    role: 'approve',
    expectedVerdict: 'approve',
    subjectGroup: 'farid',
    passport: {
      score: 580,
      band: 'Fair',
      factorSummary: [
        { key: 'cashflow', subScore: 66 },
        { key: 'income', subScore: 61 },
        { key: 'savings', subScore: 58 },
        { key: 'debt', subScore: 82 },
        { key: 'discipline', subScore: 55 },
        { key: 'networth', subScore: 40 },
        { key: 'track_record', subScore: 35 },
      ],
      digitHistogram: [58, 33, 24, 18, 15, 13, 11, 10, 9],
      assessment: { confidence: 0.78, coverageRatio: 0.75, coverageDays: 90, avgIncome: 3200, avgMonthlySurplus: 950, monthlyDebtService: 150 },
      holder: { name: 'Farid bin Osman', nricMasked: '••••••-••-2317', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 548, scoreTo: 580, coverageDaysFrom: 62, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 4, total: 4 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 74,
      incomeQuality: { variationCoefficient: 0.08, sourceCount: 1, regularityRatio: 1, seasonal: false },
      occupation: { occupation: 'Factory technician', sector: 'Manufacturing', employmentType: 'salaried', tenureMonths: 28, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.6, expenseVolatility: 0.12, bufferDays: 14, savingsRate: 0.3,
        obligations: [{ label: 'Motorbike Hire-Purchase', kind: 'installment', monthlyAmount: 150, monthsObserved: 4 }],
      },
    },
  },
  {
    label: 'Mei Ling Tan',
    requestedAmount: 8000,
    role: 'refer-confidence',
    expectedVerdict: 'refer',
    subjectGroup: 'meiling',
    passport: {
      score: 660,
      band: 'Good',
      factorSummary: [
        { key: 'cashflow', subScore: 78 },
        { key: 'income', subScore: 72 },
        { key: 'savings', subScore: 70 },
        { key: 'debt', subScore: 85 },
        { key: 'discipline', subScore: 64 },
        { key: 'networth', subScore: 55 },
        { key: 'track_record', subScore: 42 },
      ],
      digitHistogram: [49, 30, 22, 17, 14, 12, 11, 9, 8],
      assessment: { confidence: 0.44, coverageRatio: 0.8, coverageDays: 90, avgIncome: 4200, avgMonthlySurplus: 1400, monthlyDebtService: 200 },
      holder: { name: 'Mei Ling Tan', nricMasked: '••••••-••-8842', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 641, scoreTo: 660, coverageDaysFrom: 55, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 2, total: 3 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 52,
      incomeQuality: { variationCoefficient: 0.35, sourceCount: 3, regularityRatio: 0.83, seasonal: true },
      occupation: { occupation: 'Freelance designer', sector: 'Creative', employmentType: 'self-employed', tenureMonths: 15, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.5, expenseVolatility: 0.28, bufferDays: 20, savingsRate: 0.33,
        obligations: [
          { label: 'Phone Installment', kind: 'installment', monthlyAmount: 120, monthsObserved: 5 },
          { label: 'TIME Internet', kind: 'utilities', monthlyAmount: 80, monthsObserved: 5 },
        ],
      },
    },
  },
  {
    label: 'Kavitha a/p Suresh',
    requestedAmount: 500,
    role: 'refer-coverage',
    expectedVerdict: 'refer',
    subjectGroup: 'kavitha',
    passport: {
      score: 700,
      band: 'Good',
      factorSummary: [
        { key: 'cashflow', subScore: 88 },
        { key: 'income', subScore: 80 },
        { key: 'savings', subScore: 76 },
        { key: 'debt', subScore: 92 },
        { key: 'discipline', subScore: 74 },
        { key: 'networth', subScore: 48 },
        { key: 'track_record', subScore: 50 },
      ],
      digitHistogram: [16, 9, 7, 5, 4, 4, 3, 3, 2],
      assessment: { confidence: 0.7, coverageRatio: 0.28, coverageDays: 25, avgIncome: 2800, avgMonthlySurplus: 700, monthlyDebtService: 100 },
      holder: { name: 'Kavitha a/p Suresh', nricMasked: '••••••-••-5561', verified: true, provider: 'Demo verification (mock)' },
      repaymentRecord: { onTime: 0, total: 0 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 71,
      incomeQuality: { variationCoefficient: 0.22, sourceCount: 2, regularityRatio: 0.5, seasonal: false },
      occupation: { occupation: 'Sundry-shop owner', sector: 'Retail', employmentType: 'micro-business', tenureMonths: 8, selfDeclared: true },
    },
  },
  {
    label: 'Nurul Izzati binti Rashid',
    requestedAmount: 6000,
    role: 'approve',
    expectedVerdict: 'approve',
    subjectGroup: 'nurul',
    passport: {
      score: 650,
      band: 'Good',
      factorSummary: [
        { key: 'cashflow', subScore: 80 },
        { key: 'income', subScore: 75 },
        { key: 'savings', subScore: 68 },
        { key: 'debt', subScore: 86 },
        { key: 'discipline', subScore: 70 },
        { key: 'networth', subScore: 52 },
        { key: 'track_record', subScore: 60 },
      ],
      digitHistogram: [52, 31, 22, 17, 14, 12, 10, 9, 8],
      assessment: { confidence: 0.72, coverageRatio: 0.9, coverageDays: 90, avgIncome: 4000, avgMonthlySurplus: 1400, monthlyDebtService: 200 },
      holder: { name: 'Nurul Izzati binti Rashid', nricMasked: '••••••-••-3390', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 618, scoreTo: 650, coverageDaysFrom: 70, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 3, total: 3 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 70,
      incomeQuality: { variationCoefficient: 0.15, sourceCount: 1, regularityRatio: 0.95, seasonal: false },
      occupation: { occupation: 'Online seller', sector: 'Retail', employmentType: 'self-employed', tenureMonths: 20, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.58, expenseVolatility: 0.15, bufferDays: 18, savingsRate: 0.28,
        obligations: [{ label: 'Shop Lot Rental', kind: 'rent', monthlyAmount: 200, monthsObserved: 6 }],
      },
    },
  },
  {
    label: 'Chong Wei Ming',
    // Excellent band (not just Fair/Good/Strong)  also keeps the Portfolio band mix below the
    // 40% concentration threshold (spec F4) once combined with the other approvals' exposure.
    requestedAmount: 9000,
    role: 'approve',
    expectedVerdict: 'approve',
    subjectGroup: 'chong',
    passport: {
      score: 830,
      band: 'Excellent',
      factorSummary: [
        { key: 'cashflow', subScore: 93 },
        { key: 'income', subScore: 89 },
        { key: 'savings', subScore: 86 },
        { key: 'debt', subScore: 95 },
        { key: 'discipline', subScore: 84 },
        { key: 'networth', subScore: 72 },
        { key: 'track_record', subScore: 68 },
      ],
      digitHistogram: [63, 35, 25, 18, 15, 13, 11, 10, 9],
      assessment: { confidence: 0.85, coverageRatio: 0.95, coverageDays: 90, avgIncome: 5200, avgMonthlySurplus: 2000, monthlyDebtService: 120 },
      holder: { name: 'Chong Wei Ming', nricMasked: '••••••-••-1128', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 798, scoreTo: 830, coverageDaysFrom: 74, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 7, total: 7 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 82,
      incomeQuality: { variationCoefficient: 0.09, sourceCount: 2, regularityRatio: 0.93, seasonal: false },
      occupation: { occupation: 'Hardware store owner', sector: 'Retail', employmentType: 'micro-business', tenureMonths: 44, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.5, expenseVolatility: 0.1, bufferDays: 24, savingsRate: 0.35,
        obligations: [{ label: 'Van Hire-Purchase', kind: 'installment', monthlyAmount: 120, monthsObserved: 6 }],
      },
    },
  },
  {
    label: 'Siti Aminah binti Kassim',
    requestedAmount: 5000,
    role: 'approve',
    expectedVerdict: 'approve',
    subjectGroup: 'siti',
    passport: {
      score: 660,
      band: 'Good',
      factorSummary: [
        { key: 'cashflow', subScore: 81 },
        { key: 'income', subScore: 76 },
        { key: 'savings', subScore: 70 },
        { key: 'debt', subScore: 87 },
        { key: 'discipline', subScore: 69 },
        { key: 'networth', subScore: 54 },
        { key: 'track_record', subScore: 58 },
      ],
      digitHistogram: [53, 31, 22, 17, 14, 12, 10, 9, 8],
      assessment: { confidence: 0.7, coverageRatio: 0.85, coverageDays: 90, avgIncome: 4200, avgMonthlySurplus: 1500, monthlyDebtService: 200 },
      holder: { name: 'Siti Aminah binti Kassim', nricMasked: '••••••-••-4471', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 630, scoreTo: 660, coverageDaysFrom: 68, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 3, total: 3 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 71,
      incomeQuality: { variationCoefficient: 0.14, sourceCount: 1, regularityRatio: 0.92, seasonal: false },
      occupation: { occupation: 'Caterer', sector: 'Food & Beverage', employmentType: 'micro-business', tenureMonths: 26, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.57, expenseVolatility: 0.16, bufferDays: 16, savingsRate: 0.29,
        obligations: [{ label: 'Kitchen Equipment Installment', kind: 'installment', monthlyAmount: 200, monthsObserved: 5 }],
      },
    },
  },
  {
    label: 'Aisyah Putri Wijaya',
    requestedAmount: 9000,
    role: 'approve',
    expectedVerdict: 'approve',
    subjectGroup: 'aisyah',
    passport: {
      score: 760,
      band: 'Strong',
      factorSummary: [
        { key: 'cashflow', subScore: 90 },
        { key: 'income', subScore: 85 },
        { key: 'savings', subScore: 82 },
        { key: 'debt', subScore: 93 },
        { key: 'discipline', subScore: 80 },
        { key: 'networth', subScore: 66 },
        { key: 'track_record', subScore: 70 },
      ],
      digitHistogram: [60, 34, 24, 18, 15, 13, 11, 10, 9],
      assessment: { confidence: 0.85, coverageRatio: 0.95, coverageDays: 90, avgIncome: 5000, avgMonthlySurplus: 2200, monthlyDebtService: 150 },
      holder: { name: 'Aisyah Putri Wijaya', nricMasked: '••••••-••-6602', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 726, scoreTo: 760, coverageDaysFrom: 80, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 6, total: 6 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 80,
      incomeQuality: { variationCoefficient: 0.1, sourceCount: 2, regularityRatio: 0.94, seasonal: false },
      occupation: { occupation: 'Boutique owner', sector: 'Retail', employmentType: 'micro-business', tenureMonths: 40, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.5, expenseVolatility: 0.1, bufferDays: 26, savingsRate: 0.36,
        obligations: [{ label: 'Shop Renovation Loan', kind: 'installment', monthlyAmount: 150, monthsObserved: 8 }],
      },
    },
  },
  {
    label: 'Ravindran a/l Muthu',
    requestedAmount: 9000,
    role: 'approve',
    expectedVerdict: 'approve',
    subjectGroup: 'ravindran',
    passport: {
      score: 800,
      band: 'Strong',
      factorSummary: [
        { key: 'cashflow', subScore: 92 },
        { key: 'income', subScore: 88 },
        { key: 'savings', subScore: 85 },
        { key: 'debt', subScore: 95 },
        { key: 'discipline', subScore: 83 },
        { key: 'networth', subScore: 70 },
        { key: 'track_record', subScore: 75 },
      ],
      digitHistogram: [62, 35, 25, 18, 15, 13, 11, 10, 9],
      assessment: { confidence: 0.9, coverageRatio: 0.97, coverageDays: 90, avgIncome: 5500, avgMonthlySurplus: 2500, monthlyDebtService: 100 },
      holder: { name: 'Ravindran a/l Muthu', nricMasked: '••••••-••-7719', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 768, scoreTo: 800, coverageDaysFrom: 82, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 8, total: 8 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 84,
      incomeQuality: { variationCoefficient: 0.08, sourceCount: 2, regularityRatio: 0.96, seasonal: false },
      occupation: { occupation: 'Logistics contractor', sector: 'Transport', employmentType: 'self-employed', tenureMonths: 52, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.48, expenseVolatility: 0.09, bufferDays: 30, savingsRate: 0.4,
        obligations: [{ label: 'Lorry Hire-Purchase', kind: 'installment', monthlyAmount: 100, monthsObserved: 10 }],
      },
    },
  },
  {
    label: 'Lim Poh Choo',
    requestedAmount: 9000,
    role: 'counter-offer',
    expectedVerdict: 'approve',
    expectedCounterOffer: true,
    subjectGroup: 'lim',
    passport: {
      score: 630,
      band: 'Good',
      factorSummary: [
        { key: 'cashflow', subScore: 60 },
        { key: 'income', subScore: 58 },
        { key: 'savings', subScore: 50 },
        { key: 'debt', subScore: 62 },
        { key: 'discipline', subScore: 56 },
        { key: 'networth', subScore: 44 },
        { key: 'track_record', subScore: 45 },
      ],
      digitHistogram: [50, 30, 21, 16, 13, 11, 10, 8, 7],
      assessment: { confidence: 0.75, coverageRatio: 0.9, coverageDays: 90, avgIncome: 4000, avgMonthlySurplus: 1150, monthlyDebtService: 500 },
      holder: { name: 'Lim Poh Choo', nricMasked: '••••••-••-9034', verified: true, provider: 'Demo verification (mock)' },
      momentum: { lookbackDays: 90, scoreFrom: 605, scoreTo: 630, coverageDaysFrom: 66, coverageDaysTo: 90, direction: 'rising' },
      repaymentRecord: { onTime: 2, total: 2 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: { bucket: 'arrears', reachedMonthsAgo: 4 },
        discountEligible: true,
      },
      sourceTrust: 62,
      incomeQuality: { variationCoefficient: 0.2, sourceCount: 1, regularityRatio: 0.85, seasonal: false },
      occupation: { occupation: 'Tailor', sector: 'Services', employmentType: 'self-employed', tenureMonths: 18, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.66, expenseVolatility: 0.2, bufferDays: 10, savingsRate: 0.18,
        obligations: [
          { label: 'Sewing Machine Installment', kind: 'installment', monthlyAmount: 300, monthsObserved: 5 },
          { label: 'Shop Rental', kind: 'rent', monthlyAmount: 200, monthsObserved: 5 },
        ],
      },
    },
  },
  {
    label: 'Wong Siew Lian',
    requestedAmount: 5000,
    role: 'decline-affordability',
    expectedVerdict: 'decline',
    subjectGroup: 'wong',
    passport: {
      score: 640,
      band: 'Good',
      factorSummary: [
        { key: 'cashflow', subScore: 40 },
        { key: 'income', subScore: 38 },
        { key: 'savings', subScore: 30 },
        { key: 'debt', subScore: 35 },
        { key: 'discipline', subScore: 42 },
        { key: 'networth', subScore: 28 },
        { key: 'track_record', subScore: 30 },
      ],
      digitHistogram: [48, 29, 20, 16, 13, 11, 9, 8, 7],
      assessment: { confidence: 0.7, coverageRatio: 0.9, coverageDays: 90, avgIncome: 1800, avgMonthlySurplus: 100, monthlyDebtService: 650 },
      holder: { name: 'Wong Siew Lian', nricMasked: '••••••-••-2258', verified: true, provider: 'Demo verification (mock)' },
      repaymentRecord: { onTime: 1, total: 2 },
      standing: {
        current: { bucket: 'arrears', adverseRecord: 'soft', monthsInArrears: 2, amountOverdue: 700 },
        scar: null,
        discountEligible: false,
      },
      sourceTrust: 58,
      incomeQuality: { variationCoefficient: 0.3, sourceCount: 2, regularityRatio: 0.7, seasonal: true },
      occupation: { occupation: 'Market stall trader', sector: 'Retail', employmentType: 'micro-business', tenureMonths: 12, selfDeclared: true },
      spendingProfile: {
        essentialsRatio: 0.85, expenseVolatility: 0.35, bufferDays: 4, savingsRate: 0.05,
        obligations: [
          { label: 'Motorcycle Installment', kind: 'installment', monthlyAmount: 350, monthsObserved: 4 },
          { label: 'Stall Rental', kind: 'rent', monthlyAmount: 300, monthsObserved: 4 },
        ],
      },
    },
  },
  {
    label: 'Zainal Abidin bin Hashim',
    requestedAmount: 500,
    role: 'decline-policy',
    expectedVerdict: 'decline',
    subjectGroup: 'zainal',
    passport: {
      score: 280,
      band: 'Building',
      factorSummary: [
        { key: 'cashflow', subScore: 22 },
        { key: 'income', subScore: 20 },
        { key: 'savings', subScore: 15 },
        { key: 'debt', subScore: 40 },
        { key: 'discipline', subScore: 25 },
        { key: 'networth', subScore: 10 },
        { key: 'track_record', subScore: 20 },
      ],
      digitHistogram: [30, 18, 13, 10, 9, 8, 7, 6, 5],
      assessment: { confidence: 0.6, coverageRatio: 0.9, coverageDays: 90, avgIncome: 1000, avgMonthlySurplus: 50, monthlyDebtService: 50 },
      holder: { name: 'Zainal Abidin bin Hashim', nricMasked: '••••••-••-7745', verified: true, provider: 'Demo verification (mock)' },
      repaymentRecord: { onTime: 0, total: 1 },
      standing: {
        current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
        scar: null,
        discountEligible: true,
      },
      sourceTrust: 48,
      incomeQuality: { variationCoefficient: 0.4, sourceCount: 1, regularityRatio: 0.5, seasonal: true },
      occupation: { occupation: 'Odd-job worker', sector: 'Informal', employmentType: 'gig', tenureMonths: 3, selfDeclared: true },
    },
  },
];

// Watchlist check-in (Brief S): same subject/keypair as Siti Aminah's approved passport
// (subjectGroup 'siti'), a later issuance, income down ~25% and surplus shrunk  the flags
// diffCheckIn is expected to raise. Listed separately so the seeder can attach it via
// recordCheckIn rather than filing it as a new application.
const CHECKIN_PROFILE = {
  label: 'Siti Aminah binti Kassim (check-in)',
  requestedAmount: 5000,
  role: 'checkin',
  pairsWithLabel: 'Siti Aminah binti Kassim',
  subjectGroup: 'siti', // reuses Siti's keypair  same subject, later in time
  issuedAtOverride: checkinIssuedAt,
  passport: {
    score: 610,
    band: 'Fair',
    factorSummary: [
      { key: 'cashflow', subScore: 60 },
      { key: 'income', subScore: 55 },
      { key: 'savings', subScore: 60 },
      { key: 'debt', subScore: 78 },
      { key: 'discipline', subScore: 65 },
      { key: 'networth', subScore: 50 },
      { key: 'track_record', subScore: 58 },
    ],
    digitHistogram: [50, 30, 21, 16, 13, 11, 10, 8, 7],
    // avgIncome 4200 → 3150 (-25%); avgMonthlySurplus 1500 → 700 (shrinking).
    assessment: { confidence: 0.62, coverageRatio: 0.7, coverageDays: 75, avgIncome: 3150, avgMonthlySurplus: 700, monthlyDebtService: 200 },
    holder: { name: 'Siti Aminah binti Kassim', nricMasked: '••••••-••-4471', verified: true, provider: 'Demo verification (mock)' },
    momentum: { lookbackDays: 90, scoreFrom: 660, scoreTo: 610, coverageDaysFrom: 90, coverageDaysTo: 75, direction: 'falling' },
    repaymentRecord: { onTime: 3, total: 4 },
    standing: {
      current: { bucket: 'clean', adverseRecord: 'none', monthsInArrears: 0, amountOverdue: 0 },
      scar: null,
      discountEligible: true,
    },
    sourceTrust: 65,
    incomeQuality: { variationCoefficient: 0.24, sourceCount: 1, regularityRatio: 0.75, seasonal: false },
    occupation: { occupation: 'Caterer', sector: 'Food & Beverage', employmentType: 'micro-business', tenureMonths: 27, selfDeclared: true },
    spendingProfile: {
      essentialsRatio: 0.68, expenseVolatility: 0.24, bufferDays: 9, savingsRate: 0.12,
      obligations: [{ label: 'Kitchen Equipment Installment', kind: 'installment', monthlyAmount: 200, monthsObserved: 6 }],
    },
  },
};

// ── Canonicalize + sign (mirrors passport.ts / generate.js) ────────────────────

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortKeys(obj[k])]));
  }
  return obj;
}

function signProfile(profile, privKey, issuedAtFor) {
  const p = profile.passport;
  const pubKeyHex = Buffer.from(ed.getPublicKey(privKey)).toString('hex');
  const benfordPct = benfordPctOf(p.digitHistogram);
  const iat = issuedAtFor ?? issuedAt;

  const consent = [
    {
      tier: 0,
      scope: ['score', 'factors', 'confidence', 'coverage', 'income', 'surplus', 'debtService', 'repayment', 'standing', ...(p.momentum ? ['momentum'] : []), 'digitHistogram', 'provenance', 'evidence', 'versions', 'incomeQuality'],
      grantedAt: iat,
      expiresAt: validUntil,
    },
    {
      tier: 1,
      scope: ['holderName', 'holderNric', 'holderProvider', 'occupation', 'employment'],
      grantedAt: iat,
      expiresAt: validUntil,
    },
    ...(p.spendingProfile
      ? [{ tier: 2, scope: ['essentialsRatio', 'expenseVolatility', 'bufferDays', 'savingsRate', 'obligations'], grantedAt: iat, expiresAt: validUntil }]
      : []),
  ];

  const passport = {
    subject: pubKeyHex,
    score: p.score,
    band: p.band,
    factorSummary: p.factorSummary,
    provenanceSummary: `source trust ${p.sourceTrust}%; Benford conformity ${benfordPct}%; coverage ${Math.round(p.assessment.coverageRatio * 100)}% of last 90 days`,
    evidenceHash: Buffer.from(ed.utils.randomSecretKey()).toString('hex'),
    repaymentRecord: p.repaymentRecord,
    ...(p.standing ? { standing: p.standing } : {}),
    issuedAt: iat,
    validUntil,
    assessment: p.assessment,
    holder: p.holder,
    ...(p.momentum ? { momentum: p.momentum } : {}),
    provenanceMeta,
    digitHistogram: p.digitHistogram,
    incomeQuality: p.incomeQuality,
    occupation: p.occupation,
    ...(p.spendingProfile ? { spendingProfile: p.spendingProfile } : {}),
    consent,
  };

  const msg = Buffer.from(JSON.stringify(sortKeys(passport)));
  const signature = Buffer.from(ed.sign(msg, privKey)).toString('hex');
  const issuerSignature = Buffer.from(ed.sign(msg, issuerSecret)).toString('hex');

  const holderOk = ed.verify(Buffer.from(signature, 'hex'), msg, ed.getPublicKey(privKey));
  const issuerOk = ed.verify(Buffer.from(issuerSignature, 'hex'), msg, ed.getPublicKey(issuerSecret));
  if (!holderOk || !issuerOk) {
    console.error(`ERROR: self-verification failed for ${profile.label}.`);
    process.exit(1);
  }

  return JSON.stringify({ passport, signature, issuerSignature });
}

// One keypair per subjectGroup so the watchlist check-in shares its base's subject.
const keysByGroup = new Map();
function keyFor(group) {
  if (!keysByGroup.has(group)) keysByGroup.set(group, ed.utils.randomSecretKey());
  return keysByGroup.get(group);
}

const out = [];
const codeByLabel = new Map();

for (const profile of PROFILES) {
  const privKey = keyFor(profile.subjectGroup);
  const code = signProfile(profile, privKey, undefined);
  codeByLabel.set(profile.label, code);
  out.push({
    label: profile.label,
    requestedAmount: profile.requestedAmount,
    code,
    role: profile.role,
    expectedVerdict: profile.expectedVerdict,
    ...(profile.expectedCounterOffer ? { expectedCounterOffer: true } : {}),
  });
  console.log(`Signed ${profile.label}  ${profile.passport.score}/${profile.passport.band}, expect ${profile.expectedVerdict}.`);
}

// The watchlist check-in: reuses Siti's keypair, signed with its own later issuedAt.
{
  const privKey = keyFor(CHECKIN_PROFILE.subjectGroup);
  const code = signProfile(CHECKIN_PROFILE, privKey, CHECKIN_PROFILE.issuedAtOverride);
  out.push({
    label: CHECKIN_PROFILE.label,
    requestedAmount: CHECKIN_PROFILE.requestedAmount,
    code,
    role: CHECKIN_PROFILE.role,
    pairsWithLabel: CHECKIN_PROFILE.pairsWithLabel,
  });
  console.log(`Signed ${CHECKIN_PROFILE.label}  ${CHECKIN_PROFILE.passport.score}/${CHECKIN_PROFILE.passport.band} (check-in, pairs with "${CHECKIN_PROFILE.pairsWithLabel}").`);
}

// The stacking case: the SAME signed code as Nurul Izzati's approval, listed a second
// time so the seeder can present it twice within 24h (Brief G stacking warning).
{
  const baseLabel = 'Nurul Izzati binti Rashid';
  const code = codeByLabel.get(baseLabel);
  out.push({
    label: `${baseLabel} (re-presented)`,
    requestedAmount: PROFILES.find((p) => p.label === baseLabel).requestedAmount,
    code,
    role: 'stacking-duplicate',
    duplicateOfLabel: baseLabel,
  });
  console.log(`Duplicated ${baseLabel}'s code for the stacking case.`);
}

console.log(`Total demo applicants: ${out.length}.`);

const outFile = path.join(__dirname, '../../../LenderConsole/app/demoApplicants.ts');
fs.writeFileSync(
  outFile,
  `// Auto-generated by PipComp/tools/demoPassport/generateApplicants.js  do not edit manually.\n` +
    `// Pre-signed demo applicants for the queue-seed action (Brief O): 13-persona mix\n` +
    `// (Demo Data plan Task 5, spec section C)  6 approvals across Fair/Good/Strong, 2\n` +
    `// engine-refers (confidence-gated, coverage-gated), 1 counter-offer, 2 declines\n` +
    `// (affordability, policy-ineligible), 1 watchlist check-in pair, 1 stacking duplicate.\n` +
    `export interface DemoApplicant {\n` +
    `  label: string;\n` +
    `  requestedAmount: number;\n` +
    `  code: string;\n` +
    `  role: 'approve' | 'refer-confidence' | 'refer-coverage' | 'counter-offer' | 'decline-affordability' | 'decline-policy' | 'checkin' | 'stacking-duplicate';\n` +
    `  expectedVerdict?: 'approve' | 'refer' | 'decline';\n` +
    `  expectedCounterOffer?: boolean;\n` +
    `  pairsWithLabel?: string;\n` +
    `  duplicateOfLabel?: string;\n` +
    `}\n` +
    `export const DEMO_APPLICANTS: DemoApplicant[] = ${JSON.stringify(out, null, 2)};\n`,
);
console.log('Written:', outFile);
