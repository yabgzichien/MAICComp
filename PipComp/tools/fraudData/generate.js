// @ts-check
/**
 * tools/fraudData/generate.js
 * LEGACY (Phase A) synthetic generator. SUPERSEDED by the semi-real pipeline
 * `tools/fraudRealData/build.ts` (real Berka genuine class + perturbed fraud). Do NOT run this 
 * it would overwrite dataset.json with fully-synthetic, perfectly-separable data (AUC 1.0). Kept
 * for reference only.
 *
 * Offline synthetic fraud dataset generator for Pip Credit ML (Task A1).
 * Produces 1000 genuine + 1000 fabricated labeled feature vectors.
 *
 * Run:  node tools/fraudData/generate.js
 *
 * CANONICAL FEATURE VECTOR (index 0-8)  must match src/lib/fraudFeatures.ts (Task A2):
 *   0  provenance_trust    weighted source trust 0..1 (SOURCE_WEIGHT: verified=1.0, extracted/imported=0.7, manual=0.4)
 *   1  benford_conformity  Benford's Law conformity 0..1 (0.5 if <30 amounts)
 *   2  round_ratio         fraction of amounts divisible by 100
 *   3  duplicate_ratio     fraction of duplicate-looking rows (merchant+amount+date)
 *   4  gap_mean            mean inter-transaction gap in days / 30, clamped 0..1
 *   5  gap_variance        variance of gaps in days / 100, clamped 0..1
 *   6  merchant_entropy    Shannon entropy / log2(uniqueMerchants+1), clamped 0..1
 *   7  amount_mean_norm    mean amount / 5000, clamped 0..1
 *   8  amount_cv           std/mean of amounts, clamped 0..1
 *
 * Label: 0 = genuine, 1 = fabricated.
 */

'use strict';
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Seeded PRNG (xorshift32)  reproducible runs
// ---------------------------------------------------------------------------
let _seed = 42;
function rand() {
  _seed ^= _seed << 13;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5;
  // Bring to unsigned 32-bit then normalise to [0,1)
  return ((_seed >>> 0) / 4294967296);
}
function randInt(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo; }
function randChoice(arr) { return arr[Math.floor(rand() * arr.length)]; }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SOURCE_WEIGHT = { verified: 1.0, extracted: 0.7, imported: 0.7, manual: 0.4 };

const MERCHANTS = [
  'Grab', "Touch 'n Go", '99 Speedmart', 'FamilyMart', 'Shell', 'Watsons',
  'KFC', 'Shopee', 'Lazada', 'TNG', "McDonald's", 'Starbucks',
  'Mr DIY', 'Parkson', 'Aeon',
];

const FAB_AMOUNTS = [50, 100, 150, 200, 250, 300, 500];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Log-normal sample (Box-Muller). */
function logNormal(mean, sigma) {
  const u1 = rand(), u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(Math.log(mean) + sigma * z);
}

/** Add Gaussian noise (Box-Muller). */
function gaussianNoise(mean, stddev) {
  const u1 = rand(), u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
  return mean + stddev * z;
}

// ---------------------------------------------------------------------------
// Feature computation  mirrors what dataConfidence.ts + fraudFeatures.ts compute
// ---------------------------------------------------------------------------

function provenanceTrust(sources) {
  if (sources.length === 0) return 0.5;
  const total = sources.reduce((s, src) => s + (SOURCE_WEIGHT[src] ?? 0.4), 0);
  return total / sources.length;
}

function benfordConformity(amounts) {
  const digits = amounts
    .map(a => Math.floor(Math.abs(a)))
    .filter(n => n > 0)
    .map(n => Number(String(n)[0]))
    .filter(d => d >= 1 && d <= 9);
  if (digits.length < 30) return 0.5;
  const counts = new Array(10).fill(0);
  for (const d of digits) counts[d]++;
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    const observed = counts[d] / digits.length;
    const expected = Math.log10(1 + 1 / d);
    deviation += Math.abs(observed - expected);
  }
  return clamp(1 - deviation / 1.7, 0, 1);
}

