/**
 * tools/demoPassport/generateApplicants.js
 * One-time offline script — generates the pre-signed demo APPLICANT passports the
 * console's queue-seed action files (Brief O), and writes them to
 * LenderConsole/app/demoApplicants.ts.
 *
 * Why these exist: the queues spec assumed the existing sample/suspect codes could
 * seed a varied pipeline, but the sample passport can only ever DECLINE under the
 * default ladder and the suspect code fails verification by design. A working
 * demo pipeline needs an approvable file and referable files, so each profile
 * below is engineered against the real decideLoan policy:
 *   1. Farid  — Fair 580, strong confidence → Starter-tier APPROVE.
 *   2. Mei Ling — Good 660 but confidence 0.44 (< 0.50 floor) → REFER with offer.
 *   3. Kavitha — Good 700 but 25/90 covered days → Emergency-only force-REFER.
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
  console.error('Could not read ISSUER_SECRET_KEY — run tools/issuerKey/generate.js first.');
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

function benfordPctOf(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    deviation += Math.abs(counts[d - 1] / total - Math.log10(1 + 1 / d));
  }
  return Math.round(Math.max(0, Math.min(1, 1 - deviation / 1.7)) * 100);
}

// ── The three applicant profiles ───────────────────────────────────────────────

const PROFILES = [
  {
    label: 'Farid bin Osman',
    requestedAmount: 4000,
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
      sourceTrust: 74,
    },
  },
  {
    label: 'Mei Ling Tan',
    requestedAmount: 8000,
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
      sourceTrust: 52,
    },
  },
  {
    label: 'Kavitha a/p Suresh',
    requestedAmount: 500,
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
      // No momentum block: 25 covered days sits under the minimum-history floor — honest absence.
      repaymentRecord: { onTime: 0, total: 0 },
      sourceTrust: 71,
    },
  },
];

// ── Canonicalize + sign (mirrors passport.ts / generate.js) ────────────────────

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortKeys(obj[k])]));
  }
  return obj;
}

const out = [];
for (const profile of PROFILES) {
  const p = profile.passport;
  const privKey = ed.utils.randomSecretKey();
  const pubKeyHex = Buffer.from(ed.getPublicKey(privKey)).toString('hex');
  const benfordPct = benfordPctOf(p.digitHistogram);

  const passport = {
    subject: pubKeyHex,
    score: p.score,
    band: p.band,
    factorSummary: p.factorSummary,
    provenanceSummary: `source trust ${p.sourceTrust}%; Benford conformity ${benfordPct}%; coverage ${Math.round(p.assessment.coverageRatio * 100)}% of last 90 days`,
    evidenceHash: Buffer.from(ed.utils.randomSecretKey()).toString('hex'),
    repaymentRecord: p.repaymentRecord,
    issuedAt,
    validUntil,
    assessment: p.assessment,
    holder: p.holder,
    ...(p.momentum ? { momentum: p.momentum } : {}),
    provenanceMeta,
    digitHistogram: p.digitHistogram,
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

  out.push({
    label: profile.label,
    requestedAmount: profile.requestedAmount,
    code: JSON.stringify({ passport, signature, issuerSignature }),
  });
  console.log(`Signed ${profile.label} — ${p.score}/${p.band}, confidence ${p.assessment.confidence}, coverage ${p.assessment.coverageDays}d.`);
}

const outFile = path.join(__dirname, '../../../LenderConsole/app/demoApplicants.ts');
fs.writeFileSync(
  outFile,
  `// Auto-generated by PipComp/tools/demoPassport/generateApplicants.js — do not edit manually.\n` +
    `// Pre-signed demo applicants for the queue-seed action (Brief O): engineered against the\n` +
    `// real decideLoan policy to land one APPROVE, two REFERs (low confidence / thin coverage).\n` +
    `export const DEMO_APPLICANTS: { label: string; requestedAmount: number; code: string }[] = ${JSON.stringify(out, null, 2)};\n`,
);
console.log('Written:', outFile);
