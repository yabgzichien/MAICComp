/**
 * tools/demoPassport/generate.js
 * One-time offline script — generates a pre-signed sample Credit Passport (holder +
 * issuer signatures, with the lender assessment block) and writes it to
 * src/data/samplePassport.ts.
 *
 * Run: node tools/demoPassport/generate.js
 * (Re-run after rotating the issuer key via tools/issuerKey/generate.js.)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const ed = require('@noble/ed25519');
const { sha512 } = require(path.join(__dirname, '../../node_modules/@noble/hashes/sha2.js'));
ed.hashes.sha512 = sha512;

// ── Read the bundled issuer secret from src/data/issuerKey.ts ──────────────────
const issuerKeyTs = fs.readFileSync(path.join(__dirname, '../../src/data/issuerKey.ts'), 'utf8');
const secretMatch = issuerKeyTs.match(/ISSUER_SECRET_KEY\s*=\s*'([0-9a-f]+)'/);
if (!secretMatch) {
  console.error('Could not read ISSUER_SECRET_KEY — run tools/issuerKey/generate.js first.');
  process.exit(1);
}
const issuerSecret = Buffer.from(secretMatch[1], 'hex');

// ── Read the version stamps from src/lib/versions.ts (kept in sync automatically) ──
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

// ── Sample digit histogram (counts of leading digits 1–9, index 0 = digit 1) ──────
// Mildly off-Benford, matching a genuine-but-imperfect 90-day ledger. The Benford
// percentage in provenanceSummary is COMPUTED from these counts (same formula as
// src/lib/dataConfidence.ts benfordConformity) so prose and chart can never disagree.
const digitHistogram = [71, 22, 18, 13, 20, 9, 8, 10, 7];
function benfordPctOf(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    deviation += Math.abs(counts[d - 1] / total - Math.log10(1 + 1 / d));
  }
  const conformity = Math.max(0, Math.min(1, 1 - deviation / 1.7));
  return Math.round(conformity * 100);
}
const benfordPct = benfordPctOf(digitHistogram);

// ── 1. Holder keypair (the borrower) ───────────────────────────────────────────
const privKey = ed.utils.randomSecretKey();
const pubKeyHex = Buffer.from(ed.getPublicKey(privKey)).toString('hex');

// ── 2. Sample passport (672 / Good, coherent with the live demo profile) ───────
// NOTE: real passports are valid 30 days (see buildPassport). This *demo sample* uses an
// extended window so "Load sample applicant" keeps verifying through the competition now
// that verification enforces the validity window (H1).
const issuedAt = '2026-06-01T08:00:00.000Z';
const validUntil = '2027-06-01T08:00:00.000Z';

const passport = {
  subject: pubKeyHex,
  score: 672,
  band: 'Good',
  factorSummary: [
    { key: 'cashflow',     subScore: 72 },
    { key: 'income',       subScore: 65 },
    { key: 'savings',      subScore: 55 },
    { key: 'debt',         subScore: 88 },
    { key: 'discipline',   subScore: 70 },
    { key: 'networth',     subScore: 52 },
    { key: 'track_record', subScore: 40 },
  ],
  provenanceSummary:
    `source trust 70%; Benford conformity ${benfordPct}%; 2% round amounts; 0% duplicates; coverage 70% of last 90 days; expenses 82% of income`,
  evidenceHash:
    'abc123def456abc123def456abc123def456abc123def456abc123def456ab12',
  repaymentRecord: { onTime: 0, total: 0 },
  issuedAt,
  validUntil,
  assessment: {
    confidence: 0.62,
    coverageRatio: 0.7,
    coverageDays: 90,
    avgIncome: 2540,
    avgMonthlySurplus: 520,
    // Evidenced monthly debt service (Brief P): the sum of the detected recurring obligations
    // below (70 + 50), no longer a self-reported figure. Kept equal to the prior value so the
    // sample's decision under the default ladder is unchanged.
    monthlyDebtService: 120,
  },
  holder: {
    name: 'Aisyah binti Rahman',
    nricMasked: '••••••-••-5678',
    verified: true,
    provider: 'Demo verification (mock)',
  },
  // Richer passport blocks (Brief P). Income quality is Tier 0 (aggregate); occupation is Tier 1
  // (self-declared); the spending profile with its itemised obligations is Tier 2 (behavioural).
  incomeQuality: {
    variationCoefficient: 0.18,
    sourceCount: 1,
    regularityRatio: 0.83,
    seasonal: false,
  },
  occupation: {
    occupation: 'Ride-hailing driver',
    sector: 'Transport',
    employmentType: 'gig',
    tenureMonths: 22,
    selfDeclared: true,
  },
  spendingProfile: {
    essentialsRatio: 0.68,
    expenseVolatility: 0.15,
    bufferDays: 9,
    savingsRate: 0.2,
    obligations: [
      { label: 'TNB Electric', kind: 'utilities', monthlyAmount: 70, monthsObserved: 3 },
      { label: 'Unifi Fibre', kind: 'utilities', monthlyAmount: 50, monthsObserved: 3 },
    ],
  },
  momentum: {
    lookbackDays: 90,
    scoreFrom: 631,
    scoreTo: 672,
    coverageDaysFrom: 41,
    coverageDaysTo: 90,
    direction: 'rising',
  },
  provenanceMeta,
  digitHistogram,
  // Signed consent receipts (Brief I stretch + Brief P): Tier 0 aggregates (incl. income quality),
  // Tier 1 identity + occupation, Tier 2 spending profile — so every attached block rides along
  // legitimately and the console trust panel shows real consent. Scope keys mirror
  // tier0/tier1/tier2ScopeRows; all grants run to the demo validity window.
  consent: [
    {
      tier: 0,
      scope: ['score', 'factors', 'confidence', 'coverage', 'income', 'surplus', 'debtService', 'repayment', 'momentum', 'digitHistogram', 'provenance', 'evidence', 'versions', 'incomeQuality'],
      grantedAt: issuedAt,
      expiresAt: validUntil,
    },
    {
      tier: 1,
      scope: ['holderName', 'holderNric', 'holderProvider', 'occupation', 'employment'],
      grantedAt: issuedAt,
      expiresAt: validUntil,
    },
    {
      tier: 2,
      scope: ['essentialsRatio', 'expenseVolatility', 'bufferDays', 'savingsRate', 'obligations'],
      grantedAt: issuedAt,
      expiresAt: validUntil,
    },
  ],
};

// ── 3. Canonicalize (mirrors passport.ts) ──────────────────────────────────────
function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortKeys(obj[k])]));
  }
  return obj;
}
const canonical = JSON.stringify(sortKeys(passport));
const msg = Buffer.from(canonical);

// ── 4. Sign with holder + issuer keys ──────────────────────────────────────────
const signature = Buffer.from(ed.sign(msg, privKey)).toString('hex');
const issuerSignature = Buffer.from(ed.sign(msg, issuerSecret)).toString('hex');

// ── 5. Self-verify both before writing ─────────────────────────────────────────
const holderOk = ed.verify(Buffer.from(signature, 'hex'), msg, ed.getPublicKey(privKey));
const issuerOk = ed.verify(Buffer.from(issuerSignature, 'hex'), msg, ed.getPublicKey(issuerSecret));
if (!holderOk || !issuerOk) {
  console.error(`ERROR: self-verification failed (holder=${holderOk}, issuer=${issuerOk}).`);
  process.exit(1);
}
console.log(`Self-verification PASSED (holder + issuer). Score ${passport.score}/${passport.band}.`);

// ── 6. Write src/data/samplePassport.ts ────────────────────────────────────────
const passportCode = JSON.stringify({ passport, signature, issuerSignature });
const outFile = path.join(__dirname, '../../src/data/samplePassport.ts');
fs.writeFileSync(
  outFile,
  `// Auto-generated by tools/demoPassport/generate.js — do not edit manually.\nexport const SAMPLE_PASSPORT_CODE = ${JSON.stringify(passportCode)};\n`,
);
console.log('Written:', outFile);
