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

/** One check that fired, carrying both the engine's stable key (so the UI can name the check in
 *  plain English) and the engine's own computed detail string (so nothing is paraphrased away). */
export interface AttackSignal {
  key: string;
  detail: string;
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
  /** Checks (integrity rings / ML / heuristics) that fired against the attack. */
  signals: AttackSignal[];
  verdict: AttackVerdict;
  /** A sample of the actual rows the attack smuggled in, so the demo can show the payload rather
   *  than only describing it. Derived from the built ledger  never asserts a verdict. */
  payload: AttackPayload;
}

// ── Naming the checks ─────────────────────────────────────────────────────────
// The engine's reason strings are written for an operator ("source trust 69%"). A judge reading
// the gallery needs to know WHICH defence spoke before they can weigh what it said, so each
// stable reason key gets a plain-English name. The engine's own detail is always shown beneath
// it — this labels the checks, it never restates their findings.

const SIGNAL_LABELS: Record<string, string> = {
  provenance: 'Where the data came from',
  plausibility: 'Whether the picture hangs together',
  coverage: 'How much history there is',
  benford: 'Natural spread of the digits',
  round_numbers: 'Suspiciously round amounts',
  duplicates: 'Repeated rows',
  integrity_balance: 'Running balance reconciles',
  integrity_income_outlier: 'Income that sits outside the pattern',
  integrity_income_payer: 'Who actually paid the income',
  integrity_income_skew: 'Whether spending responded to the income',
  integrity_source_isolation: 'Income proved as well as expenses',
};

/** Plain-English name for a fired check. ML features share one label; anything unmapped falls
 *  back to a generic name rather than exposing a raw key. */
export function signalLabel(key: string): string {
  if (key.startsWith('ml_')) return 'The fraud model';
  return SIGNAL_LABELS[key] ?? 'Data-integrity check';
}

// ── Payload sampling ──────────────────────────────────────────────────────────
// The gallery describes each technique in prose; this pulls out the handful of rows a reader
// should actually look at. Pure and deterministic: one ordered rule set over the built ledger,
// no reference to the engine's verdict (a rule firing is evidence, not a conviction).

/** How many sample rows a payload carries at most. The screen shows all of them. */
export const PAYLOAD_SAMPLE_LIMIT = 4;

/** Which tell isolated these rows. 'none' when the ledger hides nothing structural. */
export type PayloadRule = 'balance-break' | 'hand-typed' | 'no-expenses' | 'none';

export interface AttackPayloadRow {
  /** Payer/merchant string as it appears in the ledger. */
  label: string;
  amount: number;
  source: ConfidenceTxn['source'];
  type: 'income' | 'expense' | 'unknown';
  date: string | null;
  /** True when this row is where the running balance stops reconciling. */
  balanceBreak: boolean;
}

export interface AttackPayload {
  rule: PayloadRule;
  /** Rows in the whole ledger matching `rule`  may exceed `rows.length`, which is sampled. */
  count: number;
  /** Up to PAYLOAD_SAMPLE_LIMIT rows, income first: the valuable side is what fraud targets. */
  rows: AttackPayloadRow[];
  /** One computed line naming what the reader is looking at. Counts only, no verdict language. */
  caption: string;
}

function toRow(t: ConfidenceTxn, balanceBreak = false): AttackPayloadRow {
  return {
    label: t.merchantRaw ?? t.merchantKey ?? '(no payer)',
    amount: t.amount,
    source: t.source,
    type: t.type === 'income' || t.type === 'expense' ? t.type : 'unknown',
    date: t.date ?? null,
    balanceBreak,
  };
}

/** Indexes of rows whose running balance does not follow from the previous row's. Rows without a
 *  balance (screenshots, manual entry) are inert, matching the reconciliation ring. */
function balanceBreakIndexes(txns: ConfidenceTxn[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < txns.length; i++) {
    const prev = txns[i - 1];
    const cur = txns[i];
    if (typeof prev.balance !== 'number' || typeof cur.balance !== 'number') continue;
    const delta = cur.type === 'expense' ? -cur.amount : cur.amount;
    if (Math.abs(prev.balance + delta - cur.balance) > 0.005) out.push(i);
  }
  return out;
}

