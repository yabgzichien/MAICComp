/**
 * TDD: Tests for tools/ocrEval/lib.ts  the pure scoring core of the OCR
 * extraction-accuracy eval (Brief F). Alignment is fuzzy bipartite matching
 * (amount + date proximity + merchant key); everything here is deterministic.
 */

import {
  alignRows,
  blankLabelTemplate,
  scoreDataset,
  renderMetricsMd,
  type EvalExtractedRow,
  type LabelRow,
  type ScreenshotResult,
} from '../tools/ocrEval/lib';

const L = (merchant: string, amount: number, date: string | null, direction: 'in' | 'out' = 'out'): LabelRow => ({
  merchant,
  amount,
  date,
  direction,
});

const X = (
  merchant: string,
  amount: number,
  date: string | null,
  type: 'income' | 'expense' = 'expense'
): EvalExtractedRow => ({ merchant, amount, date, type });

describe('alignRows', () => {
  it('matches a perfect row on every field', () => {
    const r = alignRows([L('GrabFood MY', 12.5, '2026-08-02')], [X('GRABFOOD MY', 12.5, '2026-08-02')]);
    expect(r.pairs).toHaveLength(1);
    expect(r.missed).toHaveLength(0);
    expect(r.hallucinated).toHaveLength(0);
    const p = r.pairs[0];
    expect(p.amountOk).toBe(true);
    expect(p.dateOk).toBe(true);
    expect(p.merchantOk).toBe(true); // merchantKey: case-insensitive
    expect(p.directionOk).toBe(true);
  });

  it('treats 12.5 and 12.50 as the same amount, 12.6 as different', () => {
    const same = alignRows([L('A', 12.5, null)], [X('A', 12.5, null)]);
    expect(same.pairs[0].amountOk).toBe(true);
    // 12.6 with same merchant + both dates null (delta 0) is still alignable,
    // but the amount field scores as wrong.
    const near = alignRows([L('A', 12.5, '2026-01-01')], [X('A', 12.6, '2026-01-01')]);
    expect(near.pairs).toHaveLength(1);
    expect(near.pairs[0].amountOk).toBe(false);
  });

  it('counts an extra extracted row as hallucinated', () => {
    const r = alignRows([L('A', 10, '2026-01-01')], [X('A', 10, '2026-01-01'), X('Ghost Cafe', 55, '2026-01-02')]);
    expect(r.pairs).toHaveLength(1);
    expect(r.hallucinated).toHaveLength(1);
    expect(r.hallucinated[0].merchant).toBe('Ghost Cafe');
  });

  it('counts an unextracted label row as missed', () => {
    const r = alignRows([L('A', 10, '2026-01-01'), L('Missed Stall', 7.2, '2026-01-03')], [X('A', 10, '2026-01-01')]);
    expect(r.pairs).toHaveLength(1);
    expect(r.missed).toHaveLength(1);
    expect(r.missed[0].merchant).toBe('Missed Stall');
  });

  it('prefers the same-day candidate when two rows share an amount', () => {
    const labels = [L('A', 20, '2026-03-05'), L('A', 20, '2026-03-06')];
    const extracted = [X('A', 20, '2026-03-06')];
    const r = alignRows(labels, extracted);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].label.date).toBe('2026-03-06');
    expect(r.pairs[0].dateOk).toBe(true);
    expect(r.missed[0].date).toBe('2026-03-05');
  });

  it('aligns on merchant + adjacent date even when the amount was misread', () => {
    const r = alignRows([L('Shopee', 89.9, '2026-08-07')], [X('SHOPEE', 88.9, '2026-08-08')]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].amountOk).toBe(false);
    expect(r.pairs[0].dateOk).toBe(false);
    expect(r.pairs[0].merchantOk).toBe(true);
  });

  it('does not align rows with nothing in common', () => {
    const r = alignRows([L('Petron', 60, '2026-08-09')], [X('Netflix', 45.9, '2026-08-01')]);
    expect(r.pairs).toHaveLength(0);
    expect(r.missed).toHaveLength(1);
    expect(r.hallucinated).toHaveLength(1);
  });

  it('scores dates: null ground truth expects null extraction', () => {
    const bothNull = alignRows([L('A', 5, null)], [X('A', 5, null)]);
    expect(bothNull.pairs[0].dateOk).toBe(true);
    const invented = alignRows([L('A', 5, null)], [X('A', 5, '2026-01-01')]);
    expect(invented.pairs[0].dateOk).toBe(false);
  });

  it('flags a direction mismatch (income read as expense)', () => {
    const r = alignRows([L('Salary Credit', 3200, '2026-08-03', 'in')], [X('Salary Credit', 3200, '2026-08-03', 'expense')]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].directionOk).toBe(false);
  });
});

