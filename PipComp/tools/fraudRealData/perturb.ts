// tools/fraudRealData/perturb.ts
// Turn a real account's transaction list into a *fabricated* one by applying the manipulations
// the fraud layer defends against. Used to build the adversarial (fraud) class from real records.
//
// The manipulations are applied PROBABILISTICALLY at a given `intensity`, because real
// fabrication is partial and uneven — that variety is what makes the fraud class overlap the
// genuine class (a believable AUC < 1) instead of being a clean separating block.
//
// Pure + unit-tested. At the default intensity 1 every manipulation is fully applied (the
// strongest, most-separable case), which is what the directional unit test checks.
import type { ConfidenceTxn } from '../../src/lib/dataConfidence';
import type { TxnSource } from '../../src/lib/types';

function addDays(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** mulberry32 — small deterministic PRNG so dataset building is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PerturbOptions {
  /** 0..1 — probability each manipulation is applied per transaction. Default 1 (full). */
  intensity?: number;
  /** PRNG seed for reproducibility. */
  seed?: number;
}

/**
 * Fabricate from real transactions. Each manipulation fires per-transaction with probability
 * `intensity`:
 * - round amounts to RM100 (round-number padding → round_ratio up, Benford down)
 * - manual provenance (self-reported → provenance_trust down)
 * - collapse merchants to a tiny set (low merchant_entropy, more duplicate-looking rows)
 * - regularise timing to even 3-day spacing (gap_variance down)
 */
export function perturbTransactions(txns: ConfidenceTxn[], opts: PerturbOptions = {}): ConfidenceTxn[] {
  if (txns.length === 0) return [];
  const intensity = opts.intensity ?? 1;
  const rng = mulberry32(opts.seed ?? 1);
  const first = txns[0].date && /^\d{4}-\d{2}-\d{2}/.test(txns[0].date) ? txns[0].date.slice(0, 10) : '2026-01-01';
  const merchants = ['acct-self', 'cash-topup', 'misc'];

  return txns.map((t, i) => {
    const round = rng() < intensity;
    const manual = rng() < intensity;
    const collapse = rng() < intensity;
    const regular = rng() < intensity;
    return {
      amount: round ? Math.max(50, Math.round(Math.abs(t.amount) / 100) * 100) : t.amount,
      source: manual ? ('manual' as TxnSource) : (t.source ?? 'extracted'),
      merchantKey: collapse ? merchants[i % merchants.length] : t.merchantKey,
      date: regular ? addDays(first, i * 3) : t.date,
    };
  });
}
