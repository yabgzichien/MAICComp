// src/lib/dataConfidence.ts
// Pure, deterministic data-authenticity scoring. No UI/DB imports — unit-tested.
import type { TxnSource, TxnType } from './types';
import { extractFraudFeatures } from './fraudFeatures';
import { scoreFraud } from './fraudModel';

/** Per-source trust weight (how much we trust data from this origin). */
const SOURCE_WEIGHT: Record<TxnSource, number> = {
  verified: 1.0,
  extracted: 0.7,
  imported: 0.7,
  manual: 0.4,
};

/** Minimal transaction shape this module needs. */
export interface ConfidenceTxn {
  amount: number;
  source: TxnSource;
  merchantKey?: string;
  date?: string | null;
  /** income vs expense — required for the asymmetric-fraud integrity rings (Section 4 of the
   *  confidence-hardening plan). Optional for back-compat: when absent on every row the rings
   *  are inert and confidence is computed exactly as before. */
  type?: TxnType;
  /** Raw payer/merchant string, used by the merchant-to-income entity-alignment check. */
  merchantRaw?: string;
  /** Running-account balance after this row, when the source document carries one. Drives the
   *  ledger reconciliation ring; inert (no balance) for screenshots and manual entry. */
  balance?: number | null;
}

export interface ConfidenceReason {
  key: string;
  ok: boolean;
  detail: string;
}

export interface DataConfidence {
  confidence: number; // 0..1
  reasons: ConfidenceReason[];
  /** True when a structural income-integrity check failed badly enough that the downstream
   *  loans engine should DECLINE outright (not merely REFER). Optional/false by default. */
  integrityFloorBreached?: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Provenance-weighted trust 0..1 from transaction sources (0.5 if empty). */
export function provenanceTrust(sources: TxnSource[]): number {
  if (sources.length === 0) return 0.5;
  const total = sources.reduce((s, src) => s + (SOURCE_WEIGHT[src] ?? 0.4), 0);
  return total / sources.length;
}

/**
 * Conformity of leading digits to Benford's Law, 0..1 (1 = perfect).
 * Neutral 0.5 when there are too few amounts to judge (<30).
 */
export function benfordConformity(amounts: number[]): number {
  const digits = amounts
    .map((a) => Math.floor(Math.abs(a)))
    .filter((n) => n > 0)
    .map((n) => Number(String(n)[0]))
    .filter((d) => d >= 1 && d <= 9);
  if (digits.length < 30) return 0.5;
  const counts = new Array(10).fill(0);
  for (const d of digits) counts[d]++;
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    const observed = counts[d] / digits.length;
    const expected = Math.log10(1 + 1 / d);
    deviation += Math.abs(observed - expected);
  }
  return clamp(1 - deviation / 1.7, 0, 1); // normalizer: empirical ~1.9 max total deviation; clamp handles any overflow
}

function roundRatio(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  return amounts.filter((a) => a > 0 && a % 100 === 0).length / amounts.length;
}

function duplicateRatio(txns: ConfidenceTxn[]): number {
  if (txns.length === 0) return 0;
  const seen = new Map<string, number>();
  let dups = 0;
  for (const t of txns) {
    const k = `${t.merchantKey ?? ''}|${t.amount}|${t.date ?? ''}`;
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    if (c > 1) dups++;
  }
  return dups / txns.length;
}

// ── Asymmetric-fraud integrity rings ──────────────────────────────────────────
// These attack the income stream specifically — row-by-row and by provenance — the axes
// the global aggregates above ignore. A fraudster who leaves 90% of genuine transactions
// intact and injects a few fabricated high-income rows barely moves Benford / round / dup /
// entropy / CV, but those few rows are loud here. See docs/confidence-hardening.md.

const VERIFIED_SOURCES: ReadonlySet<TxnSource> = new Set(['extracted', 'imported', 'verified']);

/** Payer strings that identify a real commercial/statutory income source (registered company
 *  suffixes, payment gateways, platform payouts, payroll/statutory markers, government). */
