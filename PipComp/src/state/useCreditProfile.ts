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
import { computeSpendingProfile, type SpendingProfile } from '../lib/spendingProfile';
import { detectObligations, type ObligationSummary } from '../lib/obligations';
import { computeRepaymentStanding, type RepaymentStanding } from '../lib/repaymentStanding';

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
  /** Current arrears state + decaying scar across every loan (2026-07-21 design). */
  standing: RepaymentStanding;
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
    const coachInput: CoachPlanInput = {
      profile,
      coverage,
      confidenceTxns,
      expenseRatio,
      products: DEFAULT_PRODUCTS,
      adverseRecord: standing.current.adverseRecord,
    };
    const momentum = computeMomentum(inputs);
    const incomeQuality = computeIncomeQuality(transactions);
    const spendingProfile = computeSpendingProfile(transactions);
    const obligations = detectObligations(transactions);
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
      standing,
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
  ]);
}