describe('scoreDataset + renderMetricsMd', () => {
  const items: ScreenshotResult[] = [
    {
      stem: 'maybank__aug',
      app: 'maybank',
      labels: [L('GrabFood MY', 12.5, '2026-08-02'), L('Salary Credit', 3200, '2026-08-03', 'in')],
      extracted: [X('GRABFOOD MY', 12.5, '2026-08-02'), X('Salary Credit', 3200, '2026-08-03', 'income')],
    },
    {
      stem: 'tng__wallet',
      app: 'tng',
      labels: [L('TNG Reload', 50, '2026-08-05'), L('Kedai Runcit', 8.4, '2026-08-05')],
      extracted: [X('TNG Reload', 50, '2026-08-05'), X('Phantom Row', 99, null)],
    },
  ];

  it('aggregates matched / missed / hallucinated and per-field accuracy', () => {
    const s = scoreDataset(items);
    expect(s.overall.labelRows).toBe(4);
    expect(s.overall.extractedRows).toBe(4);
    expect(s.overall.matched).toBe(3);
    expect(s.overall.missed).toBe(1);
    expect(s.overall.hallucinated).toBe(1);
    expect(s.overall.field.amount).toBe(1); // 3/3 matched amounts correct
    expect(s.overall.field.direction).toBe(1);
    expect(s.perApp.map((a) => a.app).sort()).toEqual(['maybank', 'tng']);
    const tng = s.perApp.find((a) => a.app === 'tng')!;
    expect(tng.matched).toBe(1);
    expect(tng.missed).toBe(1);
    expect(tng.hallucinated).toBe(1);
  });

  it('renders a METRICS.md with the load-bearing numbers', () => {
    const s = scoreDataset(items);
    const md = renderMetricsMd(s, { model: 'test-model', generatedAt: '2026-07-05', screenshots: 2 });
    expect(md).toContain('# OCR Extraction');
    expect(md).toContain('Hallucinated rows');
    expect(md).toContain('Missed rows');
    expect(md).toContain('maybank');
    expect(md).toContain('tng');
    expect(md).toContain('our figures');
    expect(md).toContain('not tuned');
  });

  it('handles the empty dataset without dividing by zero', () => {
    const s = scoreDataset([]);
    expect(s.overall.matched).toBe(0);
    expect(s.overall.field.amount).toBe(0);
    expect(() => renderMetricsMd(s, { model: 'm', generatedAt: 'd', screenshots: 0 })).not.toThrow();
  });
});

describe('blankLabelTemplate (labeling scaffold)', () => {
  it('is schema-shaped: a rows array with one placeholder row and a guidance note', () => {
    const t = blankLabelTemplate();
    expect(typeof t._README).toBe('string');
    expect(t._README.length).toBeGreaterThan(0);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toEqual({ merchant: '', amount: 0, date: null, direction: 'out' });
  });

  it('placeholder row is intentionally invalid, so an unfilled template fails scoring loudly rather than counting as real ground truth', () => {
    const r = blankLabelTemplate().rows[0];
    // score.ts's parseLabelFile requires a non-empty merchant AND amount > 0.
    expect(r.merchant.length === 0 || r.amount <= 0).toBe(true);
  });
});
