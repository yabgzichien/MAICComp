import { perturbTransactions } from '../tools/fraudRealData/perturb';
import { extractFraudFeatures } from '../src/lib/fraudFeatures';
import type { ConfidenceTxn } from '../src/lib/dataConfidence';

// A realistic *genuine* account: varied non-round amounts, diverse merchants, irregular timing.
function genuine(): ConfidenceTxn[] {
  const merchants = ['grab', 'tealive', 'shopee', 'shell', '99speedmart', 'tng', 'kfc', 'watsons', 'aeon', 'mrdiy'];
  const out: ConfidenceTxn[] = [];
  const d = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 50; i++) {
    d.setUTCDate(d.getUTCDate() + (1 + ((i * 7) % 9))); // irregular gaps
    out.push({
      amount: 12 + ((i * 13.37) % 480) + (i % 5) * 0.37, // varied, non-round
      source: i % 4 === 0 ? 'imported' : 'extracted',
      merchantKey: merchants[i % merchants.length],
      date: d.toISOString().slice(0, 10),
    });
  }
  return out;
}

describe('perturbTransactions', () => {
  it('keeps the same number of rows', () => {
    const g = genuine();
    expect(perturbTransactions(g)).toHaveLength(g.length);
  });

  it('empty input → empty output', () => {
    expect(perturbTransactions([])).toEqual([]);
  });

  it('moves the 9 features in the fabricated direction vs the real account', () => {
    const g = genuine();
    const gf = extractFraudFeatures(g);
    const pf = extractFraudFeatures(perturbTransactions(g));

    expect(pf.round_ratio).toBeGreaterThan(gf.round_ratio);       // round-number padding
    expect(pf.provenance_trust).toBeLessThan(gf.provenance_trust); // manual source
    expect(pf.merchant_entropy).toBeLessThan(gf.merchant_entropy); // collapsed merchants
    expect(pf.gap_variance).toBeLessThanOrEqual(gf.gap_variance);   // regular timing
    expect(pf.duplicate_ratio).toBeGreaterThanOrEqual(gf.duplicate_ratio);
  });
});
