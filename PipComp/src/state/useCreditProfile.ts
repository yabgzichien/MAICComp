import { useMemo } from 'react';
import { useAppData } from './store';
import type { CreditProfile, CreditScore } from '../lib/creditScore';
import type { DataConfidence } from '../lib/dataConfidence';
import type { Coverage } from '../lib/coverage';
import { DEFAULT_PRODUCTS } from '../lib/loans';
import type { CoachPlanInput } from '../lib/coachPlan';
import { assembleCredit, type CreditInputs } from '../lib/assembleCredit';
import { computeMomentum, type Momentum } from '../lib/momentum';

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
} {
  const { transactions, snapshots, allocations, accounts, balanceEntries, accountValues, repaymentSummary } =
    useAppData();

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
    const coachInput: CoachPlanInput = {
      profile,
      coverage,
      confidenceTxns,
      expenseRatio,
      products: DEFAULT_PRODUCTS,
    };
    const momentum = computeMomentum(inputs);
    return { profile, score, dataConfidence, coverage, coachInput, momentum };
  }, [transactions, snapshots, allocations, accounts, balanceEntries, accountValues, repaymentSummary]);
}