function roundRatio(amounts) {
  if (amounts.length === 0) return 0;
  return amounts.filter(a => a > 0 && a % 100 === 0).length / amounts.length;
}

function duplicateRatio(txns) {
  if (txns.length === 0) return 0;
  const seen = new Map();
  let dups = 0;
  for (const t of txns) {
    const k = `${t.merchantKey}|${t.amount}|${t.date}`;
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    if (c > 1) dups++;
  }
  return dups / txns.length;
}

function gapStats(dates) {
  const sorted = dates
    .filter(Boolean)
    .map(d => new Date(d).getTime())
    .sort((a, b) => a - b);
  if (sorted.length < 2) return { mean: 0, variance: 0 };
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i] - sorted[i - 1]) / 86400000); // ms -> days
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  return { mean, variance };
}

function merchantEntropy(txns) {
  const freq = new Map();
  for (const t of txns) {
    freq.set(t.merchantKey, (freq.get(t.merchantKey) ?? 0) + 1);
  }
  const n = freq.size;
  if (n <= 1) return 0;
  const total = txns.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return clamp(entropy / Math.log2(n + 1), 0, 1);
}

function amountStats(amounts) {
  if (amounts.length === 0) return { mean: 0, cv: 0 };
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;
  return { mean, cv };
}

function extractFeatures(txns) {
  const amounts = txns.map(t => t.amount);
  const sources = txns.map(t => t.source);
  const dates = txns.map(t => t.date);

  const pt = provenanceTrust(sources);
  const bc = benfordConformity(amounts);
  const rr = roundRatio(amounts);
  const dr = duplicateRatio(txns);
  const { mean: gm, variance: gv } = gapStats(dates);
  const me = merchantEntropy(txns);
  const { mean: am, cv: acv } = amountStats(amounts);

  return [
    clamp(pt, 0, 1),
    clamp(bc, 0, 1),
    clamp(rr, 0, 1),
    clamp(dr, 0, 1),
    clamp(gm / 30, 0, 1),
    clamp(gv / 100, 0, 1),
    clamp(me, 0, 1),
    clamp(am / 5000, 0, 1),
    clamp(acv, 0, 1),
  ];
}

// ---------------------------------------------------------------------------
// ISO date helper
// ---------------------------------------------------------------------------
function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Profile generators
// ---------------------------------------------------------------------------

function generateGenuineProfile() {
  const txnCount = randInt(60, 180);
  const merchantPoolSize = randInt(15, 30);
  const pool = [];
  const shuffled = MERCHANTS.slice().sort(() => rand() - 0.5);
  // Allow repeats if pool larger than MERCHANTS list
  for (let i = 0; i < merchantPoolSize; i++) {
    pool.push(shuffled[i % shuffled.length]);
  }

  // Build transactions
  let currentDate = '2025-01-01';
  const txns = [];

  for (let i = 0; i < txnCount; i++) {
    // Gap: mostly 1-5 days, occasionally up to 14
    const gapBase = rand() < 0.85 ? randInt(1, 5) : randInt(6, 14);
    currentDate = addDays(currentDate, gapBase);

    const merchant = randChoice(pool);
    const rawAmount = logNormal(50, 1.2);
    const amount = Math.round(clamp(rawAmount, 1, 2000) * 100) / 100;

    // Source: 70% extracted, 30% imported
    const source = rand() < 0.70 ? 'extracted' : 'imported';

    txns.push({ merchantKey: merchant, amount, date: currentDate, source });
  }

  // Inject ~2% duplicate rows
  const dupCount = Math.floor(txns.length * 0.02);
  for (let i = 0; i < dupCount; i++) {
    const orig = txns[randInt(0, txns.length - 1)];
    txns.push({ ...orig });
  }

  // Add ±20% jitter on numeric features by perturbing amounts slightly
  const jitteredTxns = txns.map(t => ({
    ...t,
    amount: clamp(t.amount * (1 + (rand() * 0.4 - 0.2)), 1, 2000),
  }));

  return jitteredTxns;
}