/** Pick the rows worth showing, by the first rule that matches. */
export function buildAttackPayload(txns: ConfidenceTxn[]): AttackPayload {
  const total = txns.length;

  const breaks = balanceBreakIndexes(txns);
  if (breaks.length > 0) {
    return {
      rule: 'balance-break',
      count: breaks.length,
      rows: breaks.slice(0, PAYLOAD_SAMPLE_LIMIT).map((i) => toRow(txns[i], true)),
      caption: `${breaks.length} of ${total} rows leave the running balance unreconciled`,
    };
  }

  const manual = txns.filter((t) => t.source === 'manual');
  if (manual.length > 0) {
    const income = manual.filter((t) => t.type === 'income');
    const rest = manual.filter((t) => t.type !== 'income');
    return {
      rule: 'hand-typed',
      count: manual.length,
      rows: [...income, ...rest].slice(0, PAYLOAD_SAMPLE_LIMIT).map((t) => toRow(t)),
      caption: `${manual.length} hand-typed row${manual.length === 1 ? '' : 's'} among ${total}`,
    };
  }

  const incomeRows = txns.filter((t) => t.type === 'income');
  if (incomeRows.length > 0 && !txns.some((t) => t.type === 'expense')) {
    return {
      rule: 'no-expenses',
      count: incomeRows.length,
      rows: incomeRows.slice(0, PAYLOAD_SAMPLE_LIMIT).map((t) => toRow(t)),
      caption: `${incomeRows.length} income rows and no expense rows at all`,
    };
  }

  return { rule: 'none', count: 0, rows: [], caption: `${total} rows, nothing isolated` };
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
      'Present every income row as an anonymous DuitNow transfer from friends, so no verifiable commercial payer stands behind any ringgit of the claimed income.',
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
      'Upload only the income side of the ledger and hide all spending, to look like a high earner with no outgoings. The plausibility check catches how implausible that picture is.',
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
      'Authentically capture the cheap-to-prove expenses (extracted) but hand-type the valuable income (manual), so the side that matters leans entirely on the weakest, least-verifiable pipeline.',
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
// Exported so the screen states the setup in the same numbers the runner actually uses, rather
// than repeating them in copy that could drift.
export const PROBE = {
  score: 690,
  band: 'Good' as const,
  avgIncome: 5000,
  avgSurplus: 2000,
  request: 5000,
} as const;

function classify(decision: Decision, confidence: number): AttackVerdict {
  if (decision === 'decline' || decision === 'refer') return 'caught'; // blocked or forced to a human
  return confidence < 0.65 ? 'flagged' : 'missed';
}

/** Put one ledger through the identical probe. Shared by the attacks and the control so the
 *  comparison between them is honest by construction: same profile, same products, same code. */
function evaluate(txns: ConfidenceTxn[]) {
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const expenseRatio = income > 0 ? Math.min(expense / income, 1) : 1;

  const dc = computeDataConfidence(txns, 1, expenseRatio);
  const integrity = assessIncomeIntegrity(txns);
  const loan = decideLoan({
    score: PROBE.score,
    band: PROBE.band,
    confidence: dc.confidence,
    avgMonthlySurplus: PROBE.avgSurplus,
    monthlyDebtService: 0,
    avgIncome: PROBE.avgIncome,
    requestedAmount: PROBE.request,
    products: DEFAULT_PRODUCTS,
    coverageRatio: 1,
    coverageDaysCovered: 90,
    integrityFloorBreached: dc.integrityFloorBreached,
  });

  return { dc, integrity, loan };
}

/** Run one attack through the real integrity + fraud + loan engines and classify the outcome. */
export function runAttack(attack: AttackDef): AttackResult {
  const txns = attack.build();
  const { dc, integrity, loan } = evaluate(txns);

  return {
    id: attack.id,
    name: attack.name,
    technique: attack.technique,
    txnCount: txns.length,
    confidence: dc.confidence,
    hardCapped: integrity.hardCap,
    floorBreached: !!dc.integrityFloorBreached,
    decision: loan.decision,
    signals: dc.reasons.filter((r) => !r.ok).map((r) => ({ key: r.key, detail: r.detail })),
    verdict: classify(loan.decision, dc.confidence),
    payload: buildAttackPayload(txns),
  };
}

// ── The control ───────────────────────────────────────────────────────────────
// A self-test that only ever reports "caught" proves nothing: an engine that declined every
// applicant would score a perfect 6/6. So the gallery also runs an HONEST ledger through the
// identical probe. It has to come back approved  that is what makes the six catches evidence of
// discrimination rather than of a locked door. If a change to the rings ever starts rejecting
// honest data, this card turns and says so.

/** Genuine, verifiable data: extracted expenses and six months of salary from a registered
 *  employer. The same building blocks the attacks corrupt. */
export function controlLedger(): ConfidenceTxn[] {
  return [...genuineExpenses(), ...genuineIncome()];
}

export interface ControlResult {
  confidence: number;
  decision: Decision;
  /** RM the honest applicant qualifies for  the offer the attacks were trying to steal. */
  maxAmount: number;
  txnCount: number;
  /** True when the control behaves as a control must: honest data still gets through. */
  passed: boolean;
}

/** Run the honest ledger through the same probe the attacks face. */
export function runControl(): ControlResult {
  const txns = controlLedger();
  const { dc, loan } = evaluate(txns);
  return {
    confidence: dc.confidence,
    decision: loan.decision,
    maxAmount: loan.maxAmount,
    txnCount: txns.length,
    passed: loan.decision === 'approve',
  };
}

export function runGallery(): AttackResult[] {
  return ATTACKS.map(runAttack);
}
