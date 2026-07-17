// src/lib/lenderDirectory.ts
// Borrower-side client for the lender directory the Lender Console publishes at
// GET /api/lenders (the Lender Match flywheel). One-directional by design: only the
// lender's PUBLIC criteria travel (a rate-sheet equivalent)  no borrower data is ever
// sent; the Coach simulates against the fetched ladder entirely on-device.
//
// Untrusted network input: every entry is validated field-by-field (the
// validatePassportShape idiom) and malformed entries are dropped individually, keeping
// the valid ones. Any transport failure degrades to a single offline generic-ladder
// entry so the Coach screen never breaks in a disconnected demo environment.

import { DEFAULT_PRODUCTS, type LenderPolicy, type LoanProduct } from './loans';

/** One published lender: display identity + its loan product ladder, and (Brief N)
 *  optionally the affordability thresholds the lender's console decides with 
 *  when present, the Coach simulates under them, so "what this lender would say"
 *  tracks their real, current policy. Absent on older consoles (back-compat). */
export interface LenderProfile {
  id: string;
  name: string;
  blurb: string;
  brandColor: string;
  products: LoanProduct[];
  policy?: LenderPolicy;
}

export interface LenderDirectory {
  lenders: LenderProfile[];
  /** True when the console was unreachable and the generic fallback is being shown. */
  offline: boolean;
}

/** Shown when the console is unreachable  the Coach keeps working against the built-in ladder. */
export const OFFLINE_LENDER: LenderProfile = {
  id: 'offline',
  name: 'Generic ladder (offline)',
  blurb: 'Standard Pip product ladder. Shown when no lender directory is reachable.',
  brandColor: '#5b6770',
  products: DEFAULT_PRODUCTS,
};

/** The single configured lender console base URL. Shared with the direct-apply send flow
 *  (PassportScreen) so both the directory fetch and the application POST hit the same origin. */
export const LENDER_API_BASE = process.env.EXPO_PUBLIC_LENDER_API_URL ?? 'http://localhost:3000';
const BASE = LENDER_API_BASE;
const FETCH_TIMEOUT_MS = 6_000;

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nonEmptyStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/** Validate one product; returns a canonical copy or null. APR is a decimal (0.28 = 28%),
 *  so anything outside 0..1 is treated as malformed rather than silently mispriced. */
function parseProduct(raw: unknown): LoanProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!nonEmptyStr(p.id) || !nonEmptyStr(p.label)) return null;
  if (!isFiniteNum(p.minScore) || p.minScore < 0) return null;
  if (!isFiniteNum(p.minAmount) || p.minAmount <= 0) return null;
  if (!isFiniteNum(p.maxAmount) || p.maxAmount < p.minAmount) return null;
  if (!isFiniteNum(p.tenorMonths) || p.tenorMonths < 1) return null;
  if (!isFiniteNum(p.apr) || p.apr < 0 || p.apr > 1) return null;
  return {
    id: p.id,
    label: p.label,
    minScore: p.minScore,
    minAmount: p.minAmount,
    maxAmount: p.maxAmount,
    tenorMonths: p.tenorMonths,
    apr: p.apr,
  };
}

/** Validate a published policy block (Brief N): all six thresholds present and sane.
 *  Ratios in (0,1], day gates whole numbers within the 90-day coverage window, gates ordered. */
function parsePolicy(raw: unknown): LenderPolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const ratio = (v: unknown): v is number => isFiniteNum(v) && v > 0 && v <= 1;
  const days = (v: unknown): v is number => isFiniteNum(v) && Number.isInteger(v) && v >= 0 && v <= 90;
  if (!ratio(p.minConfidenceToApprove) || !ratio(p.maxInstallmentShareOfSurplus) || !ratio(p.maxDsr)) return null;
  if (!days(p.emergencyOnlyBelowDays) || !days(p.fullLadderFromDays)) return null;
  if (!ratio(p.minCoverageRatioForFullLadder)) return null;
  if (!ratio(p.costOfFunds) || !ratio(p.targetReturn)) return null;
  if (p.emergencyOnlyBelowDays > p.fullLadderFromDays) return null;
  return {
    minConfidenceToApprove: p.minConfidenceToApprove,
    maxInstallmentShareOfSurplus: p.maxInstallmentShareOfSurplus,
    maxDsr: p.maxDsr,
    emergencyOnlyBelowDays: p.emergencyOnlyBelowDays,
    fullLadderFromDays: p.fullLadderFromDays,
    minCoverageRatioForFullLadder: p.minCoverageRatioForFullLadder,
    costOfFunds: p.costOfFunds,
    targetReturn: p.targetReturn,
  };
}

/** Validate one lender entry; a single malformed product invalidates the whole entry 
 *  a partial ladder could silently mis-tier a borrower, which is worse than no ladder.
 *  Same rule for a malformed published policy: mis-simulating a lender's thresholds is
 *  worse than skipping the lender. A MISSING policy is fine (older console, defaults). */
function parseLender(raw: unknown): LenderProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (!nonEmptyStr(l.id) || !nonEmptyStr(l.name)) return null;
  if (typeof l.blurb !== 'string' || !nonEmptyStr(l.brandColor)) return null;
  if (!Array.isArray(l.products) || l.products.length === 0) return null;
  const products: LoanProduct[] = [];
  for (const rawProduct of l.products) {
    const p = parseProduct(rawProduct);
    if (!p) return null;
    products.push(p);
  }
  let policy: LenderPolicy | undefined;
  if (l.policy !== undefined) {
    const parsed = parsePolicy(l.policy);
    if (!parsed) return null;
    policy = parsed;
  }
  return { id: l.id, name: l.name, blurb: l.blurb, brandColor: l.brandColor, products, ...(policy ? { policy } : {}) };
}

/** Pure: validate an untrusted payload into lender profiles, dropping bad entries individually. */
export function parseLenderDirectory(raw: unknown): LenderProfile[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseLender).filter((l): l is LenderProfile => l !== null);
}

const OFFLINE_DIRECTORY: LenderDirectory = { lenders: [OFFLINE_LENDER], offline: true };

/** Fetch and validate the published lender directory; never throws, never returns empty. */
export async function fetchLenderDirectory(): Promise<LenderDirectory> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: { ok: boolean; json: () => Promise<unknown> };
    try {
      res = await fetch(`${BASE}/api/lenders`, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return OFFLINE_DIRECTORY;
    const lenders = parseLenderDirectory(await res.json());
    if (lenders.length === 0) return OFFLINE_DIRECTORY;
    return { lenders, offline: false };
  } catch {
    return OFFLINE_DIRECTORY;
  }
}
