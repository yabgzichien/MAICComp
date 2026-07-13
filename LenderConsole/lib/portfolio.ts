// lib/portfolio.ts (Brief Q)
// Pure: maps the approved-applications store (Brief O) into the pool-loan shape
// securitization.ts consumes, and computes the Portfolio dashboard aggregates. No new
// risk math  PD, expected loss, and tranching all reuse securitization.ts; this module
// only maps and aggregates. No UI/DB imports.

import type { ApplicationRecord } from './applications';
import { parsePassportCode } from './passport';
import { summarizePool, type CreditBand, type PoolLoan } from './securitization';

/** Above this share of exposure, a single band or purpose is flagged as a concentration. */
export const CONCENTRATION_THRESHOLD = 0.4;

/** Canonical low→high band order for the breakdown, mirrors tokens.BAND_ORDER. */
const BAND_ORDER: CreditBand[] = ['Building', 'Fair', 'Good', 'Strong', 'Excellent'];

/** Display apr/tenor by band (from the DEFAULT_PRODUCTS ladder). These do NOT affect the
 *  risk math  securitization.ts weights by band/fraud/principal only  they are carried
 *  for parity with the sample pool's shape and any later per-loan display. */
const BAND_TERMS: Record<CreditBand, { apr: number; tenorMonths: number }> = {
  Building: { apr: 0.28, tenorMonths: 12 },
  Fair: { apr: 0.28, tenorMonths: 12 },
  Good: { apr: 0.22, tenorMonths: 18 },
  Strong: { apr: 0.16, tenorMonths: 24 },
  Excellent: { apr: 0.16, tenorMonths: 24 },
};

/** Declared-purpose → display label. Purpose is the honest stand-in for sector until the
 *  richer-blocks occupation field (Brief P) lands; a missing purpose reads "Undeclared". */
const PURPOSE_LABELS: Record<string, string> = {
  stock: 'Stock / inventory',
  equipment: 'Equipment',
  'working-capital': 'Working capital',
  emergency: 'Emergency',
  education: 'Education',
  other: 'Other',
};
const UNDECLARED = 'Undeclared';

export interface BreakdownRow {
  label: string;
  exposure: number;
  count: number;
  pct: number; // share of total exposure, 0..1
}

export interface ConcentrationFlag {
  kind: 'band' | 'purpose';
  label: string;
  pct: number;
}

export interface Portfolio {
  totalExposure: number;
  loanCount: number;
  weightedAvgScore: number;
  weightedAvgPD: number;
  expectedLossRate: number;
  /** Principal-weighted data confidence  the AI-depth signal, reported alongside PD
   *  rather than folded into it (approved loans already cleared the confidence gate). */
  weightedAvgConfidence: number;
  bandBreakdown: BreakdownRow[];
  purposeBreakdown: BreakdownRow[];
  concentrations: ConcentrationFlag[];
}

interface BookLoan {
  loan: PoolLoan;
  confidence: number;
  purposeLabel: string;
}

const isCreditBand = (b: string): b is CreditBand => (BAND_ORDER as string[]).includes(b);

/** Map the approved book to internal loans, parsing each stored passport defensively.
 *  Approved rows with no offer, or an unparseable code, are skipped rather than throwing. */
function mapBook(apps: ApplicationRecord[]): BookLoan[] {
  const out: BookLoan[] = [];
  for (const a of apps) {
    if (a.status !== 'approved' || !(a.offeredAmount > 0)) continue;
    let passport;
    try {
      passport = parsePassportCode(a.passportCode).passport;
    } catch {
      continue;
    }
    const band: CreditBand = isCreditBand(passport.band) ? passport.band : 'Building';
    const terms = BAND_TERMS[band];
    out.push({
      loan: {
        id: a.subject,
        principal: a.offeredAmount,
        apr: terms.apr,
        tenorMonths: terms.tenorMonths,
        score: passport.score,
        band,
        // Approved loans already cleared the ML fraud + confidence gates at underwriting;
        // the pool's PD is driven by verified credit band, not a re-priced fraud number.
        fraudProb: 0,
      },
      confidence: passport.assessment?.confidence ?? 0,
      purposeLabel: a.purpose ? PURPOSE_LABELS[a.purpose.category] ?? UNDECLARED : UNDECLARED,
    });
  }
  return out;
}

/** The approved book as a securitization pool (the input to structurePool). */
export function bookToPool(apps: ApplicationRecord[]): PoolLoan[] {
  return mapBook(apps).map((b) => b.loan);
}

function breakdown(entries: { label: string; exposure: number }[], total: number, order?: string[]): BreakdownRow[] {
  const byLabel = new Map<string, { exposure: number; count: number }>();
  for (const e of entries) {
    const row = byLabel.get(e.label) ?? { exposure: 0, count: 0 };
    row.exposure += e.exposure;
    row.count += 1;
    byLabel.set(e.label, row);
  }
  const rows: BreakdownRow[] = Array.from(byLabel.entries()).map(([label, r]) => ({
    label,
    exposure: r.exposure,
    count: r.count,
    pct: total > 0 ? r.exposure / total : 0,
  }));
  if (order) {
    rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  } else {
    rows.sort((a, b) => b.exposure - a.exposure);
  }
  return rows;
}

/** Build the full Portfolio dashboard from the applications store. */
export function buildPortfolio(
  apps: ApplicationRecord[],
  opts: { concentrationThreshold?: number } = {},
): Portfolio {
  const threshold = opts.concentrationThreshold ?? CONCENTRATION_THRESHOLD;
  const book = mapBook(apps);
  const pool = book.map((b) => b.loan);
  const summary = summarizePool(pool);
  const total = summary.totalPrincipal;

  const weightedAvgConfidence = total > 0 ? book.reduce((s, b) => s + b.confidence * b.loan.principal, 0) / total : 0;

  const bandBreakdown = breakdown(book.map((b) => ({ label: b.loan.band, exposure: b.loan.principal })), total, BAND_ORDER);
  const purposeBreakdown = breakdown(book.map((b) => ({ label: b.purposeLabel, exposure: b.loan.principal })), total);

  const concentrations: ConcentrationFlag[] = [
    ...bandBreakdown.filter((r) => r.pct > threshold).map((r) => ({ kind: 'band' as const, label: r.label, pct: r.pct })),
    ...purposeBreakdown.filter((r) => r.pct > threshold).map((r) => ({ kind: 'purpose' as const, label: r.label, pct: r.pct })),
  ];

  return {
    totalExposure: total,
    loanCount: summary.loanCount,
    weightedAvgScore: summary.weightedAvgScore,
    weightedAvgPD: summary.weightedAvgPD,
    expectedLossRate: summary.expectedLossRate,
    weightedAvgConfidence,
    bandBreakdown,
    purposeBreakdown,
    concentrations,
  };
}
