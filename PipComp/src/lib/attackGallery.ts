// src/lib/attackGallery.ts
// Adversarial "Attack Gallery"  a curated corpus of known fraud techniques run *deterministically*
// through the Phase-11 integrity rings + ML fraud model + loan engine, with a pass/fail verdict per
// attack. This is the honest "we tried to break our own system" beat: a fixed corpus (reliable on
// stage) rather than an open-ended adversarial loop, and it will honestly report anything that slips
// through. The LLM only narrates the already-computed result (see src/llm/attackPrompt.ts).
//
// No UI/DB imports  pure and unit-tested.
import { computeDataConfidence, assessIncomeIntegrity, type ConfidenceTxn } from './dataConfidence';
import { decideLoan, DEFAULT_PRODUCTS, type Decision } from './loans';

export type AttackVerdict = 'caught' | 'flagged' | 'missed';

export interface AttackDef {
  id: string;
  name: string;
  /** Plain-English description of the fraud technique this attack uses. */
  technique: string;
  build: () => ConfidenceTxn[];
}

export interface AttackResult {
  id: string;
  name: string;
  technique: string;
  txnCount: number;
  confidence: number;
  hardCapped: boolean;
  floorBreached: boolean;
  decision: Decision;
  /** Human-readable signals (integrity rings / ML / heuristics) that fired against the attack. */
  firedSignals: string[];
  verdict: AttackVerdict;
}

// ── Shared building blocks (mirror the Phase-11 integrity-ring fixtures) ───────

/** 60 genuine, varied, non-round expense rows from real merchants. */
function genuineExpenses(): ConfidenceTxn[] {
  return Array.from({ length: 60 }, (_, i) => ({
    amount: 18 + i * 1.37,
    source: 'extracted' as const,
    merchantKey: `k${i}`,
    merchantRaw: `Kedai ${i}`,
    date: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
    type: 'expense' as const,
  }));
}

/** Six genuine monthly salary rows from a registered employer (extracted). */
function genuineIncome(): ConfidenceTxn[] {
  return [1450, 1500, 1550, 1480, 1520, 1510].map((amount, i) => ({
    amount,
    source: 'extracted' as const,
    merchantKey: 'acme',
    merchantRaw: 'ACME SDN BHD',
    date: `2026-0${(i % 6) + 1}-28`,
    type: 'income' as const,
  }));
}

// ── The attack corpus ─────────────────────────────────────────────────────────

