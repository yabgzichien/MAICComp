// src/lib/assembleCredit.ts
// Pure credit-profile assembly, lifted out of useCreditProfile so it can be replayed at any `now`
// (which is what Credit Momentum needs). Filters transactions to those on/before `now`, then runs
// the same deterministic engines the hook used. No UI/DB imports — unit-tested.
import { computeCreditScore, type CreditProfile, type CreditScore } from './creditScore';
import { computeCoverage, type Coverage } from './coverage';
import { computeDataConfidence, type ConfidenceTxn, type DataConfidence } from './dataConfidence';
import { availableMonths, monthlyIncomeStatement, spentByCategory, computeAdherence } from './recap';
import { netWorth, netWorthSeries } from './networth';
import { currentMonthKey, type Allocations } from './budget';
import type { Account, BalanceEntry, Transaction } from './types';

/** The store slice the credit assembly reads. Passing it explicitly makes the assembly pure and
 *  replayable at any `now` (which is what Credit Momentum needs). */
export interface CreditInputs {
  transactions: Transaction[];
  snapshotMonths: string[];
  allocations: Allocations;
  accounts: Account[];
  balanceEntries: BalanceEntry[];
  accountValues: Record<string, number>;
  repaymentSummary: { onTime: number; total: number };
}

export interface AssembledCredit {
  profile: CreditProfile;
  score: CreditScore;
  coverage: Coverage;
  dataConfidence: DataConfidence;
  confidenceTxns: ConfidenceTxn[];
  expenseRatio: number;
}

/** A transaction's effective calendar time (its own date if present, else when it was logged). */
function txnTime(t: Transaction): number {
  return new Date(t.date ?? t.createdAt).getTime();
}

/**
 * Assemble the credit profile + score as of `now`. At the real current time this is byte-identical
 * to the old useCreditProfile assembly; at a past `now` it replays the profile the borrower had then
 * (transaction-derived signals only — net worth and repayment count are held at the passed values,
 * since they are not dated in the store).
 */
export function assembleCredit(input: CreditInputs, now: Date = new Date()): AssembledCredit {
  const nowMs = now.getTime();
  const transactions = input.transactions.filter((t) => txnTime(t) <= nowMs);

  const coverage = computeCoverage(transactions, now);

  // Last 6 months (as of `now`), oldest→newest for trend math.
  const months = availableMonths(transactions, input.snapshotMonths, now).slice(0, 6).reverse();
  const statements = months.map((mk) => monthlyIncomeStatement(transactions, mk));

  const n = Math.max(months.length, 1);
  const avgIncome = statements.reduce((s, st) => s + st.income, 0) / n;
  const avgSurplus = statements.reduce((s, st) => s + st.net, 0) / n;
  const incomeMonths = statements.filter((st) => st.income > 0).length;
  const positiveMonths = statements.filter((st) => st.net > 0).length;
  const savingsRate = avgIncome > 0 ? avgSurplus / avgIncome : 0;

  const { liabilities } = netWorth(input.accounts, input.accountValues);
  // Phase-0 heuristic: ~3%/mo minimum-payment proxy until real loans exist (Phase 2).
  const monthlyDebtService = liabilities * 0.03;

  const adherence = computeAdherence(
    input.allocations,
    spentByCategory(transactions, currentMonthKey(now))
  );
  const adherenceWithinRatio = adherence.totalBudgeted > 0 ? adherence.withinCount / adherence.totalBudgeted : 1;

  const series = netWorthSeries(input.accounts, input.balanceEntries, months);
  const netWorthSlope =
    series.length > 1 ? (series[series.length - 1].net - series[0].net) / (series.length - 1) : 0;

  const avgExpenses = Math.max(0, avgIncome - avgSurplus);
  const expenseRatio = avgIncome > 0 ? avgExpenses / avgIncome : 1;

  const confidenceTxns: ConfidenceTxn[] = transactions.map((t) => ({
    amount: t.amount,
    source: t.source,
    merchantKey: t.merchantKey,
    date: t.date,
    type: t.type,
    merchantRaw: t.merchantRaw,
  }));
  const dataConfidence = computeDataConfidence(confidenceTxns, coverage.ratio, expenseRatio);

  const profile: CreditProfile = {
    months: months.length,
    avgIncome,
    incomeMonths,
    avgSurplus,
    positiveMonths,
    savingsRate,
    monthlyDebtService,
    adherenceWithinRatio,
    netWorthSlope,
    repaymentOnTime: input.repaymentSummary.onTime,
    repaymentTotal: input.repaymentSummary.total,
    confidence: dataConfidence.confidence,
  };

  return { profile, score: computeCreditScore(profile), coverage, dataConfidence, confidenceTxns, expenseRatio };
}
