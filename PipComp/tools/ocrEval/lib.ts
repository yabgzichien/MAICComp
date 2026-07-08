// tools/ocrEval/lib.ts
// Pure scoring core for the OCR extraction-accuracy eval. No I/O, no network —
// run.ts produces extractions, score.ts feeds them here, tests exercise this
// file directly. Uses the app's own merchantKey so "merchant correct" means
// exactly what the app's learning loop means by it.

import { merchantKey } from '../../src/lib/normalize';

/** One human-labeled ground-truth row (see README.md for the label file schema). */
export interface LabelRow {
  merchant: string;
  amount: number; // positive; direction carries the sign, mirroring the app
  date: string | null; // ISO YYYY-MM-DD, or null when the screenshot shows none
  direction: 'in' | 'out';
}

/** A blank, schema-shaped label file for one screenshot (see score.ts's
 *  parseLabelFile / README.md). scaffold.ts writes one of these per unlabeled
 *  image. The single placeholder row is DELIBERATELY invalid — empty merchant,
 *  amount 0 — so a template left unfilled fails loudly in score.ts and names its
 *  own file, instead of silently scoring as a real ground-truth row. */
export function blankLabelTemplate(): { _README: string; rows: LabelRow[] } {
  return {
    _README:
      'Label EVERY visible transaction row. amount is positive (direction "in"|"out" carries the sign); ' +
      'date is "YYYY-MM-DD" or null when the screenshot shows none. Replace this placeholder and add one ' +
      'object per row. Label independently of the model output — do not copy the extraction.',
    rows: [{ merchant: '', amount: 0, date: null, direction: 'out' }],
  };
}

/** One row from the real extraction pipeline (ExtractedTxn, minus fields we don't score). */
export interface EvalExtractedRow {
  merchant: string;
  amount: number;
  date: string | null;
  type: 'income' | 'expense';
}

export interface AlignedPair {
  label: LabelRow;
  extracted: EvalExtractedRow;
  amountOk: boolean;
  dateOk: boolean;
  merchantOk: boolean;
  directionOk: boolean;
}

export interface Alignment {
  pairs: AlignedPair[];
  /** Ground-truth rows the pipeline failed to produce. */
  missed: LabelRow[];
  /** Extracted rows with no ground-truth counterpart — invented data. */
  hallucinated: EvalExtractedRow[];
}

/** Amounts are "exact after normalization": equal to the sen (2dp). */
const AMOUNT_EPS = 0.005;
const amountClose = (a: number, b: number): boolean => Math.abs(a - b) <= AMOUNT_EPS;

/** Day distance between two ISO dates; Infinity when either side is missing. */
function dateDeltaDays(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null || b === null) return Infinity;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Infinity;
  return Math.abs(ta - tb) / 86_400_000;
}

const directionOf = (t: EvalExtractedRow['type']): LabelRow['direction'] => (t === 'income' ? 'in' : 'out');

/**
 * Fuzzy bipartite alignment of extracted rows against ground truth.
 *
 * A (label, extracted) pair is ELIGIBLE to align when the amount matches to the
 * sen, OR the merchant key matches and the dates are within one day — i.e. a
 * misread amount still aligns via merchant+date, and a misread merchant still
 * aligns via amount, but rows with nothing in common never pair up (they count
 * as one missed + one hallucinated, which is the honest reading).
 *
 * Among eligible pairs, greedy assignment by descending similarity:
 * amount match 4 · same day 2 (±1 day 1) · merchant key 2 · direction 1 —
 * so an exact-day candidate always beats an adjacent-day one for the same
 * amount, and ties break on input order (stable).
 */
