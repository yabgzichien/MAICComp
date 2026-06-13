// tools/fraudRealData/build.ts
// Build a semi-real fraud training set from the Berka trans.csv:
//   genuine class = real per-account transaction behaviour (real Benford, gaps, amounts)
//   fraud class   = the same real accounts run through perturbTransactions()
// Features are computed by REUSING the app's extractFraudFeatures, so the dataset is byte-
// identical to live extraction. Writes tools/fraudData/dataset.json (consumed by train.js).
//
// Run: npx tsx tools/fraudRealData/build.ts [path/to/trans.csv]
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { extractFraudFeatures, toFeatureVector } from '../../src/lib/fraudFeatures';
import type { ConfidenceTxn } from '../../src/lib/dataConfidence';
import { perturbTransactions } from './perturb';

const INPUT = process.argv[2] || path.join(__dirname, '../../../dataset/trans.csv');
const OUTPUT = path.join(__dirname, '../fraudData/dataset.json');
const WINDOW = 60;        // most-recent transactions per account
const MIN_TXNS = 40;      // skip accounts with too little history (Benford needs >= 30)
const MAX_ACCOUNTS = 3000;

interface Raw {
  day: string; // YYYY-MM-DD
  amount: number;
  ksym: string; // merchant proxy
}

function unquote(s: string): string {
  return s.replace(/^"|"$/g, '').trim();
}

function berkaDate(yymmdd: string): string {
  const yy = Number(yymmdd.slice(0, 2));
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return `${year}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Input not found: ${INPUT}\nPass the path: npx tsx tools/fraudRealData/build.ts <trans.csv>`);
    process.exit(1);
  }
  console.log(`Reading ${INPUT} …`);
  const byAccount = new Map<string, Raw[]>();

  const rl = readline.createInterface({ input: fs.createReadStream(INPUT), crlfDelay: Infinity });
  let header = true;
  let lines = 0;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    if (!line) continue;
    const c = line.split(';');
    if (c.length < 8) continue;
    const account = c[1];
    const amount = parseFloat(c[5]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const ksym = unquote(c[7]) || unquote(c[4]) || 'na'; // k_symbol, else operation
    const arr = byAccount.get(account) ?? [];
    arr.push({ day: berkaDate(c[2]), amount, ksym });
    byAccount.set(account, arr);
    if (++lines % 200000 === 0) console.log(`  …${lines} rows`);
  }
  console.log(`Parsed ${lines} rows across ${byAccount.size} accounts.`);

  const rows: { features: number[]; label: number }[] = [];
  let used = 0;
  // Deterministic per-account intensity so the fraud class is a spectrum (partial fabrication),
  // which overlaps the genuine class and yields a believable AUC < 1 rather than 1.0.
  let iseed = 98765;
  const irand = () => ((iseed = (iseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const [, raw] of byAccount) {
    if (used >= MAX_ACCOUNTS) break;
    if (raw.length < MIN_TXNS) continue;
    raw.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    const window = raw.slice(-WINDOW);

    // Genuine accounts get a realistic *spread* of provenance: some real users enter much of
    // their data manually. Without this spread, provenance alone trivially separates the classes.
    const manualProb = irand() * 0.55;
    const genuine: ConfidenceTxn[] = window.map((r, i) => ({
      amount: r.amount,
      source: irand() < manualProb ? 'manual' : i % 5 === 0 ? 'imported' : 'extracted',
      merchantKey: r.ksym,
      date: r.day,
    }));

    // Fabrication intensity spans ~0..0.9: light fabrication is near-indistinguishable from
    // genuine (the unavoidable overlap that makes AUC realistic), heavy fabrication is obvious.
    const intensity = irand() * 0.9;
    rows.push({ features: toFeatureVector(extractFraudFeatures(genuine)), label: 0 });
    rows.push({
      features: toFeatureVector(extractFraudFeatures(perturbTransactions(genuine, { intensity, seed: used + 1 }))),
      label: 1,
    });
    used++;
  }

  // Deterministic shuffle (so train/test split isn't class-ordered).
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(rows));
  console.log(`Wrote ${rows.length} rows (${used} genuine + ${used} fraud) → ${OUTPUT}`);
}

main();
