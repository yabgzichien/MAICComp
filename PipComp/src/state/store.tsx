import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addCategory as dbAddCategory, deleteCategory as dbDeleteCategory, listCategories } from '../db/categoriesRepo';
import { DEFAULT_EXPENSE_ID, DEFAULT_INCOME_ID } from '../data/categories';
import { getMemoryMap, upsertMemory } from '../db/memoryRepo';
import {
  addTransactions,
  deleteTransaction,
  deleteTransactions,
  listTransactions,
  updateTransactionAmount,
  updateTransactionFields,
  type NewTxn,
} from '../db/txnRepo';
import {
  getExpectedIncome,
  getAllocations,
  setExpectedIncome,
  setAllocations as dbSetAllocations,
  getAdvice as dbGetAdvice,
  setAdvice as dbSetAdvice,
  clearBudget,
  getSnapshots,
  upsertSnapshot,
} from '../db/budgetRepo';
import { resetAllData as dbResetAllData } from '../db/db';
import { DEMO_PROFILES, loadDemoProfile, type DemoProfileId } from '../data/demoProfile';
import {
  addAccount as dbAddAccount,
  addBalanceEntry as dbAddBalanceEntry,
  addHolding as dbAddHolding,
  deleteAccount as dbDeleteAccount,
  getPriceCache,
  listAccounts,
  listBalanceEntries,
  updateAccount as dbUpdateAccount,
  updateHoldingQuantity as dbUpdateHoldingQuantity,
  updateHoldingCost as dbUpdateHoldingCost,
  upsertDailyBalanceEntry,
  upsertPrice,
} from '../db/accountsRepo';
import {
  createSplit as dbCreateSplit,
  deleteSplitsForTxns as dbDeleteSplitsForTxns,
  findOrCreatePerson as dbFindOrCreatePerson,
  listPayments as dbListPayments,
  listPeople as dbListPeople,
  listShares as dbListShares,
  listSplits as dbListSplits,
  recordPayment as dbRecordPayment,
  renamePerson as dbRenamePerson,
  writeOffShare as dbWriteOffShare,
} from '../db/splitRepo';
import { openReceivableTotal, outstanding, type OpenShare } from '../lib/split';
import { refreshPrices as fetchPrices } from '../prices';
import {
  listProducts as dbListProducts,
  createApplication as dbCreateApplication,
  listApplications as dbListApplications,
  deleteApplication as dbDeleteApplication,
  scheduleRepayments as dbScheduleRepayments,
  insertSchedule as dbInsertSchedule,
  setLoanLiabilityAccount as dbSetLoanLiabilityAccount,
  markRepaymentPaid as dbMarkRepaymentPaid,
  markRepaymentMissed as dbMarkRepaymentMissed,
  markApplicationDefaulted as dbMarkApplicationDefaulted,
  setRepaymentOutcome as dbSetRepaymentOutcome,
  listRepayments as dbListRepayments,
  repaymentSummary as dbRepaymentSummary,
  type LoanApplication,
  type Repayment,
  type RepaymentSummary,
} from '../db/loansRepo';
import { DEFAULT_PRODUCTS, decideLoan, type LoanDecision, type LoanProduct } from '../lib/loans';
import { computeRepaymentStanding, overdueRowsFor } from '../lib/repaymentStanding';
import { buildBookedLoan, outstandingAfter } from '../lib/acceptOffer';
import type { DirectApplyDecision } from '../lib/directApply';
import { fetchLenderDirectory, LENDER_API_BASE, type LenderProfile } from '../lib/lenderDirectory';
// `pendingOffers` is aliased: the store holds state of the same name, which would shadow it.
import { offerToDecision, parseOffer, pendingOffers as offersAwaitingResponse, respondToOffer, type Offer } from '../lib/offers';
import { applicationsClearedByReset, clearedLoanMessage, parseResetMarker } from '../lib/resetSync';
import type { DeclaredPurpose } from '../lib/loanPurpose';
import { mergeLoanWithServicing, servicingWritePayload } from '../lib/servicingSync';
import type { ServicingRecord } from '../lib/mergeServicing';
import { getOrCreateKeypair, rotateKeypair } from '../crypto/keys';
import type { CreditBand } from '../lib/creditScore';
import { budgetHash, monthKey } from '../lib/budget';
import { computeCoverage, type Coverage } from '../lib/coverage';
import { getKyc, setKyc, type KycIdentity } from '../db/kycRepo';
import { getOccupation, setOccupation as dbSetOccupation, type Occupation } from '../db/occupationRepo';
import { getMeta, setMeta } from '../db/metaRepo';
import { MockEkycProvider } from '../ekyc/mock';
import type { EkycResult } from '../ekyc/types';
import { BORROWER_TOUR_STEPS, clampTourStep, stepsForBranch, type TourBranch } from '../lib/tourSteps';
import { emitTourSignal } from '../lib/tourSignals';
import { DEFAULT_GUIDE_CITY, DEFAULT_HOUSEHOLD_PROFILE } from '../lib/belanjawanku';
import { DEFAULT_SAVINGS_TARGET } from '../lib/savingsHabit';
import { isReminderCadence, type ReminderCadence } from '../lib/reminders';
import { GUIDE_CITIES, HOUSEHOLD_PROFILES, type GuideCityId, type HouseholdProfileId } from '../data/belanjawanku';
import { syncStreakWidget } from '../widget/syncStreakWidget';

const ONBOARDING_KEY = 'onboarding_complete';
const TOUR_ACTIVE_KEY = 'tour_active';
const TOUR_STEP_KEY = 'tour_step_index';
const TOUR_BRANCH_KEY = 'tour_branch';
// Which demo persona (if any) is currently loaded — lets the KYC screen prefill identity +
// work & income for a zero-typing demo run (see loadDemoData below). Null for a real user.
const ACTIVE_DEMO_PROFILE_KEY = 'active_demo_profile';
// Which Belanjawanku household category and city the borrower's budget is benchmarked against,
// and the monthly amount they committed to keeping back. Preferences, not ledger data, so they
// live in app_meta rather than earning a table of their own.
const HOUSEHOLD_PROFILE_KEY = 'belanjawanku_household';
const GUIDE_CITY_KEY = 'belanjawanku_city';
const SAVINGS_TARGET_KEY = 'savings_target';
// Local reminder preferences. Both default to off so the OS permission prompt only ever
// appears because the user reached for it in Settings. Deliberately survive `resetAllData`,
// `resetToOnboarding` and demo-profile loads: this is how the owner of the phone wants to be
// interrupted, not persona data, and having a demo reset silently unsubscribe them would be a
// surprise they would not think to look for.
const REMINDER_CADENCE_KEY = 'reminder_cadence';
const OWED_REMINDER_KEY = 'owed_reminder_on';
import { applyEffect, currentValue, RECEIVABLE_CLS, type LinkEffect } from '../lib/networth';
import { holdingValue, isHolding, mergeAccountValues } from '../lib/prices';
import { merchantKey } from '../lib/normalize';
import {
  DROP,
  type Account,
  type AccountKind,
  type BalanceEntry,
  type Category,
  type ExtractedTxn,
  type MemoryMap,
  type PaymentEvidence,
  type Person,
  type PriceQuote,
  type Split,
  type SplitDraft,
  type SplitPayment,
  type SplitShare,
  type Transaction,
  type TxnSource,
  type TxnType,
} from '../lib/types';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface NewLearned {
  merchant: string;
  categoryId: string;
}

/**
 * Make the "Owed to me" account equal what the open shares actually add up to.
 *
 * The receivable is derived state that has to live in a table so the rest of Net Worth (class
 * grouping, the history series, the balance sheet) can treat it like any other asset. Deriving
 * it fresh on every load is what keeps that shortcut honest: the split records are the truth,
 * and the account is only ever their shadow. The account is not created until there is
 * something to owe, so a user who never splits a bill never sees the line.
 *
 * Returns whether anything moved, so the caller knows to refetch accounts and entries.
 */
async function reconcileReceivable(shareRows: SplitShare[], accts: Account[]): Promise<boolean> {
  const total = openReceivableTotal(shareRows);
  const existing = accts.find((a) => a.cls === RECEIVABLE_CLS && !a.archived);

  if (!existing) {
    if (total <= 0) return false;
    await dbAddAccount('Owed to me', 'asset', RECEIVABLE_CLS, total, todayKey(), null);
    return true;
  }

  const mine = (await listBalanceEntries()).filter((e) => e.accountId === existing.id);
  if (Math.round(currentValue(mine) * 100) === Math.round(total * 100)) return false;
  await upsertDailyBalanceEntry(existing.id, total, todayKey());
  return true;
}

/** An offer waiting on the borrower, paired with the lender who made it (borrower acceptance,
 *  2026-07-21). The lender profile rides along because accepting needs that lender's product
 *  ladder to build the repayment schedule, and the UI needs its name and brand colour. */