export function alignRows(labels: LabelRow[], extracted: EvalExtractedRow[]): Alignment {
  interface Candidate {
    li: number;
    xi: number;
    score: number;
    delta: number;
  }
  const candidates: Candidate[] = [];
  for (let li = 0; li < labels.length; li++) {
    for (let xi = 0; xi < extracted.length; xi++) {
      const l = labels[li];
      const x = extracted[xi];
      const amt = amountClose(l.amount, x.amount);
      const delta = dateDeltaDays(l.date, x.date);
      const merch = merchantKey(l.merchant) === merchantKey(x.merchant);
      const eligible = amt || (merch && delta <= 1);
      if (!eligible) continue;
      const score =
        (amt ? 4 : 0) + (delta === 0 ? 2 : delta <= 1 ? 1 : 0) + (merch ? 2 : 0) + (l.direction === directionOf(x.type) ? 1 : 0);
      candidates.push({ li, xi, score, delta });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.delta - b.delta || a.li - b.li || a.xi - b.xi);

  const labelTaken = new Set<number>();
  const extractedTaken = new Set<number>();
  const pairs: AlignedPair[] = [];
  for (const c of candidates) {
    if (labelTaken.has(c.li) || extractedTaken.has(c.xi)) continue;
    labelTaken.add(c.li);
    extractedTaken.add(c.xi);
    const l = labels[c.li];
    const x = extracted[c.xi];
    pairs.push({
      label: l,
      extracted: x,
      amountOk: amountClose(l.amount, x.amount),
      dateOk: l.date === null && x.date === null ? true : dateDeltaDays(l.date, x.date) === 0,
      merchantOk: merchantKey(l.merchant) === merchantKey(x.merchant),
      directionOk: l.direction === directionOf(x.type),
    });
  }

  return {
    pairs,
    missed: labels.filter((_, i) => !labelTaken.has(i)),
    hallucinated: extracted.filter((_, i) => !extractedTaken.has(i)),
  };
}

// ── Dataset-level scoring ─────────────────────────────────────────────────────

export interface ScreenshotResult {
  stem: string; // file stem, e.g. "maybank__aug-1"
  app: string; // stem prefix before "__", e.g. "maybank"
  labels: LabelRow[];
  extracted: EvalExtractedRow[];
}

export interface GroupStats {
  app: string;
  screenshots: number;
  labelRows: number;
  extractedRows: number;
  matched: number;
  missed: number;
  hallucinated: number;
  /** Per-field accuracy over MATCHED pairs only (0..1; 0 when nothing matched). */
  field: { amount: number; date: number; merchant: number; direction: number };
}

export interface DatasetScore {
  overall: GroupStats;
  perApp: GroupStats[];
  /** Every imperfect pairing + all missed/hallucinated rows, for failure review. */
  failures: {
    stem: string;
    kind: 'missed' | 'hallucinated' | 'field-mismatch';
    detail: string;
  }[];
}

function emptyStats(app: string): GroupStats {
  return {
    app,
    screenshots: 0,
    labelRows: 0,
    extractedRows: 0,
    matched: 0,
    missed: 0,
    hallucinated: 0,
    field: { amount: 0, date: 0, merchant: 0, direction: 0 },
  };
}

export function scoreDataset(items: ScreenshotResult[]): DatasetScore {
  const groups = new Map<string, { stats: GroupStats; fieldOk: { amount: number; date: number; merchant: number; direction: number } }>();
  const overallAcc = { stats: emptyStats('overall'), fieldOk: { amount: 0, date: 0, merchant: 0, direction: 0 } };
  const failures: DatasetScore['failures'] = [];

  for (const item of items) {
    const a = alignRows(item.labels, item.extracted);
    if (!groups.has(item.app)) {
      groups.set(item.app, { stats: emptyStats(item.app), fieldOk: { amount: 0, date: 0, merchant: 0, direction: 0 } });
    }
    for (const g of [groups.get(item.app)!, overallAcc]) {
      g.stats.screenshots += 1;
      g.stats.labelRows += item.labels.length;
      g.stats.extractedRows += item.extracted.length;
      g.stats.matched += a.pairs.length;
      g.stats.missed += a.missed.length;
      g.stats.hallucinated += a.hallucinated.length;
      for (const p of a.pairs) {
        g.fieldOk.amount += p.amountOk ? 1 : 0;
        g.fieldOk.date += p.dateOk ? 1 : 0;
        g.fieldOk.merchant += p.merchantOk ? 1 : 0;
        g.fieldOk.direction += p.directionOk ? 1 : 0;
      }
    }
    for (const m of a.missed) failures.push({ stem: item.stem, kind: 'missed', detail: `${m.merchant} · ${m.amount} · ${m.date ?? 'no date'}` });
    for (const h of a.hallucinated)
      failures.push({ stem: item.stem, kind: 'hallucinated', detail: `${h.merchant} · ${h.amount} · ${h.date ?? 'no date'}` });
    for (const p of a.pairs) {
      const bad: string[] = [];
      if (!p.amountOk) bad.push(`amount ${p.label.amount}→${p.extracted.amount}`);
      if (!p.dateOk) bad.push(`date ${p.label.date ?? 'null'}→${p.extracted.date ?? 'null'}`);
      if (!p.merchantOk) bad.push(`merchant "${p.label.merchant}"→"${p.extracted.merchant}"`);
      if (!p.directionOk) bad.push(`direction ${p.label.direction}→${directionOf(p.extracted.type)}`);
      if (bad.length > 0) failures.push({ stem: item.stem, kind: 'field-mismatch', detail: bad.join('; ') });
    }
  }

  const finalize = (g: { stats: GroupStats; fieldOk: { amount: number; date: number; merchant: number; direction: number } }): GroupStats => ({
    ...g.stats,
    field: {
      amount: g.stats.matched > 0 ? g.fieldOk.amount / g.stats.matched : 0,
      date: g.stats.matched > 0 ? g.fieldOk.date / g.stats.matched : 0,
      merchant: g.stats.matched > 0 ? g.fieldOk.merchant / g.stats.matched : 0,
      direction: g.stats.matched > 0 ? g.fieldOk.direction / g.stats.matched : 0,
    },
  });

  return {
    overall: finalize(overallAcc),
    perApp: [...groups.values()].map(finalize).sort((x, y) => x.app.localeCompare(y.app)),
    failures,
  };
}

// ── METRICS.md renderer (house style: fraudModel/METRICS.md) ─────────────────

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function renderMetricsMd(
  score: DatasetScore,
  meta: { model: string; generatedAt: string; screenshots: number }
): string {
  const o = score.overall;
  const detection = o.labelRows > 0 ? o.matched / o.labelRows : 0;
  const hallucinationRate = o.extractedRows > 0 ? o.hallucinated / o.extractedRows : 0;
  const missRate = o.labelRows > 0 ? o.missed / o.labelRows : 0;

  const lines: string[] = [];
  lines.push('# OCR Extraction — Accuracy Metrics');
  lines.push('');
  lines.push(`Generated ${meta.generatedAt} by \`tools/ocrEval/score.ts\` · model: \`${meta.model}\` · our figures.`);
  lines.push('');
  lines.push('## Results (overall)');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Screenshots evaluated | ${meta.screenshots} |`);
  lines.push(`| Ground-truth rows | ${o.labelRows} |`);
  lines.push(`| Rows detected (aligned) | ${o.matched} (${pct(detection)}) |`);
  lines.push(`| **Missed rows** (in truth, not extracted) | ${o.missed} (${pct(missRate)}) |`);
  lines.push(`| **Hallucinated rows** (extracted, not in truth) | ${o.hallucinated} (${pct(hallucinationRate)}) |`);
  lines.push('');
  lines.push('Field accuracy over aligned rows:');
  lines.push('');
  lines.push('| Field | Accuracy |');
  lines.push('|-------|----------|');
  lines.push(`| Amount (exact to the sen) | ${pct(o.field.amount)} |`);
  lines.push(`| Date (exact day) | ${pct(o.field.date)} |`);
  lines.push(`| Direction (in/out) | ${pct(o.field.direction)} |`);
  lines.push(`| Merchant (normalized key) | ${pct(o.field.merchant)} |`);
  lines.push('');
  lines.push('## Per-app breakdown');
  lines.push('');
  lines.push('| App | Shots | Truth rows | Matched | Missed | Halluc. | Amount | Date | Direction | Merchant |');
  lines.push('|-----|-------|-----------|---------|--------|---------|--------|------|-----------|----------|');
  for (const g of score.perApp) {
    lines.push(
      `| ${g.app} | ${g.screenshots} | ${g.labelRows} | ${g.matched} | ${g.missed} | ${g.hallucinated} | ` +
        `${pct(g.field.amount)} | ${pct(g.field.date)} | ${pct(g.field.direction)} | ${pct(g.field.merchant)} |`
    );
  }
  lines.push('');
  lines.push('## Dataset & method');
  lines.push('');
  lines.push(
    '**Semi-manual.** Screenshots are real Malaysian bank/e-wallet transaction views ' +
      'supplied and hand-labeled by the team (label schema in README.md); the pipeline under ' +
      'test is the exact production path — the same Groq vision adapter, prompt, and ' +
      'defensive parser the app ships (`GroqProvider.extract` → `parseExtraction`). ' +
      'Alignment is fuzzy bipartite matching (amount to the sen, OR merchant key + date ' +
      'within one day); field accuracy is measured over aligned rows, while missed and ' +
      'hallucinated rows are reported separately — those two numbers matter most.'
  );
  lines.push('');
  lines.push('## Known failure modes');
  lines.push('');
  lines.push('See `dataset/out/failures.json` (kept out of git — may reference real merchants) for the itemized list.');
  lines.push('');
  lines.push('## Mitigations in the product');
  lines.push('');
  lines.push(
    'Every extraction lands on a review screen where the user corrects rows before saving, ' +
      'and provenance weighting means screenshot-derived data never carries verified-source ' +
      'trust. Prompts are **not tuned** against this eval set — an eval you tuned against is not an eval.'
  );
  lines.push('');
  return lines.join('\n');
}
