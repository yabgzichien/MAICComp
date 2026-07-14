import { assembleCredit, type CreditInputs } from '../src/lib/assembleCredit';
import { detectObligations } from '../src/lib/obligations';
import { buildPassportDraft } from '../src/lib/consentScopes';
import type { Transaction, Account } from '../src/lib/types';

let seq = 0;
function txn(date: string, amount: number, type: 'income' | 'expense'): Transaction {
  seq += 1;
  return {
    id: String(seq),
    merchantRaw: `M${seq}`,
    merchantKey: `m${seq}`,
    amount,
    currency: 'MYR',
    type,
    date,
    categoryId: type === 'income' ? 'inc' : 'exp',
    createdAt: `${date}T12:00:00.000Z`,
    source: 'extracted',
  };
}

function inputsOf(transactions: Transaction[]): CreditInputs {
  return {
    transactions,
    snapshotMonths: [],
    allocations: {},
    accounts: [],
    balanceEntries: [],
    accountValues: {},
    repaymentSummary: { onTime: 0, total: 0 },
  };
}

describe('assembleCredit', () => {
  // UI/UX P2.9: profile.monthlyDebtService (the DSR factor's figure) and the passport
  // ceremony's assessment.monthlyDebtService (consentScopes.ts) must always agree  they
  // used to come from two different computations (a liabilities heuristic vs evidenced
  // obligations), so the same claim could show two different numbers on two screens.
  describe('monthlyDebtService  single source of truth (UI/UX P2.9)', () => {
    it('prefers the evidenced sum of detected recurring obligations when any exist', () => {
      const recurring: Transaction[] = [];
      for (let m = 0; m < 4; m++) {
        recurring.push(txn(`2026-0${3 + m}-05`, 70, 'expense')); // same merchant key below
      }
      // Give them a shared merchant so detectObligations groups them into one obligation.
      recurring.forEach((t) => (t.merchantKey = 'tnb'));
      const input = inputsOf(recurring);
      input.accounts = [
        { id: 'a1', name: 'Car Loan', kind: 'liability', cls: 'car_loan', archived: false, createdAt: '2026-01-01T00:00:00.000Z', sub: null, symbol: null, ticker: null, quantity: null, cost: null } as Account,
      ];
      input.accountValues = { a1: 10000 }; // heuristic would be 10000*0.03 = 300, obligations = 70

      const result = assembleCredit(input, new Date('2026-06-10T12:00:00.000Z'));
      const obligations = detectObligations(recurring);
      expect(obligations.obligations.length).toBeGreaterThan(0);
      expect(result.profile.monthlyDebtService).toBeCloseTo(obligations.evidencedMonthlyDebtService, 5);
      expect(result.profile.monthlyDebtService).not.toBeCloseTo(300, 0); // not the heuristic
    });

    it('falls back to the liabilities heuristic when no obligations are detected', () => {
      const input = inputsOf([txn('2026-06-05', 40, 'expense')]); // one-off, never recurs
      input.accounts = [
        { id: 'a1', name: 'Car Loan', kind: 'liability', cls: 'car_loan', archived: false, createdAt: '2026-01-01T00:00:00.000Z', sub: null, symbol: null, ticker: null, quantity: null, cost: null } as Account,
      ];
      input.accountValues = { a1: 10000 };

      const result = assembleCredit(input, new Date('2026-06-10T12:00:00.000Z'));
      expect(result.profile.monthlyDebtService).toBeCloseTo(300, 5); // 10000 * 0.03
    });

    it('cross-screen consistency: the passport ceremony assessment cites the same figure as the DSR factor', () => {
      const recurring: Transaction[] = [];
      for (let m = 0; m < 3; m++) recurring.push(txn(`2026-0${4 + m}-05`, 89, 'expense'));
      recurring.forEach((t) => (t.merchantKey = 'unifi'));
      const input = inputsOf(recurring);

      const result = assembleCredit(input, new Date('2026-06-10T12:00:00.000Z'));
      const obligations = detectObligations(recurring);
      const draft = buildPassportDraft({
        profile: result.profile,
        score: result.score,
        dataConfidence: result.dataConfidence,
        coverage: result.coverage,
        momentum: null,
        amounts: recurring.map((t) => t.amount),
        identity: null,
        includeIdentity: false,
        incomeQuality: { variationCoefficient: 0, sourceCount: 0, regularityRatio: 0, seasonal: false },
        obligations,
        spendingProfile: { essentialsRatio: 0, expenseVolatility: 0, bufferDays: 0, savingsRate: 0 },
        occupation: null,
        includeSpending: false,
      });

      expect(draft.assessment).toBeDefined();
      expect(draft.assessment!.monthlyDebtService).toBe(result.profile.monthlyDebtService);
    });
  });

  it('excludes transactions dated after the as-of date', () => {
    const input = inputsOf([
      txn('2026-04-10', 100, 'expense'),
      txn('2026-05-10', 100, 'expense'),
      txn('2026-06-10', 100, 'expense'),
    ]);

    const early = assembleCredit(input, new Date('2026-04-15T12:00:00.000Z'));
    const late = assembleCredit(input, new Date('2026-06-15T12:00:00.000Z'));

    // As-of mid-April only the first transaction exists; by mid-June all three do.
    expect(early.coverage.daysCovered).toBe(1);
    expect(late.coverage.daysCovered).toBe(3);
  });
});