const VERIFIED_PAYER_TOKENS = [
  'sdn bhd', 'berhad', ' bhd', ' plt', 'enterprise', 'holdings', 'corporation', ' corp', ' inc',
  'payroll', 'salary', 'gaji', 'wages', 'kwsp', 'epf', 'socso', 'perkeso', 'lhdn',
  'stripe', 'ipay88', 'billplz', 'senangpay', 'toyyibpay', 'molpay',
  'grab', 'shopee', 'foodpanda', 'lazada', 'government', 'kerajaan', 'jabatan', 'kementerian',
];

/** Payer strings that mark an undocumented peer-to-peer transfer masquerading as income. */
const GENERIC_PAYER_TOKENS = [
  'duitnow', 'funds transfer', 'fund transfer', 'instant transfer', 'ibg', 'interbank',
  '3rd party', 'third party', 'transfer from', 'cash deposit',
];

/** Below 0.40 the loans engine cannot auto-approve (its MIN_CONFIDENCE_TO_APPROVE is 0.50),
 *  so capping here forces a REFER through machinery that already exists. */
const HARD_CAP_CEILING = 0.39;
const MIN_INCOME_FOR_MAD = 5;
const MIN_INCOME_MONTHS = 3;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation — robust to the very outlier we are hunting (unlike σ, which the
 *  outlier itself inflates, hiding the fraud behind a threshold it then clears). */
function mad(xs: number[], med: number): number {
  if (xs.length === 0) return 0;
  return median(xs.map((x) => Math.abs(x - med)));
}

/** True when an income row's payer cannot be matched to a verified commercial source. A blank
 *  string or a bare personal name is treated as generic — we cannot verify it as a real payer. */
export function isGenericIncomePayer(t: ConfidenceTxn): boolean {
  const raw = (t.merchantRaw ?? t.merchantKey ?? '').toLowerCase().trim();
  if (raw === '') return true;
  if (VERIFIED_PAYER_TOKENS.some((tok) => raw.includes(tok))) return false;
  if (GENERIC_PAYER_TOKENS.some((tok) => raw.includes(tok))) return true;
  return true;
}

/**
 * Ring 1.1 — running-balance reconciliation. For rows that carry a balance and a date, the
 * ledger must satisfy balance[t] = balance[t-1] + signedAmount[t] (income +, expense −). A pair
 * that violates this (beyond a rounding tolerance) is a "discontinuous step-function" — the
 * fingerprint of a row pasted in without recomputing surrounding balances. Income-coincident
 * breaks are the injected-salary signature. Inert when no balances are present.
 */
export function reconcileBalances(txns: ConfidenceTxn[]): {
  breaks: number;
  incomeCoincidentBreaks: number;
  reconcilablePairs: number;
} {
  const rows = txns
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => typeof t.balance === 'number' && !!t.date && (t.type === 'income' || t.type === 'expense'))
    .sort((a, b) => (a.t.date! < b.t.date! ? -1 : a.t.date! > b.t.date! ? 1 : a.i - b.i));

  let breaks = 0;
  let incomeCoincidentBreaks = 0;
  let pairs = 0;
  for (let k = 1; k < rows.length; k++) {
    const prev = rows[k - 1].t;
    const cur = rows[k].t;
    const signed = cur.type === 'income' ? cur.amount : -cur.amount;
    const expected = (prev.balance as number) + signed;
    const tol = Math.max(0.01, Math.abs(cur.balance as number) * 0.001);
    pairs++;
    if (Math.abs((cur.balance as number) - expected) > tol) {
      breaks++;
      if (cur.type === 'income') incomeCoincidentBreaks++;
    }
  }
  return { breaks, incomeCoincidentBreaks, reconcilablePairs: pairs };
}

/**
 * Ring 1.2 — robust income point-anomaly. Modified z-score (Iglewicz–Hoaglin) of each income
 * amount against the income stream's own median/MAD. Returns the worst score and whether that
 * outlier row also entered through a weak door (manual source or a generic/undocumented payer).
 */
export function incomePointAnomaly(txns: ConfidenceTxn[]): { maxModZ: number; weakSource: boolean } {
  const income = txns.filter((t) => t.type === 'income' && t.amount > 0);
  if (income.length < MIN_INCOME_FOR_MAD) return { maxModZ: 0, weakSource: false };
  const amounts = income.map((t) => Math.abs(t.amount));
  const med = median(amounts);
  const md = mad(amounts, med);
  if (md === 0) return { maxModZ: 0, weakSource: false };

  let maxModZ = 0;
  let argmax: ConfidenceTxn | null = null;
  for (const t of income) {
    const z = (0.6745 * (Math.abs(t.amount) - med)) / md;
    if (z > maxModZ) {
      maxModZ = z;
      argmax = t;
    }
  }
  const weakSource = !!argmax && (argmax.source === 'manual' || isGenericIncomePayer(argmax));
  return { maxModZ, weakSource };
}

