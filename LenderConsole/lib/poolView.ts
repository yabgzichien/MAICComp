// lib/poolView.ts (Brief Q)
// Pure formatting of a SecuritizationResult into the Capital Markets display grammar 
// the headline stat cells and the tranche cards. Kept out of the component so the
// source toggle (sample vs live book) is testable: same engine, different pool in.

import type { PoolSummary, Rating, SecuritizationResult, Tranche } from './securitization';

export function formatPoolMoney(n: number): string {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `RM ${Math.round(n / 1_000)}K`;
  return `RM ${Math.round(n).toLocaleString('en-MY')}`;
}

export interface StatCell {
  label: string;
  value: string;
  info: string; // GLOSSARY key
}

export function poolStatCells(summary: PoolSummary): StatCell[] {
  return [
    { label: 'Total Principal', value: formatPoolMoney(summary.totalPrincipal), info: 'total_principal' },
    { label: 'Loans Pooled', value: summary.loanCount.toLocaleString('en-MY'), info: 'loans_pooled' },
    { label: 'Wtd-Avg Score', value: String(Math.round(summary.weightedAvgScore)), info: 'wtd_avg_score' },
    { label: 'Wtd-Avg PD', value: `${(summary.weightedAvgPD * 100).toFixed(1)}%`, info: 'wtd_avg_pd' },
    { label: 'Expected Loss', value: `${(summary.expectedLossRate * 100).toFixed(2)}%`, info: 'expected_loss' },
  ];
}

/** Rating badge colours  driven by the computed rating, so a downgraded pool visibly
 *  shifts amber/red rather than always showing the sample's green 'A'. */
export function ratingStyle(rating: Rating): { color: string; bg: string } {
  if (rating === 'AAA' || rating === 'AA' || rating === 'A') return { color: '#1f8a5b', bg: '#dbece5' };
  if (rating === 'BBB' || rating === 'BB') return { color: '#d98a00', bg: '#fdf3dc' };
  return { color: '#c0392b', bg: '#fde8e8' };
}

/** Fixed structural colours per tranche seat (thickness is fixed; only the rating floats). */
const SEAT_STYLE: Record<Tranche['name'], { color: string; tint: string; border: string }> = {
  Senior: { color: '#1f8a5b', tint: '#eff7f4', border: '#dbece5' },
  Mezzanine: { color: '#d98a00', tint: '#fffcf2', border: '#f5d990' },
  Subordinated: { color: '#c0392b', tint: '#fff8f8', border: '#f5c6c6' },
};

export interface TrancheView {
  name: string;           // UPPERCASE seat label
  seat: Tranche['name'];
  rating: Rating;
  ratingColor: string;
  ratingBg: string;
  color: string;
  tint: string;
  border: string;
  pct: number;            // integer slice %
  size: string;
  profit: string;
  reason: string;
}

export function trancheViews(result: SecuritizationResult): TrancheView[] {
  return result.tranches.map((t) => {
    const seat = SEAT_STYLE[t.name];
    const rs = ratingStyle(t.rating);
    return {
      name: t.name.toUpperCase(),
      seat: t.name,
      rating: t.rating,
      ratingColor: rs.color,
      ratingBg: rs.bg,
      color: seat.color,
      tint: seat.tint,
      border: seat.border,
      pct: Math.round(t.thicknessPct * 100),
      size: formatPoolMoney(t.thicknessRM),
      profit: `${(t.profitRate * 100).toFixed(1)}%`,
      reason: t.reason,
    };
  });
}