function generateFabricatedProfile() {
  const txnCount = randInt(40, 80);
  const merchantPoolSize = randInt(3, 7);
  const pool = MERCHANTS.slice(0, merchantPoolSize);

  // Weighted towards first merchant
  function pickMerchant() {
    const r = rand();
    if (r < 0.55) return pool[0]; // dominant merchant
    return pool[randInt(0, pool.length - 1)];
  }

  // Date gap pattern: either exactly 7 or exactly 30 days
  const gapPattern = rand() < 0.5 ? 7 : 30;

  let currentDate = '2025-01-01';
  const txns = [];

  for (let i = 0; i < txnCount; i++) {
    currentDate = addDays(currentDate, gapPattern);
    const merchant = pickMerchant();
    const amount = randChoice(FAB_AMOUNTS);
    const source = rand() < 0.80 ? 'manual' : 'extracted';
    txns.push({ merchantKey: merchant, amount, date: currentDate, source });
  }

  // Inject 15-25% duplicates
  const dupFrac = 0.15 + rand() * 0.10;
  const dupCount = Math.floor(txns.length * dupFrac);
  for (let i = 0; i < dupCount; i++) {
    const orig = txns[randInt(0, txns.length - 1)];
    txns.push({ ...orig });
  }

  return txns;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const dataset = [];

  console.log('Generating 1000 genuine profiles...');
  for (let i = 0; i < 1000; i++) {
    const txns = generateGenuineProfile();
    const features = extractFeatures(txns);
    dataset.push({ features, label: 0 });
  }

  console.log('Generating 1000 fabricated profiles...');
  for (let i = 0; i < 1000; i++) {
    const txns = generateFabricatedProfile();
    const features = extractFeatures(txns);
    dataset.push({ features, label: 1 });
  }

  // Shuffle dataset
  for (let i = dataset.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [dataset[i], dataset[j]] = [dataset[j], dataset[i]];
  }

  // ---------------------------------------------------------------------------
  // Verification assertions
  // ---------------------------------------------------------------------------
  const genuine = dataset.filter(r => r.label === 0);
  const fabricated = dataset.filter(r => r.label === 1);

  const avg = (arr, idx) => arr.reduce((s, r) => s + r.features[idx], 0) / arr.length;

  const fabRoundRatio = avg(fabricated, 2);
  const genuineEntropy = avg(genuine, 6);
  const fabricatedEntropy = avg(fabricated, 6);
  const genuineBenford = avg(genuine, 1);
  const fabricatedBenford = avg(fabricated, 1);

  console.log('\n--- Verification ---');
  console.log(`Total rows: ${dataset.length} (genuine: ${genuine.length}, fabricated: ${fabricated.length})`);

  console.log(`mean round_ratio (fabricated): ${fabRoundRatio.toFixed(4)}  expect >0.3`);
  if (fabRoundRatio <= 0.3) {
    console.error('FAIL: fabricated round_ratio should be >0.3');
    process.exit(1);
  } else {
    console.log('  PASS');
  }

  console.log(`mean merchant_entropy  genuine: ${genuineEntropy.toFixed(4)}, fabricated: ${fabricatedEntropy.toFixed(4)}  expect genuine > fabricated`);
  if (genuineEntropy <= fabricatedEntropy) {
    console.error('FAIL: genuine merchant_entropy should be > fabricated');
    process.exit(1);
  } else {
    console.log('  PASS');
  }

  console.log(`mean benford_conformity  genuine: ${genuineBenford.toFixed(4)}, fabricated: ${fabricatedBenford.toFixed(4)}  expect genuine > fabricated`);
  if (genuineBenford <= fabricatedBenford) {
    console.error('FAIL: genuine benford_conformity should be > fabricated');
    process.exit(1);
  } else {
    console.log('  PASS');
  }

  // ---------------------------------------------------------------------------
  // Write output
  // ---------------------------------------------------------------------------
  const outPath = path.join(__dirname, 'dataset.json');
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));
  console.log(`\nDataset written to ${outPath}`);
  console.log('Done.');
}

main();