/** Ring 2.2 — share of income *value* from generic/undocumented payers (0..1). */
export function p2pIncomeValueRatio(txns: ConfidenceTxn[]): number {
  const income = txns.filter((t) => t.type === 'income' && t.amount > 0);
  const total = income.reduce((s, t) => s + t.amount, 0);
  if (total <= 0) return 0;
  const generic = income.filter(isGenericIncomePayer).reduce((s, t) => s + t.amount, 0);
  return clamp(generic / total, 0, 1);
}

/**
 * Ring 2.1 — income-to-expense skew. Flags a month whose income spikes past 2.5× its peers'
 * median while spending stays flat (real income growth comes with some spending response).
 */
export function incomeMonthlySkew(txns: ConfidenceTxn[]): boolean {
  const byMonth = new Map<string, { inc: number; exp: number }>();
  for (const t of txns) {
    if (!t.date || t.date.length < 7) continue;
    const mk = t.date.slice(0, 7);
    const cell = byMonth.get(mk) ?? { inc: 0, exp: 0 };
    if (t.type === 'income') cell.inc += t.amount;
    else if (t.type === 'expense') cell.exp += t.amount;
    byMonth.set(mk, cell);
  }
  const incMonths = [...byMonth.values()].filter((m) => m.inc > 0);
  if (incMonths.length < MIN_INCOME_MONTHS) return false;

  let peak = incMonths[0];
  for (const m of incMonths) if (m.inc > peak.inc) peak = m;
  const others = incMonths.filter((m) => m !== peak);
  if (others.length === 0) return false;

  const medInc = median(others.map((m) => m.inc));
  const medExp = median(others.map((m) => m.exp));
  if (medInc <= 0) return false;
  const incomeSpike = peak.inc > 2.5 * medInc;
  const expenseFlat = peak.exp <= 1.2 * Math.max(medExp, 1);
  return incomeSpike && expenseFlat;
}

/**
 * Ring 3.1 — source isolation gap. The verified-pipeline share of expense *value* minus that of
 * income *value*. Large when the cheap-to-fake healthy points (expenses) are authentically
 * captured but the valuable income leans on the weakest manual pipeline.
 */
export function sourceIsolationGap(txns: ConfidenceTxn[]): number {
  const income = txns.filter((t) => t.type === 'income' && t.amount > 0);
  const expense = txns.filter((t) => t.type === 'expense' && t.amount > 0);
  const incTotal = income.reduce((s, t) => s + t.amount, 0);
  const expTotal = expense.reduce((s, t) => s + t.amount, 0);
  if (incTotal <= 0 || expTotal <= 0) return 0;
  const incVer = income.filter((t) => VERIFIED_SOURCES.has(t.source)).reduce((s, t) => s + t.amount, 0) / incTotal;
  const expVer = expense.filter((t) => VERIFIED_SOURCES.has(t.source)).reduce((s, t) => s + t.amount, 0) / expTotal;
  return clamp(expVer - incVer, -1, 1);
}

export interface IncomeIntegrity {
  penalty: number; // multiplicative soft penalty 0..0.6
  hardCap: boolean; // cap confidence at HARD_CAP_CEILING (forces REFER)
  floorBreached: boolean; // forces DECLINE downstream
  reasons: ConfidenceReason[];
}

/**
 * Ring 3.2 — orchestrate the rings into a soft penalty, a hard cap, and a DECLINE floor.
 * Soft penalties dampen; a single hard condition caps to REFER; two or more (or a broken income
 * balance chain) breach the floor → DECLINE. Pure and deterministic.
 */