export const ATTACKS: AttackDef[] = [
  {
    id: 'injected-salary',
    name: 'Injected salary spike',
    technique:
      'Keep 90% genuine rows, then inject two large "salary" deposits from an undocumented P2P transfer to fake a higher income. The classic asymmetric attack: it barely moves any global aggregate.',
    build: () => [
      ...genuineExpenses(),
      ...genuineIncome(),
      ...[9000, 9500].map((amount, i) => ({
        amount,
        source: 'manual' as const,
        merchantKey: 'p2p',
        merchantRaw: 'DUITNOW TRANSFER',
        date: `2026-0${i + 1}-15`,
        type: 'income' as const,
      })),
    ],
  },
  {
    id: 'all-p2p-income',
    name: 'All-P2P income',
    technique:
      'Present every income row as an anonymous DuitNow transfer from friends. No verifiable commercial payer behind any ringgit of the claimed income.',
    build: () => [
      ...genuineExpenses(),
      ...[2000, 2100, 1950, 2050, 2000, 2100].map((amount, i) => ({
        amount,
        source: 'manual' as const,
        merchantKey: 'p2p',
        merchantRaw: 'DUITNOW TRANSFER',
        date: `2026-0${(i % 6) + 1}-14`,
        type: 'income' as const,
      })),
    ],
  },
  {
    id: 'round-number-fabrication',
    name: 'Round-number fabrication',
    technique:
      'Hand-type a tidy set of round-number transactions (RM500, RM1,000, RM2,000). Fabricated data clusters on round figures and violates Benford’s Law.',
    build: () => {
      const income = [2000, 2000, 2000, 2000, 2000, 2000].map((amount, i) => ({
        amount,
        source: 'manual' as const,
        merchantKey: 'p2p',
        merchantRaw: 'TRANSFER FROM',
        date: `2026-0${(i % 6) + 1}-10`,
        type: 'income' as const,
      }));
      const expenses = Array.from({ length: 40 }, (_, i) => ({
        amount: [100, 200, 300, 500, 1000][i % 5],
        source: 'manual' as const,
        merchantKey: `r${i}`,
        merchantRaw: `Cash ${i}`,
        date: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
        type: 'expense' as const,
      }));
      return [...income, ...expenses];
    },
  },
  {
    id: 'income-only',
    name: 'Income-only curated statement',
    technique:
      'Upload only the income side of the ledger and hide all spending, to look like a high earner with no outgoings. An implausible picture the plausibility check catches.',
    build: () => [
      ...genuineIncome(),
      ...[2600, 2700, 2550].map((amount, i) => ({
        amount,
        source: 'extracted' as const,
        merchantKey: 'acme',
        merchantRaw: 'ACME SDN BHD',
        date: `2026-0${i + 1}-27`,
        type: 'income' as const,
      })),
    ],
  },
  {
    id: 'balance-break',
    name: 'Ledger balance break',
    technique:
      'Paste a fake salary row into a running-balance statement without recomputing the surrounding balances. The running balance no longer reconciles across the injected income row.',
    build: () => [
      { amount: 1000, source: 'extracted', type: 'income', date: '2026-01-01', balance: 1000, merchantRaw: 'ACME SDN BHD' },
      { amount: 100, source: 'extracted', type: 'expense', date: '2026-01-02', balance: 900, merchantRaw: 'Kedai 1' },
      { amount: 5000, source: 'extracted', type: 'income', date: '2026-01-03', balance: 2000, merchantRaw: 'ACME SDN BHD' }, // 900 + 5000 ≠ 2000
      { amount: 200, source: 'extracted', type: 'expense', date: '2026-01-04', balance: 1800, merchantRaw: 'Kedai 2' },
    ],
  },
  {
    id: 'source-isolation',
    name: 'Source-isolation gap',
    technique:
      'Authentically capture the cheap-to-prove expenses (extracted) but hand-type the valuable income (manual). The valuable side leans entirely on the weakest, least-verifiable pipeline.',
    build: () => [
      ...genuineExpenses(),
      ...[1500, 1550, 1480, 1520, 1510, 1490].map((amount, i) => ({
        amount,
        source: 'manual' as const,
        merchantKey: 'acme',
        merchantRaw: 'ACME SDN BHD',
        date: `2026-0${(i % 6) + 1}-28`,
        type: 'income' as const,
      })),
    ],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

// The favourable profile the fraudster is *trying* to fake  a clean Good-band applicant with
// enough surplus that affordability would clear. Coverage is set to full so the ONLY thing that can
// stop the fraud is the data-integrity layer: this isolates and demonstrates the Phase-11 rings.
const PROBE_SCORE = 690;
const PROBE_BAND = 'Good' as const;
const PROBE_AVG_INCOME = 5000;
const PROBE_AVG_SURPLUS = 2000;
const PROBE_REQUEST = 5000;

function classify(decision: Decision, confidence: number): AttackVerdict {
  if (decision === 'decline' || decision === 'refer') return 'caught'; // blocked or forced to a human
  return confidence < 0.65 ? 'flagged' : 'missed';
}

/** Run one attack through the real integrity + fraud + loan engines and classify the outcome. */
export function runAttack(attack: AttackDef): AttackResult {
  const txns = attack.build();
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const expenseRatio = income > 0 ? Math.min(expense / income, 1) : 1;

  const dc = computeDataConfidence(txns, 1, expenseRatio);
  const integrity = assessIncomeIntegrity(txns);

  const loan = decideLoan({
    score: PROBE_SCORE,
    band: PROBE_BAND,
    confidence: dc.confidence,
    avgMonthlySurplus: PROBE_AVG_SURPLUS,
    monthlyDebtService: 0,
    avgIncome: PROBE_AVG_INCOME,
    requestedAmount: PROBE_REQUEST,
    products: DEFAULT_PRODUCTS,
    coverageRatio: 1,
    coverageDaysCovered: 90,
    integrityFloorBreached: dc.integrityFloorBreached,
  });

  return {
    id: attack.id,
    name: attack.name,
    technique: attack.technique,
    txnCount: txns.length,
    confidence: dc.confidence,
    hardCapped: integrity.hardCap,
    floorBreached: !!dc.integrityFloorBreached,
    decision: loan.decision,
    firedSignals: dc.reasons.filter((r) => !r.ok).map((r) => r.detail),
    verdict: classify(loan.decision, dc.confidence),
  };
}

export function runGallery(): AttackResult[] {
  return ATTACKS.map(runAttack);
}
