import { useMemo } from 'react';
import { useAppData } from './store';
import type { CreditProfile, CreditScore } from '../lib/creditScore';
import type { DataConfidence } from '../lib/dataConfidence';
import type { Coverage } from '../lib/coverage';
import { DEFAULT_PRODUCTS } from '../lib/loans';
import type { CoachPlanInput } from '../lib/coachPlan';
import { assembleCredit, type CreditInputs } from '../lib/assembleCredit';
import { computeMomentum, type Momentum } from '../lib/momentum';
import { computeIncomeQuality, type IncomeQuality } from '../lib/incomeQuality';
import { computeExpenseStructure, computeSpendingProfile, type ExpenseStructure, type SpendingProfile } from '../lib/spendingProfile';
import { detectObligations, type ObligationSummary } from '../lib/obligations';
import { computeIncomeFloor, type IncomeFloor } from '../lib/incomeFloor';
import { computeRepaymentStanding, type RepaymentStanding } from '../lib/repaymentStanding';
import { getBenchmark, type Benchmark } from '../lib/belanjawanku';
import { benchmarkGaps, type BenchmarkGap } from '../lib/belanjawankuBudget';
import { averageMonthlySpend } from '../lib/budget';

/** Assemble the CreditProfile from store state and compute the score. Deterministic given inputs. */
export function useCreditProfile(): {
  profile: CreditProfile;
  score: CreditScore;
  dataConfidence: DataConfidence;
  coverage: Coverage;
  /** Everything the Passport Builder Coach needs to re-run the engines under candidate actions. */
  coachInput: CoachPlanInput;
  /** The borrower's 90-day score/coverage trajectory; null below the minimum-history floor. */
  momentum: Momentum | null;
  /** Richer passport blocks (Brief P), computed on-device from the ledger. Evidence, not score inputs. */
  incomeQuality: IncomeQuality;
  spendingProfile: SpendingProfile;
  obligations: ObligationSummary;
  /** The income that actually held up, and how escapable each ringgit of spending is. Borrower-
   *  facing insight only  deliberately NOT wired into the score or the passport. */
  incomeFloor: IncomeFloor;
  expenseStructure: ExpenseStructure;
  /** Current arrears state + decaying scar across every loan (2026-07-21 design). */
  standing: RepaymentStanding;
  /** The national reference budget this borrower's household is measured against. */
  benchmark: Benchmark;
  /** Where they outspend that reference, biggest gap first. Empty when within the guide. */
  gaps: BenchmarkGap[];
} {
  const {
    transactions,
    snapshots,
    allocations,
    accounts,
    balanceEntries,
    accountValues,
    repaymentSummary,
    loanApplications,
    repayments,
    householdProfile,
    guideCity,
  } = useAppData();

  return useMemo(() => {
    const inputs: CreditInputs = {
      transactions,
      snapshotMonths: Object.keys(snapshots),
      allocations,
      accounts,
      balanceEntries,
      accountValues,
      repaymentSummary,
    };
    const { profile, score, coverage, dataConfidence, confidenceTxns, expenseRatio } = assembleCredit(inputs);
    const standing = computeRepaymentStanding(
      loanApplications.map((a) => ({
        applicationId: a.id,
        repayments: repayments.filter((r) => r.applicationId === a.id),
        defaulted: a.status === 'defaulted',
      }))
    );
    // Measured over the same three-month window the Budget wizard's auto-fill uses, so the
    // coach's "you run over here" and the Budget screen's per-category hints can never disagree.
    const benchmark = getBenchmark(householdProfile, guideCity);
    const gaps = benchmarkGaps(benchmark, averageMonthlySpend(transactions, new Date(), 3));
    const coachInput: CoachPlanInput = {
      profile,
      coverage,
      confidenceTxns,
      expenseRatio,
      products: DEFAULT_PRODUCTS,
      adverseRecord: standing.current.adverseRecord,
      benchmarkGaps: gaps,
    };
    const momentum = computeMomentum(inputs);
    const incomeQuality = computeIncomeQuality(transactions);
    const spendingProfile = computeSpendingProfile(transactions);
    const obligations = detectObligations(transactions);
    const incomeFloor = computeIncomeFloor(transactions);
    // Reuses the obligations already detected above rather than re-detecting, so "committed"
    // here and the evidenced debt service can never disagree about what counts as recurring.
    const expenseStructure = computeExpenseStructure(transactions, obligations.obligations);
    return {
      profile,
      score,
      dataConfidence,
      coverage,
      coachInput,
      momentum,
      incomeQuality,
      spendingProfile,
      obligations,
      incomeFloor,
      expenseStructure,
      standing,
      benchmark,
      gaps,
    };
  }, [
    transactions,
    snapshots,
    allocations,
    accounts,
    balanceEntries,
    accountValues,
    repaymentSummary,
    loanApplications,
    repayments,
    householdProfile,
    guideCity,
  ]);
}