export interface PendingOffer {
  offer: Offer;
  lender: LenderProfile;
}

interface AppData {
  ready: boolean;
  categories: Category[];
  catById: Record<string, Category>;
  transactions: Transaction[];
  memory: MemoryMap;
  expectedIncome: number;
  allocations: Record<string, number>;
  snapshots: Record<string, { income: number; allocations: Record<string, number> }>;
  hasBudget: boolean;
  accounts: Account[];
  balanceEntries: BalanceEntry[];
  prices: Record<string, PriceQuote>;
  accountValues: Record<string, number>;
  pricesAsOf: string | null;
  loanProducts: LoanProduct[];
  loanApplications: LoanApplication[];
  repayments: Repayment[];
  repaymentSummary: RepaymentSummary;
  /** 90-day data-coverage signal, recomputed from `transactions`. See `lib/coverage.ts`. */
  coverage: Coverage;
  /** Verified identity (eKYC), or null when not yet verified. */
  kyc: KycIdentity | null;
  /** Run eKYC for the given name + IC; on success persists + binds the verified identity. */
  verifyIdentity: (fullName: string, nric: string) => Promise<EkycResult>;
  /** Self-declared occupation context (Brief P), or null when not yet provided. */
  occupation: Occupation | null;
  /** Persist the borrower's self-declared occupation context. */
  saveOccupation: (o: Occupation) => Promise<void>;
  /** Whether the one-time setup has been completed (with or without eKYC). */
  onboardingComplete: boolean;
  /** Mark the one-time setup complete. */
  completeOnboarding: () => Promise<void>;
  /** Judge guided tour (2026-07-12 spec): active + current step, persisted so a mid-tour
   *  refresh resumes where it left off. */
  tourActive: boolean;
  tourStepIndex: number;
  /** The judge stepped into the real app mid-tour: no card on screen, but the run is still
   *  theirs to resume. In-memory only, exactly like the resume chip it drives — after a reload
   *  there is no run to resume, and a lock outliving its own tour would be a dead control with
   *  nothing on screen to explain it. */
  tourPaused: boolean;
  /** A tour run is in progress, whether or not its card is showing. This — not `tourActive` —
   *  is what the real screens gate their off-script controls on (the send button, the offer's
   *  "No thanks"), because pausing must not be a way to walk around the script. */
  tourRunning: boolean;
  /** Which ending the cross-app script is running, or null before the application is sent. */
  tourBranch: TourBranch | null;
  setTourBranch: (branch: TourBranch | null) => Promise<void>;
  /** Start the tour. `fresh: true` restarts from step 0 (Settings "Restart judge tour");
   *  omitted, it resumes from whatever step was last persisted. */
  startTour: (opts?: { fresh?: boolean }) => Promise<void>;
  /** Move to an explicit step index (Back/Next). */
  setTourStep: (index: number) => Promise<void>;
  /** Ends the tour without clearing the step, so a paused tour can resume where it left off. */
  pauseTour: () => Promise<void>;
  /** Ends the tour and marks it seen  never auto-re-prompted (Exit). */
  exitTour: () => Promise<void>;
  refreshAll: () => Promise<void>;
  addCategory: (label: string, icon: string, hue: number, kind: Category['kind']) => Promise<string>;
  deleteCategory: (id: string) => Promise<void>;
  commitCategorized: (
    items: ExtractedTxn[],
    assignments: (string | null)[],
    source?: TxnSource,
    /** Parallel to `items`: a split to attach to that row, or null. A split row saves at its
     *  `ownShare`, not the extracted amount, and the gross is kept on the split record. */
    splitDrafts?: (SplitDraft | null)[]
  ) => Promise<{ created: Transaction[]; newLearned: NewLearned[] }>;
  /** People you split bills with, remembered locally so totals can roll up per person. */
  people: Person[];
  splits: Split[];
  shares: SplitShare[];
  splitPayments: SplitPayment[];
  /** Unsettled shares joined with the person and the bill behind them, ready to match a
   *  repayment against or to list on the Owed screen. */
  openShares: OpenShare[];
  /** Remember a name (or return the one already saved under it, case-insensitively). */
  addPerson: (name: string) => Promise<Person>;
  renamePerson: (id: string, name: string) => Promise<void>;
  /** Split a transaction already in the ledger: its amount drops to the payer's own share. */
  splitTransaction: (txn: Transaction, draft: SplitDraft) => Promise<void>;
  /** Undo a split, restoring the transaction to the full amount that left the account. */
  unsplitTransaction: (txn: Transaction) => Promise<void>;
  /** Record money received against a share. Never writes an income row: it moves cash against
   *  the receivable, which is what being paid back actually is. */
  settleShare: (
    shareId: string,
    amount: number,
    paidOn: string,
    evidence: PaymentEvidence,
    matchedMerchant: string | null,
    accountId: string | null
  ) => Promise<void>;
  /** Give up on a share: the uncollected money becomes the payer's own expense after all. */
  writeOffShare: (shareId: string) => Promise<void>;
  saveTransactionEdits: (
    txn: Transaction,
    edits: { amount: number; type: TxnType; categoryId: string; remark?: string | null }
  ) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  saveBudget: (income: number, allocations: Record<string, number>) => Promise<void>;
  resetBudget: () => Promise<void>;
  resetAllData: () => Promise<void>;
  /** Wipe all data AND reset onboarding so the setup wizard re-appears. */
  resetToOnboarding: () => Promise<void>;
  loadDemoData: (profile?: DemoProfileId) => Promise<void>;
  /** Which demo persona is currently loaded (null for a real user's own data). Drives the KYC
   *  screen's identity + work & income prefill so a demo run needs zero typing. */
  activeDemoProfile: DemoProfileId | null;
  /** Which Belanjawanku household category and city the budget is benchmarked against. */
  householdProfile: HouseholdProfileId;
  guideCity: GuideCityId;
  setBenchmarkProfile: (profile: HouseholdProfileId, city: GuideCityId) => Promise<void>;
  /** Monthly pay-yourself-first commitment. Motivation only, never a credit signal. */
  savingsTarget: number;
  setSavingsTarget: (amount: number) => Promise<void>;
  /** How often to nudge about logging spending. `'off'` disables the reminder entirely. */
  reminderCadence: ReminderCadence;
  setReminderCadence: (cadence: ReminderCadence) => Promise<void>;
  /** Whether to chase debts that have aged past `AGING_DAYS`, weekly. */
  owedReminderEnabled: boolean;
  setOwedReminderEnabled: (on: boolean) => Promise<void>;
  addAccount: (name: string, kind: AccountKind, cls: string, openingValue: number, asOf: string, icon?: string | null) => Promise<void>;
  /** Returns a default account id for the add flows, creating a "Cash" account if none exist. */
  ensureDefaultAccount: () => Promise<string>;
  updateAccount: (id: string, fields: { name: string; cls: string; icon?: string | null }) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setBalance: (accountId: string, value: number, asOf: string) => Promise<void>;
  recordBalanceLink: (accountId: string, amount: number, effect: LinkEffect, asOf: string) => Promise<void>;
  addHolding: (name: string, sub: string, symbol: string, ticker: string, quantity: number, cost: number | null, icon?: string | null) => Promise<void>;
  updateHoldingQuantity: (id: string, quantity: number) => Promise<void>;
  setHoldingCost: (id: string, cost: number | null) => Promise<void>;
  refreshPrices: () => Promise<void>;
  getCachedAdvice: () => Promise<{ hash: string; text: string } | null>;
  saveAdvice: (income: number, allocations: Record<string, number>, text: string) => Promise<void>;
  applyForLoan: (
    productId: string,
    requestedAmount: number,
    decisionInputs: {
      score: number;
      band: CreditBand;
      confidence: number;
      avgMonthlySurplus: number;
      monthlyDebtService: number;
      avgIncome: number;
      integrityFloorBreached?: boolean;
    }
  ) => Promise<{ application: LoanApplication; decision: LoanDecision }>;
  recordRepayment: (repaymentId: string, onTime: boolean) => Promise<void>;
  /** Mark a single installment missed  a track-record negative that does not pay down the
   *  loan liability. Distinct from `reportDefault` (whole-loan). */
  missRepayment: (repaymentId: string) => Promise<void>;
  reportDefault: (applicationId: string) => Promise<void>;
  /** Pay off every currently-overdue instalment on one loan in one step (2026-07-21 design):
   *  restores standing to clean immediately, though the cure stays visible as a scar for 12
   *  months. Distinct from `recordRepayment` (one row)  this settles every overdue row at once. */
  clearArrears: (applicationId: string) => Promise<void>;
  /** Book an approved lender offer locally: create an application + schedule (using the
   *  lender's decided installment) attributed to the lender. Returns null if the offer
   *  isn't bookable (not an approval, non-positive amount, or no matching product). */
  acceptLenderOffer: (
    offer: DirectApplyDecision,
    lender: { id?: string; products: LoanProduct[]; name: string },
    scoreAt: number,
    purpose?: DeclaredPurpose,
    /** The lender's own tenor for this offer; overrides the amount-derived tier lookup. */
    tenorMonths?: number
  ) => Promise<LoanApplication | null>;
  /** Pull every lender-routed loan's shared servicing record and merge server-side
   *  repayment/default events into the local schedule (Bidirectional Servicing Sync,
   *  2026-07-18 design)  called on My Financing focus. Best-effort: an unreachable console
   *  degrades silently, same posture as direct-apply. */
  pullServicing: () => Promise<void>;
  /** Offers a lender has approved and published that this borrower has NOT yet accepted or
   *  declined (borrower acceptance, 2026-07-21). This is the borrower's decision queue, and
   *  its length is the red badge on the Loan tab. Refreshed by `refreshPendingOffers`. */
  pendingOffers: PendingOffer[];
  /** Poll every published lender for offers awaiting this borrower's decision. Called on Home
   *  and My Financing focus, and on an interval while either is open. Best-effort: an
   *  unreachable console leaves the current list alone rather than emptying it. */
  refreshPendingOffers: () => Promise<void>;
  /** Take up an offer: tells the lender the borrower accepted, then books the financing
   *  locally (schedule + Net-worth liability). Returns false if the lender couldn't be told
   *  nothing is booked in that case, so the two sides can't disagree about whether a loan
   *  exists. `currentScore` is the score the loan is recorded against. */
  acceptPendingOffer: (offer: Offer, currentScore: number) => Promise<boolean>;
  /** Turn an offer down. Tells the lender, then drops it from the decision queue. Nothing is
   *  booked. Returns false if the lender couldn't be reached. */
  declinePendingOffer: (offer: Offer) => Promise<boolean>;
  /** Poll every lender this borrower has a loan with for a reset marker (data-consistency
   *  follow-up, 2026-07-20): if that lender's console was reset since the loan was booked,
   *  removes it locally (application, repayments, and its Net-worth liability account) so the
   *  two apps can't drift into permanent disagreement about whether the loan exists. Sets
   *  `clearedByLenderNotice` when anything was actually removed. Best-effort, same posture as
   *  every other lender-facing poll here. */
  syncLenderResets: () => Promise<void>;
  /** Ready-to-display banner text for a just-detected lender-side reset that removed one or
   *  more of this borrower's loans, or null when there's nothing to show. */
  clearedByLenderNotice: string | null;
  /** Dismiss the reset notice banner. */
  dismissClearedByLenderNotice: () => void;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [memory, setMemory] = useState<MemoryMap>({});
  const [expectedIncome, setIncome] = useState(0);
  const [allocations, setAlloc] = useState<Record<string, number>>({});
  const [snapshots, setSnapshots] = useState<Record<string, { income: number; allocations: Record<string, number> }>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balanceEntries, setBalanceEntries] = useState<BalanceEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [shares, setShares] = useState<SplitShare[]>([]);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceQuote>>({});
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [repaymentSummaryState, setRepaymentSummaryState] = useState<RepaymentSummary>({
    onTime: 0,
    total: 0,
    missed: 0,
  });
  // Offers a lender has approved but this borrower hasn't answered yet (borrower acceptance,
  // 2026-07-21). In-memory only: the lender's offer record is the source of truth for what is
  // still open, so this is always re-derived from a poll rather than persisted and reconciled.
  const [pendingOffers, setPendingOffers] = useState<PendingOffer[]>([]);
  // Banner text for a just-detected lender-side reset that removed one or more local loans
  // (data-consistency follow-up, 2026-07-20). In-memory only, not persisted: it's a live-event
  // notice for whichever sync run just found it, not app state to restore across a reload.
  const [clearedByLenderNotice, setClearedByLenderNotice] = useState<string | null>(null);
  const [kyc, setKycState] = useState<KycIdentity | null>(null);
  const [occupation, setOccupationState] = useState<Occupation | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [activeDemoProfile, setActiveDemoProfileState] = useState<DemoProfileId | null>(null);
  const [householdProfile, setHouseholdProfileState] = useState<HouseholdProfileId>(DEFAULT_HOUSEHOLD_PROFILE);
  const [guideCity, setGuideCityState] = useState<GuideCityId>(DEFAULT_GUIDE_CITY);
  const [savingsTarget, setSavingsTargetState] = useState<number>(DEFAULT_SAVINGS_TARGET);
  const [reminderCadence, setReminderCadenceState] = useState<ReminderCadence>('off');
  const [owedReminderEnabled, setOwedReminderEnabledState] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourPaused, setTourPaused] = useState(false);
  const [tourStepIndex, setTourStepIndexState] = useState(0);
  const [tourBranch, setTourBranchState] = useState<TourBranch | null>(null);
  /** Mirrors `tourBranch` for synchronous reads  see `setTourStep`. */
  const tourBranchRef = useRef<TourBranch | null>(null);

  const refreshAll = useCallback(async () => {
    const [cats, txns, mem, income, alloc, snaps, accts, entries, cache, products, applications, allRepayments, repSummary, kycRow, onboardingFlag, tourActiveFlag, tourStepRaw, activeDemoProfileRaw, tourBranchRaw, householdRaw, cityRaw, savingsTargetRaw, reminderCadenceRaw, owedReminderRaw, peopleRows, splitRows, shareRows, paymentRows] =
      await Promise.all([
        listCategories(),
        listTransactions(),
        getMemoryMap(),
        getExpectedIncome(),
        getAllocations(),
        getSnapshots(),
        listAccounts(),
        listBalanceEntries(),
        getPriceCache(),
        dbListProducts(),
        dbListApplications(),
        dbListRepayments(),
        dbRepaymentSummary(),
        getKyc(),
        getMeta(ONBOARDING_KEY),
        getMeta(TOUR_ACTIVE_KEY),
        getMeta(TOUR_STEP_KEY),
        getMeta(ACTIVE_DEMO_PROFILE_KEY),
        getMeta(TOUR_BRANCH_KEY),
        getMeta(HOUSEHOLD_PROFILE_KEY),
        getMeta(GUIDE_CITY_KEY),
        getMeta(SAVINGS_TARGET_KEY),
        getMeta(REMINDER_CADENCE_KEY),
        getMeta(OWED_REMINDER_KEY),
        dbListPeople(),
        dbListSplits(),
        dbListShares(),
        dbListPayments(),
      ]);
    // A stale or hand-edited preference falls back to the default rather than breaking Budget.
    setHouseholdProfileState(
      HOUSEHOLD_PROFILES.some((p) => p.id === householdRaw)
        ? (householdRaw as HouseholdProfileId)
        : DEFAULT_HOUSEHOLD_PROFILE
    );
    setGuideCityState(
      GUIDE_CITIES.some((c) => c.id === cityRaw) ? (cityRaw as GuideCityId) : DEFAULT_GUIDE_CITY
    );
    const parsedTarget = savingsTargetRaw === null ? NaN : Number(savingsTargetRaw);
    setSavingsTargetState(
      Number.isFinite(parsedTarget) && parsedTarget >= 0 ? parsedTarget : DEFAULT_SAVINGS_TARGET
    );
    // An unreadable cadence falls back to off rather than to a guess: silence is the safe
    // failure mode for something that interrupts the user.
    setReminderCadenceState(isReminderCadence(reminderCadenceRaw) ? reminderCadenceRaw : 'off');
    setOwedReminderEnabledState(owedReminderRaw === 'true');
    setOccupationState(await getOccupation());
    setKycState(kycRow);
    setOnboardingComplete(onboardingFlag === 'true');
    setActiveDemoProfileState(
      DEMO_PROFILES.some((p) => p.id === activeDemoProfileRaw) ? (activeDemoProfileRaw as DemoProfileId) : null
    );
    setTourActive(tourActiveFlag === 'true');
    const branch = (['referred', 'approved', 'declined'] as const).find((b) => b === tourBranchRaw) ?? null;
    tourBranchRef.current = branch;
    setTourBranchState(branch);
    setTourStepIndexState(
      clampTourStep(tourStepRaw ? Number(tourStepRaw) || 0 : 0, stepsForBranch(BORROWER_TOUR_STEPS, branch).length)
    );
    setCategories(cats);
    setTransactions(txns);
    setMemory(mem);
    setIncome(income);
    setAlloc(alloc);
    setPeople(peopleRows);
    setSplits(splitRows);
    setShares(shareRows);
    setSplitPayments(paymentRows);
    // The receivable account is derived state that happens to live in a table, so it is
    // re-asserted on every load rather than trusted: a hand-edited balance, or a wipe that
    // took the shares but left the account, self-corrects here instead of drifting.
    const receivableMoved = await reconcileReceivable(shareRows, accts);
    const [finalAccts, finalEntries] = receivableMoved
      ? await Promise.all([listAccounts(), listBalanceEntries()])
      : [accts, entries];
    setAccounts(finalAccts);
    setBalanceEntries(finalEntries);
    setPrices(Object.fromEntries(cache.map((q) => [q.symbol, q])));
    setLoanProducts(products);
    setLoanApplications(applications);
    setRepayments(allRepayments);
    setRepaymentSummaryState(repSummary);

    // Backfill the current month's snapshot if a budget exists but none was
    // recorded yet (e.g. budget set before this feature shipped), so the recap
    // always has a target for the running month.
    const cur = monthKey(new Date().toISOString())!;
    const hasPlan = income > 0 || Object.keys(alloc).length > 0;
    if (hasPlan && !snaps[cur]) {
      await upsertSnapshot(cur, income, alloc);
      snaps[cur] = { income, allocations: alloc };
    }
    setSnapshots(snaps);
  }, []);

  useEffect(() => {
    refreshAll()
      .catch((e) => console.warn('Failed to load app data', e))
      .finally(() => setReady(true));
  }, [refreshAll]);

  useEffect(() => {
    if (!ready) return;
    syncStreakWidget(transactions).catch(() => {});
  }, [ready, transactions]);

  // Targeted refresh for loan actions: only the three loan-derived slices change
  // (applications, repayments, the on-time/total summary)  refetching the other
  // ~10 pieces of state via `refreshAll` would be wasted work. Mirrors the
  // narrowly-scoped refetches in `saveTransactionEdits`/`addAccount`. Products are
  // static after seeding (see db.ts's `init`), so they're intentionally excluded.
  const refreshLoanState = useCallback(async () => {
    const [applications, allRepayments, repSummary] = await Promise.all([
      dbListApplications(),
      dbListRepayments(),
      dbRepaymentSummary(),
    ]);
    setLoanApplications(applications);
    setRepayments(allRepayments);
    setRepaymentSummaryState(repSummary);
  }, []);

  /**
   * Targeted refresh for split actions, mirroring `refreshLoanState`. Accounts and balance
   * entries come along because every split action moves the receivable, and a settlement moves
   * the account the money landed in too.
   */
  const refreshSplitState = useCallback(async () => {
    const [peopleRows, splitRows, shareRows, paymentRows, accts] = await Promise.all([
      dbListPeople(),
      dbListSplits(),
      dbListShares(),
      dbListPayments(),
      listAccounts(),
    ]);
    setPeople(peopleRows);
    setSplits(splitRows);
    setShares(shareRows);
    setSplitPayments(paymentRows);
    await reconcileReceivable(shareRows, accts);
    const [finalAccts, finalEntries] = await Promise.all([listAccounts(), listBalanceEntries()]);
    setAccounts(finalAccts);
    setBalanceEntries(finalEntries);
  }, []);

  const catById = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const c of categories) map[c.id] = c;
    return map;
  }, [categories]);

  /** Open shares, joined once here so the matching and the Owed screen read the same rows. */
  const openShares = useMemo<OpenShare[]>(() => {
    const txnById: Record<string, Transaction> = {};
    for (const t of transactions) txnById[t.id] = t;
    const splitById: Record<string, Split> = {};
    for (const s of splits) splitById[s.id] = s;
    const personById: Record<string, Person> = {};
    for (const p of people) personById[p.id] = p;

    return shares
      .filter((s) => s.status === 'open')
      .map((s) => {
        const txn = txnById[splitById[s.splitId]?.txnId ?? ''];
        return {
          shareId: s.id,
          personId: s.personId,
          personName: personById[s.personId]?.name ?? 'Someone',
          outstanding: outstanding(s),
          billDate: txn?.date ?? txn?.createdAt ?? null,
          merchant: txn?.merchantRaw ?? 'A shared bill',
        };
      })
      .filter((s) => s.outstanding > 0);
  }, [shares, splits, transactions, people]);

  // Value per account: qty × live price for holdings, else its latest balance entry.
  const accountValues = useMemo(
    () => mergeAccountValues(accounts, balanceEntries, prices),
    [accounts, balanceEntries, prices]
  );

  const pricesAsOf = useMemo(() => {
    const times = Object.values(prices).map((q) => q.asOf);
    return times.length ? times.sort()[times.length - 1] : null;
  }, [prices]);

  const addCategory = useCallback(
    async (label: string, icon: string, hue: number, kind: Category['kind']) => {
      const created = await dbAddCategory(label, icon, hue, kind);
      setCategories(await listCategories());
      return created.id;
    },
    []
  );

  const deleteCategory = useCallback(async (id: string) => {
    await dbDeleteCategory(id);
    const [cats, txns, mem, alloc] = await Promise.all([
      listCategories(),
      listTransactions(),
      getMemoryMap(),
      getAllocations(),
    ]);
    setCategories(cats);
    setTransactions(txns);
    setMemory(mem);
    setAlloc(alloc);
  }, []);

  const commitCategorized = useCallback(
    async (
      items: ExtractedTxn[],
      assignments: (string | null)[],
      source: TxnSource = 'extracted',
      splitDrafts?: (SplitDraft | null)[]
    ) => {
      const newLearned: NewLearned[] = [];
      const toInsert: NewTxn[] = [];
      // Parallel to `toInsert` rather than to `items`: dropped rows never reach the insert, so
      // the two arrays would fall out of step if this were indexed off the original items.
      const draftFor: (SplitDraft | null)[] = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const a = assignments[i];
        if (a === DROP) continue; // user chose not to record this item

        const categoryId = a ?? (it.type === 'income' ? DEFAULT_INCOME_ID : DEFAULT_EXPENSE_ID);
        const key = merchantKey(it.merchant);
        const draft = splitDrafts?.[i] ?? null;

        // Learn the merchant -> category for both expenses and income, only if merchant is non-empty.
        if (key) {
          if (!(key in memory)) newLearned.push({ merchant: it.merchant, categoryId });
          await upsertMemory(key, categoryId);
        }

        toInsert.push({
          merchantRaw: it.merchant,
          merchantKey: key,
          // A split row records only what the payer consumed. The full amount that left the
          // account is kept on the split, so the screenshot line stays reconstructable and the
          // row can honestly keep its `extracted` provenance.
          amount: draft ? draft.ownShare : it.amount,
          type: it.type,
          date: it.date,
          categoryId,
          source,
          remark: it.remark,
        });
        draftFor.push(draft);
      }

      const created = await addTransactions(toInsert);

      let splitCount = 0;
      for (let i = 0; i < created.length; i++) {
        const draft = draftFor[i];
        if (!draft || draft.shares.length === 0) continue;
        await dbCreateSplit(created[i].id, draft);
        splitCount++;
      }

      const [txns, mem] = await Promise.all([listTransactions(), getMemoryMap()]);
      setTransactions(txns);
      setMemory(mem);
      if (splitCount > 0) await refreshSplitState();

      return { created, newLearned };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memory]
  );

  const saveTransactionEdits = useCallback(
    async (
      txn: Transaction,
      edits: { amount: number; type: TxnType; categoryId: string; remark?: string | null }
    ) => {
      await updateTransactionFields(txn.id, edits.amount, edits.type, edits.categoryId, edits.remark);
      // Correcting a category re-teaches Pip for that merchant (expense or income), only if merchant is non-empty.
      if (txn.merchantKey) {
        await upsertMemory(txn.merchantKey, edits.categoryId);
      }
      const [txns, mem] = await Promise.all([listTransactions(), getMemoryMap()]);
      setTransactions(txns);
      setMemory(mem);
    },
    []
  );

  // Deleting a transaction takes its split with it: a receivable with no bill behind it is a
  // claim on nothing, and leaving the shares would keep inflating net worth forever.
  const removeTransaction = useCallback(async (id: string) => {
    await deleteTransaction(id);
    await dbDeleteSplitsForTxns([id]);
    setTransactions(await listTransactions());
    await refreshSplitState();
  }, [refreshSplitState]);

  const removeMany = useCallback(async (ids: string[]) => {
    await deleteTransactions(ids);
    await dbDeleteSplitsForTxns(ids);
    setTransactions(await listTransactions());
    await refreshSplitState();
  }, [refreshSplitState]);

  const addPerson = useCallback(
    async (name: string) => {
      const person = await dbFindOrCreatePerson(name);
      setPeople(await dbListPeople());
      return person;
    },
    []
  );

  const renamePerson = useCallback(async (id: string, name: string) => {
    await dbRenamePerson(id, name);
    setPeople(await dbListPeople());
  }, []);

  /**
   * Split a transaction that is already in the ledger. The row drops to the payer's own share
   * and the rest becomes a receivable, so the same bill now reads as what was consumed rather
   * than what was fronted.
   */
  const splitTransaction = useCallback(
    async (txn: Transaction, draft: SplitDraft) => {
      await updateTransactionAmount(txn.id, draft.ownShare);
      await dbCreateSplit(txn.id, draft);
      setTransactions(await listTransactions());
      await refreshSplitState();
    },
    [refreshSplitState]
  );

  /** Undo a split, putting the whole amount that left the account back on the row. */
  const unsplitTransaction = useCallback(
    async (txn: Transaction) => {
      const split = splits.find((s) => s.txnId === txn.id);
      if (!split) return;
      await updateTransactionAmount(txn.id, split.gross);
      await dbDeleteSplitsForTxns([txn.id]);
      setTransactions(await listTransactions());
      await refreshSplitState();
    },
    [splits, refreshSplitState]
  );

  /**
   * Record money received against a share.
   *
   * No income transaction is written, on purpose. Being paid back is not earnings, it is a
   * receivable converting into cash, and booking it as income would inflate avgIncome and
   * incomeMonths, both of which feed the credit score directly. The cash side is a balance
   * movement on whichever account the money landed in; passing no account leaves the cash to
   * arrive with the next balance scan instead.
   */
  const settleShare = useCallback(
    async (
      shareId: string,
      amount: number,
      paidOn: string,
      evidence: PaymentEvidence,
      matchedMerchant: string | null,
      accountId: string | null
    ) => {
      const result = await dbRecordPayment(shareId, amount, paidOn, evidence, matchedMerchant, accountId);
      if (!result) return;
      if (accountId) {
        const entries = await listBalanceEntries();
        const mine = entries.filter((e) => e.accountId === accountId);
        const latestAsOf = mine.reduce((m, e) => (e.asOf > m ? e.asOf : m), '');
        await dbAddBalanceEntry(
          accountId,
          applyEffect(currentValue(mine), amount, 'add'),
          paidOn > latestAsOf ? paidOn : latestAsOf
        );
      }
      await refreshSplitState();
    },
    [refreshSplitState]
  );

  /**
   * Give up on a share. The money that never came back was consumption after all, so it becomes
   * a real expense dated today, carrying the original bill's category, and the share is stamped
   * with that transaction so the write-off stays traceable.
   */
  const writeOffShare = useCallback(
    async (shareId: string) => {
      const share = shares.find((s) => s.id === shareId);
      if (!share || share.status !== 'open') return;
      const amount = outstanding(share);
      if (amount <= 0) return;

      const split = splits.find((s) => s.id === share.splitId);
      const origin = split ? transactions.find((t) => t.id === split.txnId) : undefined;
      const person = people.find((p) => p.id === share.personId);

      const [created] = await addTransactions([
        {
          merchantRaw: origin?.merchantRaw ?? 'Written-off split',
          merchantKey: origin?.merchantKey ?? 'written-off split',
          amount,
          type: 'expense',
          date: todayKey(),
          categoryId: origin?.categoryId ?? DEFAULT_EXPENSE_ID,
          source: 'manual',
          remark: person ? `Written off: ${person.name} never paid this back` : 'Written-off split',
        },
      ]);
      await dbWriteOffShare(shareId, created.id);
      setTransactions(await listTransactions());
      await refreshSplitState();
    },
    [shares, splits, transactions, people, refreshSplitState]
  );

  const saveBudget = useCallback(async (income: number, alloc: Record<string, number>) => {
    await setExpectedIncome(income);
    await dbSetAllocations(alloc);
    // Keep the current month's snapshot in step with the live plan.
    const cur = monthKey(new Date().toISOString())!;
    await upsertSnapshot(cur, income, alloc);
    setIncome(income);
    setAlloc(alloc);
    setSnapshots((prev) => ({ ...prev, [cur]: { income, allocations: alloc } }));
  }, []);

  const setBenchmarkProfile = useCallback(async (profile: HouseholdProfileId, city: GuideCityId) => {
    await setMeta(HOUSEHOLD_PROFILE_KEY, profile);
    await setMeta(GUIDE_CITY_KEY, city);
    setHouseholdProfileState(profile);
    setGuideCityState(city);
  }, []);

  const setSavingsTarget = useCallback(async (amount: number) => {
    const clean = Math.max(0, Math.round(amount));
    await setMeta(SAVINGS_TARGET_KEY, String(clean));
    setSavingsTargetState(clean);
  }, []);

  const setReminderCadence = useCallback(async (cadence: ReminderCadence) => {
    await setMeta(REMINDER_CADENCE_KEY, cadence);
    setReminderCadenceState(cadence);
  }, []);

  const setOwedReminderEnabled = useCallback(async (on: boolean) => {
    await setMeta(OWED_REMINDER_KEY, on ? 'true' : 'false');
    setOwedReminderEnabledState(on);
  }, []);

  const resetBudget = useCallback(async () => {
    await clearBudget();
    setIncome(0);
    setAlloc({});
  }, []);

  const resetAllData = useCallback(async () => {
    await dbResetAllData();
    // No demo persona's data survives a wipe — clear the flag so the KYC screen doesn't
    // prefill a stale persona's identity over whatever the user enters next.
    await setMeta(ACTIVE_DEMO_PROFILE_KEY, '');
    setActiveDemoProfileState(null);
    await refreshAll();
  }, [refreshAll]);

  const resetToOnboarding = useCallback(async () => {
    await dbResetAllData();
    await setMeta(ONBOARDING_KEY, 'false');
    await setMeta(ACTIVE_DEMO_PROFILE_KEY, '');
    // dbResetAllData now also clears the kyc/occupation rows; mirror that in memory so the
    // wizard re-appears with a clean identity rather than a stale one from the prior session.
    setKycState(null);
    setOccupationState(null);
    setActiveDemoProfileState(null);
    setOnboardingComplete(false);
  }, []);

  /**
   * Load a demo persona, replacing everything the previous one left behind.
   *
   * The wipe and the key rotation are both load-bearing, and neither used to happen when the
   * Settings persona picker called this (only the "Reset demo" row wiped first). Without the
   * wipe, switching personas ADDED the new seed on top of the old one, so a loan taken as Ravi
   * was still sitting in Aina's My Financing. Without the rotation, the local wipe alone
   * wouldn't be enough: every lender-side store is keyed by the passport subject hash, so the
   * new persona would inherit the old one's applications, pending offers, and servicing ledger
   * from the console the moment it polled. Two personas are two different people.
   *
   * `pendingOffers` is cleared in the same breath — it's in-memory state the wipe can't reach,
   * and an offer made to the outgoing persona is not the incoming one's to accept.
   */
  const loadDemoData = useCallback(async (profile?: DemoProfileId) => {
    const id = profile ?? 'aina';
    await dbResetAllData();
    await rotateKeypair();
    setPendingOffers([]);
    await loadDemoProfile(id);
    await setMeta(ACTIVE_DEMO_PROFILE_KEY, id);
    setActiveDemoProfileState(id);
    // Budgeting preferences are per-person too, so they follow the wipe. Leaving the previous
    // persona's household, city and savings target behind is the same leak `rotateKeypair` above
    // exists to prevent: a "clean" persona would silently be measured against someone else's
    // household and judged against a target they never set.
    await setMeta(HOUSEHOLD_PROFILE_KEY, DEFAULT_HOUSEHOLD_PROFILE);
    await setMeta(GUIDE_CITY_KEY, DEFAULT_GUIDE_CITY);
    await setMeta(SAVINGS_TARGET_KEY, String(DEFAULT_SAVINGS_TARGET));
    await refreshAll();
  }, [refreshAll]);

  const addAccount = useCallback(
    async (name: string, kind: AccountKind, cls: string, openingValue: number, asOf: string, icon?: string | null) => {
      await dbAddAccount(name, kind, cls, openingValue, asOf, icon);
      const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
      setAccounts(accts);
      setBalanceEntries(entries);
    },
    []
  );

  // Every transaction is tied to an account now, so the add flows need a guaranteed
  // default. Prefer an existing cash account; otherwise create a "Cash" one (opening
  // balance 0, dated today). Returns the account id to preselect.
  const ensureDefaultAccount = useCallback(async (): Promise<string> => {
    const activeAccts = accounts.filter((a) => !a.archived);
    const existing = activeAccts.find((a) => a.cls === 'cash') ?? activeAccts[0];
    if (existing) return existing.id;
    const created = await dbAddAccount('Cash', 'asset', 'cash', 0, new Date().toISOString().slice(0, 10), null);
    const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
    setAccounts(accts);
    setBalanceEntries(entries);
    return created.id;
  }, [accounts]);

  const updateAccount = useCallback(async (id: string, fields: { name: string; cls: string; icon?: string | null }) => {
    await dbUpdateAccount(id, fields);
    setAccounts(await listAccounts());
  }, []);

  const deleteAccount = useCallback(async (id: string) => {
    await dbDeleteAccount(id);
    const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
    setAccounts(accts);
    setBalanceEntries(entries);
  }, []);

  const setBalance = useCallback(async (accountId: string, value: number, asOf: string) => {
    await dbAddBalanceEntry(accountId, value, asOf);
    setBalanceEntries(await listBalanceEntries());
  }, []);

  // A linked transaction nudges an account's balance: new = current ± amount.
  const recordBalanceLink = useCallback(
    async (accountId: string, amount: number, effect: LinkEffect, asOf: string) => {
      const entries = await listBalanceEntries();
      const mine = entries.filter((e) => e.accountId === accountId);
      const current = currentValue(mine);
      // The adjustment must become the account's CURRENT reading, otherwise net worth
      // (which reads the latest-dated entry) won't move. A linked txn is often dated
      // in the past — a scanned statement, or a back-dated manual entry — and stamping
      // the new entry at that past date would let an existing, more-recent reading
      // shadow it. So never date it before the latest reading we already have.
      const latestAsOf = mine.reduce((m, e) => (e.asOf > m ? e.asOf : m), '');
      const effectiveAsOf = asOf > latestAsOf ? asOf : latestAsOf;
      await dbAddBalanceEntry(accountId, applyEffect(current, amount, effect), effectiveAsOf);
      setBalanceEntries(await listBalanceEntries());
    },
    []
  );

  const addHolding = useCallback(
    async (name: string, sub: string, symbol: string, ticker: string, quantity: number, cost: number | null, icon?: string | null) => {
      await dbAddHolding(name, sub, symbol, ticker, quantity, cost, icon);
      setAccounts(await listAccounts());
    },
    []
  );

  const updateHoldingQuantity = useCallback(async (id: string, quantity: number) => {
    await dbUpdateHoldingQuantity(id, quantity);
    setAccounts(await listAccounts());
  }, []);

  const setHoldingCost = useCallback(async (id: string, cost: number | null) => {
    await dbUpdateHoldingCost(id, cost);
    setAccounts(await listAccounts());
  }, []);

  // Fetch live prices for all holdings, cache them, and snapshot today's value
  // for each holding so the net-worth history keeps building.
  const refreshPrices = useCallback(async () => {
    const accts = await listAccounts();
    const quotes = await fetchPrices(accts);
    if (quotes.length === 0) return;
    const day = todayKey();
    for (const q of quotes) await upsertPrice(q);
    const bySymbol: Record<string, PriceQuote> = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
    for (const a of accts) {
      if (isHolding(a) && bySymbol[a.symbol as string]) {
        await upsertDailyBalanceEntry(a.id, holdingValue(a.quantity as number, bySymbol[a.symbol as string].priceMYR), day);
      }
    }
    const [cache, entries] = await Promise.all([getPriceCache(), listBalanceEntries()]);
    setPrices((prev) => ({ ...prev, ...Object.fromEntries(cache.map((q) => [q.symbol, q])) }));
    setBalanceEntries(entries);
  }, []);

  const getCachedAdvice = useCallback(() => dbGetAdvice(), []);

  const saveAdvice = useCallback(
    async (income: number, alloc: Record<string, number>, text: string) => {
      await dbSetAdvice(budgetHash(income, alloc), text);
    },
    []
  );

  // Decide and persist a loan application for a specific product the user picked.
  // We resolve the requested product and evaluate `decideLoan` against just that one tier
  // (rather than the full ladder): the user is applying for a specific offer, so the
  // decision should reflect whether *that* product is appropriate for them  not silently
  // upgrade/downgrade them to a different tier than the one they asked for. `decideLoan`
  // picks the highest tier the score qualifies for among the `products` it's given, so
  // passing only the requested product makes it evaluate "does this applicant qualify for
  // *this* product" (decline if their score is below this tier's minScore) rather than
  // "what's the best tier for this applicant overall".
  const applyForLoan = useCallback(
    async (
      productId: string,
      requestedAmount: number,
      decisionInputs: {
        score: number;
        band: CreditBand;
        confidence: number;
        avgMonthlySurplus: number;
        monthlyDebtService: number;
        avgIncome: number;
        integrityFloorBreached?: boolean;
      }
    ) => {
      const products = loanProducts.length > 0 ? loanProducts : await dbListProducts();
      const product = products.find((p) => p.id === productId);
      if (!product) throw new Error(`Unknown loan product: ${productId}`);

      const cov = computeCoverage(transactions);
      const standing = computeRepaymentStanding(
        loanApplications.map((a) => ({
          applicationId: a.id,
          repayments: repayments.filter((r) => r.applicationId === a.id),
          defaulted: a.status === 'defaulted',
        }))
      );
      const decision = decideLoan({
        score: decisionInputs.score,
        band: decisionInputs.band,
        confidence: decisionInputs.confidence,
        avgMonthlySurplus: decisionInputs.avgMonthlySurplus,
        monthlyDebtService: decisionInputs.monthlyDebtService,
        avgIncome: decisionInputs.avgIncome,
        requestedAmount,
        products: [product],
        coverageRatio: cov.ratio,
        coverageDaysCovered: cov.daysCovered,
        integrityFloorBreached: decisionInputs.integrityFloorBreached,
        adverseRecord: standing.current.adverseRecord,
      });

      const application = await dbCreateApplication(productId, requestedAmount, decision, decisionInputs.score);

      if (decision.decision === 'approve' && decision.maxAmount > 0) {
        const startDate = todayKey();
        await dbScheduleRepayments(application.id, decision.maxAmount, product.apr, product.tenorMonths, startDate);
      }

      await refreshLoanState();
      return { application, decision };
    },
    [loanProducts, refreshLoanState, transactions, loanApplications, repayments]
  );

  // Book an approved lender offer locally. The lender already decided the installment, so we
  // persist that exact schedule (via `buildBookedLoan` + `dbInsertSchedule`) rather than
  // recomputing it, and attribute the application to the lender's name. Feeds the borrower's
  // real track record (repayment history) the same way `applyForLoan` does.
  const acceptLenderOffer = useCallback(
    async (
      offer: DirectApplyDecision,
      lender: { id?: string; products: LoanProduct[]; name: string },
      scoreAt: number,
      purpose?: DeclaredPurpose,
      tenorMonths?: number
    ): Promise<LoanApplication | null> => {
      const booked = buildBookedLoan(offer, lender.products, new Date(), tenorMonths);
      if (!booked) return null;
      const application = await dbCreateApplication(booked.productId, booked.principal, offer, scoreAt, lender.name, lender.id ?? null, purpose ?? null);
      await dbInsertSchedule(application.id, booked.schedule);
      // Represent the loan as a declining liability on the Net Worth screen (same convention the
      // demo seed uses for its motor loan). Opening balance = principal; each repayment pays it
      // down a straight-line slice. Linked to the application so recordRepayment can find it.
      const liability = await dbAddAccount(`${lender.name} loan`, 'liability', 'personal', booked.principal, todayKey());
      await dbSetLoanLiabilityAccount(application.id, liability.id);
      await refreshLoanState();
      const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
      setAccounts(accts);
      setBalanceEntries(entries);
      return application;
    },
    [refreshLoanState]
  );

  const completeOnboarding = useCallback(async () => {
    await setMeta(ONBOARDING_KEY, 'true');
    setOnboardingComplete(true);
  }, []);

  // Steps are indexed against the BRANCH-FILTERED run, not the raw registry: once the
  // application has been sent, the three endings' handoff steps are no longer interchangeable
  // and the raw registry contains steps this run will never show. `stepsForBranch` guarantees
  // the filtered run shares an unbranched prefix with the unfiltered one, so a saved index
  // stays meaningful across the moment the branch is decided.
  //
  // The clamp reads the branch through a REF, not the state variable. Sending the application
  // latches the branch and advances the tour in the same tick, and a `useCallback` closure
  // would still hold the pre-send `null` at that moment — clamping the new handoff step (index
  // 15) against the 15-step unbranched run and snapping the judge straight back onto the send
  // button they just pressed.
  const setTourStep = useCallback(async (index: number) => {
    const clamped = clampTourStep(index, stepsForBranch(BORROWER_TOUR_STEPS, tourBranchRef.current).length);
    await setMeta(TOUR_STEP_KEY, String(clamped));
    setTourStepIndexState(clamped);
  }, []);

  /** Latch which ending the script is running. Called once, when the application's verdict
   *  comes back from the lender  the branch is real state, never a persona guess. */
  const setTourBranch = useCallback(async (branch: TourBranch | null) => {
    tourBranchRef.current = branch;
    await setMeta(TOUR_BRANCH_KEY, branch ?? '');
    setTourBranchState(branch);
  }, []);

  const startTour = useCallback(async (opts?: { fresh?: boolean }) => {
    if (opts?.fresh) {
      await setMeta(TOUR_STEP_KEY, '0');
      // A fresh run has not asked any lender for anything yet, so it has no ending. Leaving a
      // previous run's branch latched would resume act 6 on the wrong handoff.
      await setMeta(TOUR_BRANCH_KEY, '');
      tourBranchRef.current = null;
      setTourStepIndexState(0);
      setTourBranchState(null);
    }
    await setMeta(TOUR_ACTIVE_KEY, 'true');
    setTourActive(true);
    setTourPaused(false);
  }, []);

  const pauseTour = useCallback(async () => {
    await setMeta(TOUR_ACTIVE_KEY, 'false');
    setTourActive(false);
    setTourPaused(true);
  }, []);

  const exitTour = useCallback(async () => {
    await setMeta(TOUR_ACTIVE_KEY, 'false');
    await setMeta(TOUR_STEP_KEY, '0');
    await setMeta(TOUR_BRANCH_KEY, '');
    tourBranchRef.current = null;
    setTourActive(false);
    setTourPaused(false);
    setTourStepIndexState(0);
    setTourBranchState(null);
  }, []);

  const verifyIdentity = useCallback(async (fullName: string, nric: string): Promise<EkycResult> => {
    const result = await MockEkycProvider.verify({ fullName, nric });
    if (result.verified && result.fullName && result.nricMasked) {
      const identity = {
        fullName: result.fullName,
        nricMasked: result.nricMasked,
        provider: result.provider,
        verifiedAt: new Date().toISOString(),
      };
      await setKyc(identity);
      setKycState({ ...identity, status: 'verified' });
      emitTourSignal('kyc-verified');
    }
    return result;
  }, []);

  const saveOccupation = useCallback(async (o: Occupation): Promise<void> => {
    await dbSetOccupation(o);
    setOccupationState(o);
  }, []);

  // The borrower's own subject id (Bidirectional Servicing Sync, 2026-07-18 design): the
  // same Ed25519 public key the passport is signed under, stable across app restarts. Never
  // cached here  getOrCreateKeypair() already memoizes its own init promise, so repeated
  // calls are cheap.
  const getSubject = useCallback(async (): Promise<string> => (await getOrCreateKeypair()).publicKeyHex, []);

  /** Write-through one repayment/default action to the shared servicing ledger, best-effort:
   *  fire-and-forget, never blocks or reverts the local update already applied  offline
   *  degrades silently, same posture as direct-apply. A no-op for a self-decided application
   *  with no lenderId (servicingWritePayload returns null). */
  const writeThroughServicing = useCallback(
    async (application: LoanApplication, loanRepayments: Repayment[], write: { event: { instalmentSeq: number; outcome: 'on-time' | 'late' | 'missed' } } | { default: true }) => {
      const subject = await getSubject();
      const tenorMonths = loanRepayments.length;
      const installment = loanRepayments[0]?.amount ?? 0;
      const payload = servicingWritePayload(subject, application, tenorMonths, installment, write);
      if (!payload) return;
      fetch(`${LENDER_API_BASE}/api/servicing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
    },
    [getSubject]
  );

  const recordRepayment = useCallback(
    async (repaymentId: string, onTime: boolean) => {
      await dbMarkRepaymentPaid(repaymentId, onTime);

      // Pay down the loan's Net-worth liability by one straight-line principal slice. The
      // in-memory `repayments` list is still pre-update here, so the count of already-settled
      // installments plus this one gives how many are now paid.
      const repayment = repayments.find((r) => r.id === repaymentId);
      const application = repayment ? loanApplications.find((a) => a.id === repayment.applicationId) : undefined;
      const loanRepayments = application ? repayments.filter((r) => r.applicationId === application.id) : [];
      if (application?.liabilityAccountId) {
        const productList = loanProducts.length > 0 ? loanProducts : DEFAULT_PRODUCTS;
        const tenor = productList.find((p) => p.id === application.productId)?.tenorMonths ?? 0;
        const paidBefore = loanRepayments.filter((r) => r.status === 'paid' || r.status === 'late').length;
        const outstanding = outstandingAfter(application.requestedAmount, tenor, paidBefore + 1);
        await upsertDailyBalanceEntry(application.liabilityAccountId, outstanding, todayKey());
      }
      if (application && repayment) {
        const instalmentSeq = loanRepayments.findIndex((r) => r.id === repaymentId) + 1;
        if (instalmentSeq > 0) writeThroughServicing(application, loanRepayments, { event: { instalmentSeq, outcome: onTime ? 'on-time' : 'late' } });
      }

      await refreshLoanState();
      const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
      setAccounts(accts);
      setBalanceEntries(entries);
    },
    [refreshLoanState, repayments, loanApplications, loanProducts, writeThroughServicing]
  );

  /** Pay off every currently-overdue instalment on one loan in a single tap (2026-07-21 design),
   *  reusing `recordRepayment`'s liability-paydown + servicing write-through pattern batched over
   *  every overdue row. Each row is marked `onTime: false` since it's after the due date, so it
   *  resolves to `status: 'late'`  not a new outcome, just the existing recordRepayment path
   *  applied to every overdue row on this loan at once. */
  const clearArrears = useCallback(
    async (applicationId: string) => {
      const application = loanApplications.find((a) => a.id === applicationId);
      if (!application) return;
      const loanRepayments = repayments.filter((r) => r.applicationId === applicationId);
      const overdue = overdueRowsFor(loanRepayments, new Date());
      if (overdue.length === 0) return;

      for (const row of overdue) {
        await dbMarkRepaymentPaid(row.id, false); // after due date -> 'late', not 'paid'
      }

      if (application.liabilityAccountId) {
        const productList = loanProducts.length > 0 ? loanProducts : DEFAULT_PRODUCTS;
        const tenor = productList.find((p) => p.id === application.productId)?.tenorMonths ?? 0;
        const paidBefore = loanRepayments.filter((r) => r.status === 'paid' || r.status === 'late').length;
        const outstanding = outstandingAfter(application.requestedAmount, tenor, paidBefore + overdue.length);
        await upsertDailyBalanceEntry(application.liabilityAccountId, outstanding, todayKey());
      }

      for (const row of overdue) {
        const instalmentSeq = loanRepayments.findIndex((r) => r.id === row.id) + 1;
        if (instalmentSeq > 0) writeThroughServicing(application, loanRepayments, { event: { instalmentSeq, outcome: 'late' } });
      }

      await refreshLoanState();
      const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
      setAccounts(accts);
      setBalanceEntries(entries);
    },
    [refreshLoanState, repayments, loanApplications, loanProducts, writeThroughServicing]
  );

  // Skip an installment: a track-record negative (the score reads it via repaymentSummary),
  // but it does NOT pay down the liability  the borrower didn't pay.
  const missRepayment = useCallback(
    async (repaymentId: string) => {
      await dbMarkRepaymentMissed(repaymentId);
      const repayment = repayments.find((r) => r.id === repaymentId);
      const application = repayment ? loanApplications.find((a) => a.id === repayment.applicationId) : undefined;
      if (application && repayment) {
        const loanRepayments = repayments.filter((r) => r.applicationId === application.id);
        const instalmentSeq = loanRepayments.findIndex((r) => r.id === repaymentId) + 1;
        if (instalmentSeq > 0) writeThroughServicing(application, loanRepayments, { event: { instalmentSeq, outcome: 'missed' } });
      }
      await refreshLoanState();
    },
    [refreshLoanState, repayments, loanApplications, writeThroughServicing]
  );

  const reportDefault = useCallback(
    async (applicationId: string) => {
      const now = new Date().toISOString();
      await dbMarkApplicationDefaulted(applicationId, 'borrower', now);
      // TODO(Phase 2+): also notify the CTOS mock connector once it lands.
      const application = loanApplications.find((a) => a.id === applicationId);
      if (application) {
        const loanRepayments = repayments.filter((r) => r.applicationId === applicationId);
        writeThroughServicing(application, loanRepayments, { default: true });
      }
      await refreshLoanState();
    },
    [refreshLoanState, loanApplications, repayments, writeThroughServicing]
  );

  /** Poll-on-focus (2026-07-18 design): pull every lender-routed loan's shared servicing
   *  record and merge server-side events/default into the local schedule  a lender-recorded
   *  miss or default now surfaces here. Best-effort per loan; one unreachable/malformed GET
   *  never blocks the rest. */
  const pullServicing = useCallback(async () => {
    const lenderRouted = loanApplications.filter((a) => a.lenderId);
    if (lenderRouted.length === 0) return;
    const subject = await getSubject();

    let anyChanged = false;
    for (const application of lenderRouted) {
      try {
        const res = await fetch(`${LENDER_API_BASE}/api/servicing?subject=${encodeURIComponent(subject)}&lender=${encodeURIComponent(application.lenderId!)}`);
        if (!res.ok) continue;
        const record: ServicingRecord | null = await res.json();
        if (!record) continue;
        const loanRepayments = repayments.filter((r) => r.applicationId === application.id);
        const result = mergeLoanWithServicing(subject, application, loanRepayments, record);
        if (!result.changed) continue;
        anyChanged = true;
        for (const u of result.repaymentUpdates) await dbSetRepaymentOutcome(u.repaymentId, u.outcome, u.at);
        if (result.newDefault) await dbMarkApplicationDefaulted(application.id, result.newDefault.source, result.newDefault.at);
      } catch {
        // offline/malformed  this loan's servicing state just stays whatever it was locally.
      }
    }
    if (anyChanged) await refreshLoanState();
  }, [loanApplications, repayments, getSubject, refreshLoanState]);

  /** Poll every lender this borrower has a loan with for a reset marker (data-consistency
   *  follow-up, 2026-07-20): if that lender's console was reset since the loan was booked,
   *  removes it locally  the application, its repayments, and the Net-worth liability account
   *  it created  so the two apps can't drift into permanent disagreement about whether the
   *  loan still exists. A fresh apply booked AFTER the reset (against the now-clean console)
   *  is left alone; `applicationsClearedByReset` is what draws that line. Naturally idempotent
   *  (deleting an already-deleted row/account is a harmless no-op), so unlike
   *  `adoptApprovedOffers` this doesn't need a re-entrancy latch  there's no new resource a
   *  duplicate run could double-create. Best-effort per lender, same degrade-silently posture
   *  as `pullServicing`. */
  const syncLenderResets = useCallback(async () => {
    const lenderIds = Array.from(new Set(loanApplications.filter((a) => a.lenderId).map((a) => a.lenderId as string)));
    if (lenderIds.length === 0) return;

    const toDelete: LoanApplication[] = [];
    for (const lenderId of lenderIds) {
      try {
        const res = await fetch(`${LENDER_API_BASE}/api/reset?lender=${encodeURIComponent(lenderId)}`);
        if (!res.ok) continue;
        const marker = parseResetMarker(await res.json());
        if (!marker) continue;
        toDelete.push(...applicationsClearedByReset(marker, lenderId, loanApplications));
      } catch {
        // offline/malformed  this lender's loans just stay as they are locally.
      }
    }
    if (toDelete.length === 0) return;

    for (const app of toDelete) {
      await dbDeleteApplication(app.id);
      if (app.liabilityAccountId) await dbDeleteAccount(app.liabilityAccountId);
    }
    await refreshLoanState();
    const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
    setAccounts(accts);
    setBalanceEntries(entries);
    setClearedByLenderNotice(clearedLoanMessage(toDelete.map((a) => a.lenderLabel ?? 'Your lender')));
  }, [loanApplications, refreshLoanState]);

  const dismissClearedByLenderNotice = useCallback(() => setClearedByLenderNotice(null), []);

  // Coalesces concurrent refreshes: Home and My Financing both poll, and a fast Home→Loan
  // navigation fires two within a tick. A concurrent caller AWAITS the in-flight run rather
  // than returning early, so a screen that refreshes and then reads `pendingOffers` never
  // renders its empty state against a list that is still loading.
  const refreshingOffersRef = useRef<Promise<void> | null>(null);

  /**
   * Poll every published lender for offers still awaiting this borrower's decision (borrower
   * acceptance, 2026-07-21).
   *
   * This replaces the old `adoptApprovedOffers`, which BOOKED whatever it found: a loan could
   * appear in My Financing, with a schedule and a liability on the borrower's net worth,
   * without them ever having agreed to it. An approval is an offer, so the poll now only fills
   * the decision queue — `acceptPendingOffer` is the one path that books anything.
   *
   * Best-effort throughout: an unreachable console leaves the existing list alone rather than
   * emptying it, so a dropped tick never makes a real waiting offer vanish from the badge.
   */
  const refreshPendingOffers = useCallback(async () => {
    if (refreshingOffersRef.current) return refreshingOffersRef.current;
    const run = (async () => {
      const dir = await fetchLenderDirectory();
      const realLenders = dir.lenders.filter((l) => l.id !== 'offline');
      if (realLenders.length === 0) return;
      const subject = await getSubject();

      const found: PendingOffer[] = [];
      let reachedAny = false;
      for (const lender of realLenders) {
        try {
          const res = await fetch(`${LENDER_API_BASE}/api/offers?subject=${encodeURIComponent(subject)}&lender=${encodeURIComponent(lender.id)}`);
          if (!res.ok) continue;
          reachedAny = true;
          const offer = parseOffer(await res.json());
          if (offer) found.push({ offer, lender });
        } catch {
          // offline/malformed for this lender  just skip it.
        }
      }
      // Every lender unreachable → keep what we had. Distinguishing this from a genuine
      // "nothing is waiting" is the whole point: silently clearing the badge on a flaky
      // connection would lose the borrower an offer they still need to answer.
      if (!reachedAny) return;

      // Dedupe reads applications fresh from the DB rather than the React closure, so an offer
      // accepted moments ago on another screen is already excluded on this tick.
      const existing = await dbListApplications();
      const stillOpen = offersAwaitingResponse(found.map((f) => f.offer), existing);
      const openIds = new Set(stillOpen.map((o) => o.lenderId));
      setPendingOffers(found.filter((f) => openIds.has(f.offer.lenderId)));
    })();
    refreshingOffersRef.current = run;
    run
      .finally(() => {
        if (refreshingOffersRef.current === run) refreshingOffersRef.current = null;
      })
      .catch(() => {});
    return run;
  }, [getSubject]);

  /** Take up an offer. The lender is told FIRST and the loan is only booked if that write
   *  lands: booking against a lender who still thinks the offer is open would leave the
   *  borrower with a loan the console shows as never accepted, which is exactly the kind of
   *  two-sided disagreement `syncLenderResets` exists to clean up after. */
  const acceptPendingOffer = useCallback(
    async (offer: Offer, currentScore: number): Promise<boolean> => {
      const lender = pendingOffers.find((p) => p.offer.lenderId === offer.lenderId)?.lender;
      if (!lender) return false;
      const told = await respondToOffer(LENDER_API_BASE, { subject: offer.subject, lenderId: offer.lenderId, response: 'accepted' });
      if (!told) return false;
      const app = await acceptLenderOffer(
        offerToDecision(offer),
        { id: lender.id, products: lender.products, name: lender.name },
        currentScore,
        offer.purpose,
        offer.tenorMonths
      );
      setPendingOffers((cur) => cur.filter((p) => p.offer.lenderId !== offer.lenderId));
      // Fired only once the lender has recorded the answer AND the loan is booked, so the
      // tour's act-9 do-step can never celebrate an acceptance that did not actually land.
      if (app !== null) emitTourSignal('offer-accepted');
      return app !== null;
    },
    [pendingOffers, acceptLenderOffer]
  );

  /** Turn an offer down. Nothing local is created; the lender records the decline so the file
   *  stops sitting in their "awaiting borrower" queue. */
  const declinePendingOffer = useCallback(async (offer: Offer): Promise<boolean> => {
    const told = await respondToOffer(LENDER_API_BASE, { subject: offer.subject, lenderId: offer.lenderId, response: 'declined' });
    if (!told) return false;
    setPendingOffers((cur) => cur.filter((p) => p.offer.lenderId !== offer.lenderId));
    return true;
  }, []);

  const coverage = useMemo(() => computeCoverage(transactions), [transactions]);

  const value: AppData = {
    kyc,
    verifyIdentity,
    occupation,
    saveOccupation,
    onboardingComplete,
    completeOnboarding,
    tourActive,
    tourPaused,
    tourRunning: tourActive || tourPaused,
    tourStepIndex,
    tourBranch,
    setTourBranch,
    startTour,
    setTourStep,
    pauseTour,
    exitTour,
    ready,
    categories,
    catById,
    transactions,
    memory,
    expectedIncome,
    allocations,
    snapshots,
    hasBudget: expectedIncome > 0 || Object.keys(allocations).length > 0,
    accounts,
    balanceEntries,
    prices,
    accountValues,
    pricesAsOf,
    loanProducts,
    loanApplications,
    repayments,
    repaymentSummary: repaymentSummaryState,
    coverage,
    refreshAll,
    addCategory,
    deleteCategory,
    commitCategorized,
    saveTransactionEdits,
    removeTransaction,
    removeMany,
    people,
    splits,
    shares,
    splitPayments,
    openShares,
    addPerson,
    renamePerson,
    splitTransaction,
    unsplitTransaction,
    settleShare,
    writeOffShare,
    saveBudget,
    resetBudget,
    resetAllData,
    resetToOnboarding,
    loadDemoData,
    activeDemoProfile,
    householdProfile,
    guideCity,
    setBenchmarkProfile,
    savingsTarget,
    setSavingsTarget,
    reminderCadence,
    setReminderCadence,
    owedReminderEnabled,
    setOwedReminderEnabled,
    addAccount,
    ensureDefaultAccount,
    updateAccount,
    deleteAccount,
    setBalance,
    recordBalanceLink,
    addHolding,
    updateHoldingQuantity,
    setHoldingCost,
    refreshPrices,
    getCachedAdvice,
    saveAdvice,
    applyForLoan,
    recordRepayment,
    missRepayment,
    reportDefault,
    clearArrears,
    acceptLenderOffer,
    pullServicing,
    pendingOffers,
    refreshPendingOffers,
    acceptPendingOffer,
    declinePendingOffer,
    syncLenderResets,
    clearedByLenderNotice,
    dismissClearedByLenderNotice,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
