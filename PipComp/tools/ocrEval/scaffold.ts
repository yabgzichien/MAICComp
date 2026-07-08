// tools/ocrEval/scaffold.ts
// Optional aid for step 1 of the OCR eval (see README.md). Scans dataset/images/
// and writes a blank, schema-shaped label template into dataset/labels/ for every
// screenshot that doesn't already have one — so hand-labeling is filling blanks,
// not remembering the schema. NEVER overwrites an existing label file, so your
// work is safe to re-run against. Offline, spends no API calls.
//
// Run: npx tsx tools/ocrEval/scaffold.ts
// Then: fill in each dataset/labels/*.json, then run.ts → score.ts.

import * as fs from 'fs';
import * as path from 'path';
import { blankLabelTemplate } from './lib';

const ROOT = path.join(__dirname);
const IMAGES_DIR = path.join(ROOT, 'dataset', 'images');
const LABELS_DIR = path.join(ROOT, 'dataset', 'labels');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function main(): void {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`No images folder. Create ${IMAGES_DIR} and add screenshots named <app>__<name>.png first.`);
    process.exit(1);
  }
  const images = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort();
  if (images.length === 0) {
    console.error(`No images in ${IMAGES_DIR} (png/jpg/jpeg/webp). Add screenshots first.`);
    process.exit(1);
  }
  fs.mkdirSync(LABELS_DIR, { recursive: true });

  let created = 0;
  let skipped = 0;
  for (const file of images) {
    const stem = path.basename(file, path.extname(file));
    const labelPath = path.join(LABELS_DIR, `${stem}.json`);
    if (fs.existsSync(labelPath)) {
      skipped++;
      continue;
    }
    fs.writeFileSync(labelPath, JSON.stringify(blankLabelTemplate(), null, 2) + '\n');
    created++;
    console.log(`  ${stem}.json — template created`);
  }

  console.log(`Done. ${created} template(s) created, ${skipped} already labeled (left untouched).`);
  if (created > 0) console.log('Next: fill in each dataset/labels/*.json, then npx tsx tools/ocrEval/run.ts');
}

main();
