import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { addCategory as dbAddCategory, deleteCategory as dbDeleteCategory, listCategories } from '../db/categoriesRepo';
import { DEFAULT_EXPENSE_ID, DEFAULT_INCOME_ID } from '../data/categories';
import { getMemoryMap, upsertMemory } from '../db/memoryRepo';
import {
  addTransactions,
  deleteTransaction,
  deleteTransactions,
  listTransactions,
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
import { loadDemoProfile } from '../data/demoProfile';
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
import { refreshPrices as fetchPrices } from '../prices';
import {
  listProducts as dbListProducts,
  createApplication as dbCreateApplication,
  listApplications as dbListApplications,
  scheduleRepayments as dbScheduleRepayments,
  markRepaymentPaid as dbMarkRepaymentPaid,
  markApplicationStatus as dbMarkApplicationStatus,
  listRepayments as dbListRepayments,
  repaymentSummary as dbRepaymentSummary,
  type LoanApplication,
  type Repayment,
  type RepaymentSummary,
} from '../db/loansRepo';
import { decideLoan, type LoanDecision, type LoanProduct } from '../lib/loans';
import type { CreditBand } from '../lib/creditScore';
import { budgetHash, monthKey } from '../lib/budget';
import { computeCoverage, type Coverage } from '../lib/coverage';
import { getKyc, setKyc, type KycIdentity } from '../db/kycRepo';
import { getOccupation, setOccupation as dbSetOccupation, type Occupation } from '../db/occupationRepo';
import { getMeta, setMeta } from '../db/metaRepo';
import { MockEkycProvider } from '../ekyc/mock';
import type { EkycResult } from '../ekyc/types';

const ONBOARDING_KEY = 'onboarding_complete';
import { applyEffect, currentValue, type LinkEffect } from '../lib/networth';
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
  type PriceQuote,
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
  refreshAll: () => Promise<void>;
  addCategory: (label: string, icon: string, hue: number, kind: Category['kind']) => Promise<string>;
  deleteCategory: (id: string) => Promise<void>;
  commitCategorized: (
    items: ExtractedTxn[],
    assignments: (string | null)[],
    source?: TxnSource
  ) => Promise<{ created: Transaction[]; newLearned: NewLearned[] }>;
  saveTransactionEdits: (
    txn: Transaction,
    edits: { amount: number; type: TxnType; categoryId: string }
  ) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  saveBudget: (income: number, allocations: Record<string, number>) => Promise<void>;
  resetBudget: () => Promise<void>;
  resetAllData: () => Promise<void>;
  loadDemoData: () => Promise<void>;
  addAccount: (name: string, kind: AccountKind, cls: string, openingValue: number, asOf: string) => Promise<void>;
  updateAccount: (id: string, fields: { name: string; cls: string }) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setBalance: (accountId: string, value: number, asOf: string) => Promise<void>;
  recordBalanceLink: (accountId: string, amount: number, effect: LinkEffect, asOf: string) => Promise<void>;
  addHolding: (name: string, sub: string, symbol: string, ticker: string, quantity: number, cost: number | null) => Promise<void>;
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
  reportDefault: (applicationId: string) => Promise<void>;
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
  const [prices, setPrices] = useState<Record<string, PriceQuote>>({});
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [repaymentSummaryState, setRepaymentSummaryState] = useState<RepaymentSummary>({
    onTime: 0,
    total: 0,
  });
  const [kyc, setKycState] = useState<KycIdentity | null>(null);
  const [occupation, setOccupationState] = useState<Occupation | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const refreshAll = useCallback(async () => {
    const [cats, txns, mem, income, alloc, snaps, accts, entries, cache, products, applications, allRepayments, repSummary, kycRow, onboardingFlag] =
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
      ]);
    setOccupationState(await getOccupation());
    setKycState(kycRow);
    setOnboardingComplete(onboardingFlag === 'true');
    setCategories(cats);
    setTransactions(txns);
    setMemory(mem);
    setIncome(income);
    setAlloc(alloc);
    setAccounts(accts);
    setBalanceEntries(entries);
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

  // Targeted refresh for loan actions: only the three loan-derived slices change
  // (applications, repayments, the on-time/total summary) — refetching the other
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

  const catById = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const c of categories) map[c.id] = c;
    return map;
  }, [categories]);

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
    async (items: ExtractedTxn[], assignments: (string | null)[], source: TxnSource = 'extracted') => {
      const newLearned: NewLearned[] = [];
      const toInsert: NewTxn[] = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const a = assignments[i];
        if (a === DROP) continue; // user chose not to record this item

        const categoryId = a ?? (it.type === 'income' ? DEFAULT_INCOME_ID : DEFAULT_EXPENSE_ID);
        const key = merchantKey(it.merchant);

        // Learn the merchant -> category for both expenses and income.
        if (!(key in memory)) newLearned.push({ merchant: it.merchant, categoryId });
        await upsertMemory(key, categoryId);

        toInsert.push({
          merchantRaw: it.merchant,
          merchantKey: key,
          amount: it.amount,
          type: it.type,
          date: it.date,
          categoryId,
          source,
        });
      }

      const created = await addTransactions(toInsert);

      const [txns, mem] = await Promise.all([listTransactions(), getMemoryMap()]);
      setTransactions(txns);
      setMemory(mem);

      return { created, newLearned };
    },
    [memory]
  );

  const saveTransactionEdits = useCallback(
    async (txn: Transaction, edits: { amount: number; type: TxnType; categoryId: string }) => {
      await updateTransactionFields(txn.id, edits.amount, edits.type, edits.categoryId);
      // Correcting a category re-teaches Pip for that merchant (expense or income).
      await upsertMemory(txn.merchantKey, edits.categoryId);
      const [txns, mem] = await Promise.all([listTransactions(), getMemoryMap()]);
      setTransactions(txns);
      setMemory(mem);
    },
    []
  );

  const removeTransaction = useCallback(async (id: string) => {
    await deleteTransaction(id);
    setTransactions(await listTransactions());
  }, []);

  const removeMany = useCallback(async (ids: string[]) => {
    await deleteTransactions(ids);
    setTransactions(await listTransactions());
  }, []);

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

  const resetBudget = useCallback(async () => {
    await clearBudget();
    setIncome(0);
    setAlloc({});
  }, []);

  const resetAllData = useCallback(async () => {
    await dbResetAllData();
    await refreshAll();
  }, [refreshAll]);

  const loadDemoData = useCallback(async () => {
    await loadDemoProfile();
    await refreshAll();
  }, [refreshAll]);

  const addAccount = useCallback(
    async (name: string, kind: AccountKind, cls: string, openingValue: number, asOf: string) => {
      await dbAddAccount(name, kind, cls, openingValue, asOf);
      const [accts, entries] = await Promise.all([listAccounts(), listBalanceEntries()]);
      setAccounts(accts);
      setBalanceEntries(entries);
    },
    []
  );

  const updateAccount = useCallback(async (id: string, fields: { name: string; cls: string }) => {
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
      const current = currentValue(entries.filter((e) => e.accountId === accountId));
      await dbAddBalanceEntry(accountId, applyEffect(current, amount, effect), asOf);
      setBalanceEntries(await listBalanceEntries());
    },
    []
  );

  const addHolding = useCallback(
    async (name: string, sub: string, symbol: string, ticker: string, quantity: number, cost: number | null) => {
      await dbAddHolding(name, sub, symbol, ticker, quantity, cost);
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
  // decision should reflect whether *that* product is appropriate for them — not silently
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
      });

      const application = await dbCreateApplication(productId, requestedAmount, decision, decisionInputs.score);

      if (decision.decision === 'approve' && decision.maxAmount > 0) {
        const startDate = todayKey();
        await dbScheduleRepayments(application.id, decision.maxAmount, product.apr, product.tenorMonths, startDate);
      }

      await refreshLoanState();
      return { application, decision };
    },
    [loanProducts, refreshLoanState, transactions]
  );

  const completeOnboarding = useCallback(async () => {
    await setMeta(ONBOARDING_KEY, 'true');
    setOnboardingComplete(true);
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
    }
    return result;
  }, []);

  const saveOccupation = useCallback(async (o: Occupation): Promise<void> => {
    await dbSetOccupation(o);
    setOccupationState(o);
  }, []);

  const recordRepayment = useCallback(
    async (repaymentId: string, onTime: boolean) => {
      await dbMarkRepaymentPaid(repaymentId, onTime);
      await refreshLoanState();
    },
    [refreshLoanState]
  );

  const reportDefault = useCallback(
    async (applicationId: string) => {
      await dbMarkApplicationStatus(applicationId, 'defaulted');
      // TODO(Phase 2+): also notify the CTOS mock connector once it lands.
      await refreshLoanState();
    },
    [refreshLoanState]
  );

  const coverage = useMemo(() => computeCoverage(transactions), [transactions]);

  const value: AppData = {
    kyc,
    verifyIdentity,
    occupation,
    saveOccupation,
    onboardingComplete,
    completeOnboarding,
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
    saveBudget,
    resetBudget,
    resetAllData,
    loadDemoData,
    addAccount,
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
    reportDefault,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
