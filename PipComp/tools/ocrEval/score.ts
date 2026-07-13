// tools/ocrEval/score.ts
// Step 3 of the OCR eval: align saved extractions against hand-written labels,
// compute field-level accuracy + missed/hallucinated counts, and regenerate
// tools/ocrEval/METRICS.md. Offline and idempotent  re-run freely.
//
// Run: npx tsx tools/ocrEval/score.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  scoreDataset,
  renderMetricsMd,
  type EvalExtractedRow,
  type LabelRow,
  type ScreenshotResult,
} from './lib';

const ROOT = path.join(__dirname);
const LABELS_DIR = path.join(ROOT, 'dataset', 'labels');
const EXTRACTIONS_DIR = path.join(ROOT, 'dataset', 'out', 'extractions');
const OUT_DIR = path.join(ROOT, 'dataset', 'out');
const METRICS_PATH = path.join(ROOT, 'METRICS.md');

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Read + parse JSON, stripping a UTF-8 BOM (charCode 0xFEFF)  Windows editors
 *  add one and JSON.parse rejects it; hand-written label files must survive that. */
function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
}

/** Defensive label parsing  a typo'd label file should name itself, not crash the run. */
function parseLabelFile(raw: unknown, file: string): LabelRow[] {
  const rows = (raw as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) throw new Error(`${file}: expected { "rows": [...] }`);
  return rows.map((r, i) => {
    const o = r as Record<string, unknown>;
    if (typeof o.merchant !== 'string' || o.merchant.length === 0) throw new Error(`${file} row ${i}: merchant`);
    if (!isFiniteNum(o.amount) || o.amount <= 0) throw new Error(`${file} row ${i}: amount must be a positive number`);
    if (o.date !== null && (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)))
      throw new Error(`${file} row ${i}: date must be "YYYY-MM-DD" or null`);
    if (o.direction !== 'in' && o.direction !== 'out') throw new Error(`${file} row ${i}: direction must be "in" or "out"`);
    return { merchant: o.merchant, amount: o.amount, date: o.date as string | null, direction: o.direction };
  });
}

function main(): void {
  if (!fs.existsSync(LABELS_DIR)) {
    console.error(`No labels folder. Create ${LABELS_DIR}  one <stem>.json per screenshot (schema in README.md).`);
    process.exit(1);
  }
  if (!fs.existsSync(EXTRACTIONS_DIR)) {
    console.error('No extractions yet. Run: npx tsx tools/ocrEval/run.ts');
    process.exit(1);
  }

  const labelFiles = fs.readdirSync(LABELS_DIR).filter((f) => f.endsWith('.json'));
  const items: ScreenshotResult[] = [];
  const models = new Map<string, number>();
  let unmatchedExtractions = fs.readdirSync(EXTRACTIONS_DIR).filter((f) => f.endsWith('.json')).length;

  for (const file of labelFiles) {
    const stem = path.basename(file, '.json');
    const extractionPath = path.join(EXTRACTIONS_DIR, `${stem}.json`);
    if (!fs.existsSync(extractionPath)) {
      console.warn(`  ${stem}: labeled but not extracted yet  skipping (run run.ts).`);
      continue;
    }
    unmatchedExtractions--;
    const labels = parseLabelFile(readJson(path.join(LABELS_DIR, file)), file);
    const extraction = readJson(extractionPath) as {
      app?: string;
      model?: string;
      rows: { merchant: string; amount: number; date: string | null; type: 'income' | 'expense' }[];
    };
    if (extraction.model) models.set(extraction.model, (models.get(extraction.model) ?? 0) + 1);
    const extracted: EvalExtractedRow[] = extraction.rows.map((r) => ({
      merchant: r.merchant,
      amount: r.amount,
      date: r.date,
      type: r.type,
    }));
    items.push({ stem, app: extraction.app || stem.split('__')[0] || 'unknown', labels, extracted });
  }

  if (unmatchedExtractions > 0)
    console.warn(`  Note: ${unmatchedExtractions} extraction(s) have no label file  not scored.`);
  if (items.length === 0) {
    console.error('Nothing to score: no screenshot has BOTH a label file and an extraction.');
    process.exit(1);
  }

  const score = scoreDataset(items);
  const model =
    models.size === 0
      ? 'unknown'
      : models.size === 1
        ? [...models.keys()][0]
        : `mixed (${[...models.entries()].map(([m, n]) => `${m}×${n}`).join(', ')})`;
  const metrics = renderMetricsMd(score, {
    model,
    generatedAt: new Date().toISOString().slice(0, 10),
    screenshots: items.length,
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(score, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'failures.json'), JSON.stringify(score.failures, null, 2));
  fs.writeFileSync(METRICS_PATH, metrics);

  const o = score.overall;
  console.log(`Scored ${items.length} screenshot(s): ${o.matched}/${o.labelRows} rows aligned, ` +
    `${o.missed} missed, ${o.hallucinated} hallucinated.`);
  console.log(`Field accuracy  amount ${(o.field.amount * 100).toFixed(1)}% · date ${(o.field.date * 100).toFixed(1)}% · ` +
    `direction ${(o.field.direction * 100).toFixed(1)}% · merchant ${(o.field.merchant * 100).toFixed(1)}%`);
  console.log(`Written: METRICS.md · dataset/out/results.json · dataset/out/failures.json`);
}

main();