export function assessIncomeIntegrity(txns: ConfidenceTxn[]): IncomeIntegrity {
  const reasons: ConfidenceReason[] = [];
  let penalty = 0;
  let hardConditions = 0;
  let floorBreached = false;

  // Ring 1.1 — running-balance reconciliation
  const recon = reconcileBalances(txns);
  if (recon.reconcilablePairs > 0) {
    if (recon.incomeCoincidentBreaks > 0) {
      hardConditions++;
      floorBreached = true;
      reasons.push({
        key: 'integrity_balance',
        ok: false,
        detail: `running balance fails to reconcile on ${recon.incomeCoincidentBreaks} income row(s)`,
      });
    } else if (recon.breaks > 0) {
      penalty += 0.15;
      reasons.push({ key: 'integrity_balance', ok: false, detail: `${recon.breaks} running-balance mismatch(es)` });
    } else {
      reasons.push({ key: 'integrity_balance', ok: true, detail: 'running balance reconciles' });
    }
  }

  // Ring 1.2 — robust income point-anomaly
  const anom = incomePointAnomaly(txns);
  if (anom.maxModZ > 3.5) {
    if (anom.weakSource) {
      hardConditions++;
      reasons.push({
        key: 'integrity_income_outlier',
        ok: false,
        detail: `isolated high income (${anom.maxModZ.toFixed(1)} MAD) from a weak/undocumented source`,
      });
    } else {
      penalty += 0.2;
      reasons.push({ key: 'integrity_income_outlier', ok: false, detail: `isolated high income (${anom.maxModZ.toFixed(1)} MAD)` });
    }
  }

  // Ring 2.2 — merchant-to-income entity alignment
  const p2p = p2pIncomeValueRatio(txns);
  if (p2p > 0.5) {
    penalty += clamp((p2p - 0.5) / 0.5, 0, 1) * 0.2;
    reasons.push({
      key: 'integrity_income_payer',
      ok: false,
      detail: `${Math.round(p2p * 100)}% of income from generic/undocumented payers`,
    });
  }

  // Ring 2.1 — income-to-expense skew
  if (incomeMonthlySkew(txns)) {
    penalty += 0.15;
    reasons.push({ key: 'integrity_income_skew', ok: false, detail: 'an income spike is not mirrored by any spending response' });
  }

  // Ring 3.1 — source isolation
  const iso = sourceIsolationGap(txns);
  if (iso > 0.6) {
    hardConditions++;
    reasons.push({
      key: 'integrity_source_isolation',
      ok: false,
      detail: `income relies on much weaker pipelines than expenses (gap ${Math.round(iso * 100)}%)`,
    });
  } else if (iso > 0.4) {
    penalty += clamp((iso - 0.4) / 0.2, 0, 1) * 0.2;
    reasons.push({
      key: 'integrity_source_isolation',
      ok: false,
      detail: `income relies on weaker pipelines than expenses (gap ${Math.round(iso * 100)}%)`,
    });
  }

  if (hardConditions >= 2) floorBreached = true;

  return {
    penalty: clamp(penalty, 0, 0.6),
    hardCap: hardConditions > 0 || floorBreached,
    floorBreached,
    reasons,
  };
}

/**
 * Overall data confidence 0..1 with human-readable reasons.
 *
 * `coverageRatio` (0..1, optional) is the 90-day data-coverage signal from `lib/coverage.ts`.
 * When omitted, the function behaves exactly as before (back-compat). When provided, a small
 * weight is taken from the round-number and duplicate sub-weights so trust + Benford keep
 * their dominance, and one extra `ConfidenceReason` row reports coverage.
 *
 * `expenseRatio` (recorded expenses ÷ recorded income, optional) drives a plausibility check:
 * a working person spends a meaningful share of income, so an implausibly low ratio suggests
 * the picture is incomplete (e.g. income-only screenshots). It is treated as a penalty (like
 * the ML penalty), not a weighted term, so a healthy ratio leaves confidence untouched.
 */
