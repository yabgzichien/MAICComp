import { useMemo } from 'react';
import { useAppData } from './store';
import { computeCreditScore, type CreditProfile, type CreditScore } from '../lib/creditScore';
import { computeDataConfidence, type DataConfidence } from '../lib/dataConfidence';
import { availableMonths, monthlyIncomeStatement, spentByCategory, computeAdherence } from '../lib/recap';
import { netWorth, netWorthSeries } from '../lib/networth';
import { currentMonthKey } from '../lib/budget';
import type { Coverage } from '../lib/coverage';

/** Assemble the CreditProfile from store state and compute the score. Deterministic given inputs. */
export function useCreditProfile(): {
  profile: CreditProfile;
  score: CreditScore;
  dataConfidence: DataConfidence;
  coverage: Coverage;
} {
  const {
    transactions,
    snapshots,
    allocations,
    accounts,
    balanceEntries,
    accountValues,
    repaymentSummary,
    coverage,
  } = useAppData();

  return useMemo(() => {
    // Last 6 months, oldest→newest for trend math.
    const months = availableMonths(transactions, Object.keys(snapshots)).slice(0, 6).reverse();
    const statements = months.map((mk) => monthlyIncomeStatement(transactions, mk));

    const n = Math.max(months.length, 1);
    const avgIncome = statements.reduce((s, st) => s + st.income, 0) / n;
    const avgSurplus = statements.reduce((s, st) => s + st.net, 0) / n;
    const incomeMonths = statements.filter((st) => st.income > 0).length;
    const positiveMonths = statements.filter((st) => st.net > 0).length;
    const savingsRate = avgIncome > 0 ? avgSurplus / avgIncome : 0;

    const { liabilities } = netWorth(accounts, accountValues);
    // Phase-0 heuristic: ~3%/mo minimum-payment proxy until real loans exist (Phase 2).
    const monthlyDebtService = liabilities * 0.03;

    const adherence = computeAdherence(allocations, spentByCategory(transactions, currentMonthKey()));
    const adherenceWithinRatio = adherence.totalBudgeted > 0 ? adherence.withinCount / adherence.totalBudgeted : 1;

    const series = netWorthSeries(accounts, balanceEntries, months);
    const netWorthSlope =
      series.length > 1 ? (series[series.length - 1].net - series[0].net) / (series.length - 1) : 0;

    // Recorded expenses as a share of recorded income (drives the plausibility check).
    const avgExpenses = Math.max(0, avgIncome - avgSurplus);
    const expenseRatio = avgIncome > 0 ? avgExpenses / avgIncome : 1;

    const dataConfidence = computeDataConfidence(
      transactions.map((t) => ({
        amount: t.amount,
        source: t.source,
        merchantKey: t.merchantKey,
        date: t.date,
        type: t.type,
        merchantRaw: t.merchantRaw,
      })),
      coverage.ratio,
      expenseRatio
    );
    const { confidence } = dataConfidence;

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
      repaymentOnTime: repaymentSummary.onTime,
      repaymentTotal: repaymentSummary.total,
      confidence,
    };
    return { profile, score: computeCreditScore(profile), dataConfidence, coverage };
  }, [transactions, snapshots, allocations, accounts, balanceEntries, accountValues, repaymentSummary, coverage]);
}
