// lib/bookStats.ts (2026-07-18 stats/advisor design)
// Pure: mean/median/standard-deviation summaries for credit score, offered amount, and
// per-loan collection rate across the approved book (active + settled  mapBook itself
// is unfiltered; only lib/portfolio.ts's live-exposure views exclude settled loans).
// Deliberately no mode (meaningless on continuous values at this book size, where every
// value is essentially unique) and no raw variance (squared units nobody reads). No new
// risk math and no UI imports.

import type { ApplicationRecord } from './applications';
import { mapBook } from './portfolio';
import { loanPerformance, SMALL_SAMPLE_MIN_LOANS } from './performance';

export interface StatSummary {
  n: number;
  mean: number;
  median: number;
  /** Population standard deviation (divides by n)  this describes the exact book in
   *  hand, not a sample used to infer a larger population. */
  stdDev: number;
  min: number;
  max: number;
  smallSample: boolean;
}

export interface BookStats {
  score: StatSummary;
  amount: StatSummary;
  /** Per-loan amountCollected/amountDue, computed only over loans with something
   *  actually due to date  a freshly-disbursed loan has no rate to report yet. */
  collectionRate: StatSummary;
}

function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function summarize(xs: number[]): StatSummary {
  return {
    n: xs.length,
    mean: mean(xs),
    median: median(xs),
    stdDev: stdDev(xs),
    min: xs.length > 0 ? Math.min(...xs) : 0,
    max: xs.length > 0 ? Math.max(...xs) : 0,
    smallSample: xs.length < SMALL_SAMPLE_MIN_LOANS,
  };
}

/** Build the book's distribution statistics from the applications store. */
export function buildBookStats(apps: ApplicationRecord[], now: Date = new Date()): BookStats {
  const book = mapBook(apps);
  const scores = book.map((b) => b.loan.score);
  const amounts = book.map((b) => b.loan.principal);
  const collectionRates: number[] = [];
  for (const b of book) {
    const perf = loanPerformance(b, now);
    if (perf.amountDue > 0) collectionRates.push(perf.amountCollected / perf.amountDue);
  }
  return {
    score: summarize(scores),
    amount: summarize(amounts),
    collectionRate: summarize(collectionRates),
  };
}