export function computeDataConfidence(
  txns: ConfidenceTxn[],
  coverageRatio?: number,
  expenseRatio?: number
): DataConfidence {
  const amounts = txns.map((t) => t.amount);
  const trust = provenanceTrust(txns.map((t) => t.source));
  const benford = benfordConformity(amounts);
  const round = roundRatio(amounts);
  const dup = duplicateRatio(txns);
  const roundPenalty = clamp((round - 0.2) / 0.5, 0, 1);

  const coverageProvided = typeof coverageRatio === 'number';
  const cov = coverageProvided ? clamp(coverageRatio as number, 0, 1) : 0;

  // Weighting: when coverage is provided, take 0.05 from round + 0.05 from duplicates so
  // trust (0.5) + Benford (0.25) keep their dominance and coverage carries 0.10.
  const heuristicConfidence = coverageProvided
    ? clamp(
        trust * 0.5 + benford * 0.25 + (1 - roundPenalty) * 0.1 + (1 - dup) * 0.05 + cov * 0.1,
        0,
        1
      )
    : clamp(
        trust * 0.5 + benford * 0.25 + (1 - roundPenalty) * 0.15 + (1 - dup) * 0.1,
        0,
        1
      );

  // ML fraud model blending
  const fraudFeatures = extractFraudFeatures(txns);
  const fraudScore = scoreFraud(fraudFeatures);
  const mlPenalty = fraudScore.probability * 0.3; // up to 0.3 penalty at max fraud prob

  // Plausibility: recorded expenses should be a meaningful share of recorded income.
  // Below PLAUSIBLE_EXPENSE_FLOOR the picture looks curated/incomplete → a penalty up to 0.25.
  const PLAUSIBLE_EXPENSE_FLOOR = 0.4;
  const plausibilityProvided = typeof expenseRatio === 'number';
  const expRatio = plausibilityProvided ? clamp(expenseRatio as number, 0, 1) : 1;
  const plausibility = clamp(expRatio / PLAUSIBLE_EXPENSE_FLOOR, 0, 1);
  const plausibilityPenalty = plausibilityProvided ? (1 - plausibility) * 0.25 : 0;

  // Asymmetric-fraud integrity rings — inert (no penalty, no reasons) unless rows carry `type`,
  // so back-compat callers behave exactly as before.
  const hasTypeData = txns.some((t) => t.type === 'income' || t.type === 'expense');
  const integrity: IncomeIntegrity = hasTypeData
    ? assessIncomeIntegrity(txns)
    : { penalty: 0, hardCap: false, floorBreached: false, reasons: [] };

  let confidence = clamp(
    heuristicConfidence * (1 - mlPenalty) * (1 - plausibilityPenalty) * (1 - integrity.penalty),
    0,
    1
  );
  if (integrity.hardCap) confidence = Math.min(confidence, HARD_CAP_CEILING);

  const reasons: ConfidenceReason[] = [
    { key: 'provenance', ok: trust >= 0.7, detail: `source trust ${Math.round(trust * 100)}%` },
    {
      key: 'benford',
      ok: benford >= 0.6,
      detail: amounts.length >= 30 ? `Benford conformity ${Math.round(benford * 100)}%` : 'not enough data for Benford',
    },
    { key: 'round_numbers', ok: roundPenalty === 0, detail: `${Math.round(round * 100)}% round amounts` },
    { key: 'duplicates', ok: dup < 0.05, detail: `${Math.round(dup * 100)}% duplicate-looking rows` },
  ];

  if (coverageProvided) {
    reasons.push({
      key: 'coverage',
      ok: cov >= 0.3,
      detail: `coverage ${Math.round(cov * 100)}% of last 90 days`,
    });
  }

  if (plausibilityProvided) {
    const ok = expRatio >= PLAUSIBLE_EXPENSE_FLOOR;
    reasons.push({
      key: 'plausibility',
      ok,
      detail: ok
        ? `expenses ${Math.round(expRatio * 100)}% of income`
        : `expenses only ${Math.round(expRatio * 100)}% of income — picture may be incomplete`,
    });
  }

  // Integrity-ring reasons (only present when type-bearing rows exist).
  reasons.push(...integrity.reasons);

  // Append top 2 ML fraud contributions as reasons (only when enough data)
  if (txns.length >= 10) {
    const top2 = fraudScore.contributions.slice(0, 2);
    for (const contribution of top2) {
      reasons.push({
        key: `ml_${contribution.feature}`,
        ok: contribution.weight < 0, // negative weight = pushes toward genuine = ok
        detail: `ML: ${contribution.feature.replace(/_/g, ' ')} (${contribution.weight >= 0 ? 'fraud signal' : 'genuine signal'})`,
      });
    }
  }

  return { confidence, reasons, integrityFloorBreached: integrity.floorBreached };
}
