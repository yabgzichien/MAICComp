// tools/ocrEval/run.ts
// Step 2 of the OCR eval: feed every screenshot in dataset/images/ through the
// REAL production extraction path — the same Groq vision adapter, prompt, and
// defensive parser the app ships (GroqProvider.extract → parseExtraction) —
// and save the raw structured rows for scoring. Scoring itself is offline and
// re-runnable (score.ts); this script is the only step that spends API calls.
//
// Run:  npx tsx tools/ocrEval/run.ts [--force]
// Key:  GROQ_API_KEY or EXPO_PUBLIC_GROQ_API_KEY env var, or .env.local.
// Pace: sequential, OCR_EVAL_DELAY_MS between calls (default 3000ms — Groq's
//       free tier is generous per-minute but vision calls are heavy; 3s keeps
//       a 50-image run comfortably under limits). One retry on rate-limit
//       after a 20s backoff.

import * as fs from 'fs';
import * as path from 'path';
import { GroqProvider } from '../../src/llm/groq';
import { LLMError } from '../../src/llm/types';

const ROOT = path.join(__dirname);
const IMAGES_DIR = path.join(ROOT, 'dataset', 'images');
const OUT_DIR = path.join(ROOT, 'dataset', 'out', 'extractions');

const DELAY_MS = Number(process.env.OCR_EVAL_DELAY_MS ?? 3000);
const FORCE = process.argv.includes('--force');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function readEnvLocalKey(): string {
  const envPath = path.join(__dirname, '../../.env.local');
  if (!fs.existsSync(envPath)) return '';
  const m = fs.readFileSync(envPath, 'utf8').match(/EXPO_PUBLIC_GROQ_API_KEY\s*=\s*["']?([^\s"']+)/);
  return m ? m[1] : '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY || process.env.EXPO_PUBLIC_GROQ_API_KEY || readEnvLocalKey();
  if (!apiKey) {
    console.error('No API key. Set GROQ_API_KEY (or EXPO_PUBLIC_GROQ_API_KEY / .env.local).');
    process.exit(1);
  }
  const model = process.env.OCR_EVAL_MODEL || GroqProvider.defaultModel;

  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`No images folder. Create ${IMAGES_DIR} and add screenshots named <app>__<name>.png`);
    process.exit(1);
  }
  const images = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => MIME[path.extname(f).toLowerCase()] !== undefined)
    .sort();
  if (images.length === 0) {
    console.error(`No images found in ${IMAGES_DIR} (png/jpg/jpeg/webp).`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`OCR eval runner — ${images.length} image(s), model ${model}, ${DELAY_MS}ms pacing.`);
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of images) {
    const stem = path.basename(file, path.extname(file));
    const outFile = path.join(OUT_DIR, `${stem}.json`);
    if (!FORCE && fs.existsSync(outFile)) {
      skipped++;
      continue;
    }

    const imageBase64 = fs.readFileSync(path.join(IMAGES_DIR, file)).toString('base64');
    const mimeType = MIME[path.extname(file).toLowerCase()];

    let rows;
    try {
      rows = await GroqProvider.extract({ apiKey, model, imageBase64, mimeType });
    } catch (e) {
      if (e instanceof LLMError && e.code === 'rate_limit') {
        console.warn(`  ${stem}: rate-limited — backing off 20s and retrying once…`);
        await sleep(20_000);
        try {
          rows = await GroqProvider.extract({ apiKey, model, imageBase64, mimeType });
        } catch (e2) {
          console.error(`  ${stem}: FAILED after retry — ${e2 instanceof Error ? e2.message : e2}`);
          failed++;
          continue;
        }
      } else {
        console.error(`  ${stem}: FAILED — ${e instanceof Error ? e.message : e}`);
        failed++;
        continue;
      }
    }

    fs.writeFileSync(
      outFile,
      JSON.stringify(
        { stem, app: stem.split('__')[0] || 'unknown', model, extractedAt: new Date().toISOString(), rows },
        null,
        2
      )
    );
    done++;
    console.log(`  ${stem}: ${rows.length} row(s) extracted.`);
    await sleep(DELAY_MS);
  }

  console.log(`Done. ${done} extracted, ${skipped} skipped (already present — use --force to redo), ${failed} failed.`);
  console.log('Next: npx tsx tools/ocrEval/score.ts');
}

main();
