import { FLOOR_MIN_MONTHS, computeIncomeFloor, dependableSurplus, serviceableCapacity } from '../src/lib/incomeFloor';
import { computeExpenseStructure } from '../src/lib/spendingProfile';
import { detectObligations } from '../src/lib/obligations';
import type { Transaction } from '../src/lib/types';

let seq = 0;
function txn(over: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    merchantRaw: 'Merchant',
    merchantKey: 'merchant',
    amount: 100,
    currency: 'MYR',
    type: 'expense',
    date: '2026-01-15',
    categoryId: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    source: 'extracted',
    ...over,
  };
}

/** One income row per month, so a month's total is exactly the amount given. */
function incomeMonths(amounts: number[]): Transaction[] {
  return amounts.map((amount, i) =>
    txn({
      amount,
      type: 'income',
      merchantRaw: 'GrabFood Payout',
      merchantKey: 'grabfood',
      date: `2026-${String(i + 1).padStart(2, '0')}-15`,
    })
  );
}

describe('computeIncomeFloor', () => {
  it('reports the level that actually held up, not the average', () => {
    // One catastrophic month among five good ones: the average is dragged down, but the floor
    // reports what genuinely repeated. This is the whole reason the module exists.
    const f = computeIncomeFloor(incomeMonths([300, 2000, 2100, 2200, 2300, 2400]));
    expect(f.reliable).toBe(true);
    expect(f.worst).toBe(300);
    expect(f.best).toBe(2400);
    expect(f.floor).toBeGreaterThan(f.worst);
    // …and here the floor lands ABOVE the mean, because one disaster month dragged the mean
    // below every other month. Documented behaviour, never clamped: it is the sharpest possible
    // illustration of why averaging misdescribes an uneven earner.
    expect(f.floor).toBeGreaterThan(f.average);
    expect(f.monthsAtOrAboveFloor).toBe(5);
  });

  it('counts how many months cleared the floor, for the UI claim', () => {
    const f = computeIncomeFloor(incomeMonths([1000, 2000, 2100, 2200, 2300]));
    expect(f.monthsWithIncome).toBe(5);
    expect(f.monthsAtOrAboveFloor).toBe(f.floor === 1000 ? 5 : 4);
    expect(f.monthsAtOrAboveFloor).toBeLessThanOrEqual(f.monthsWithIncome);
  });

  it('equals the income itself when every month is identical', () => {
    const f = computeIncomeFloor(incomeMonths([2000, 2000, 2000, 2000]));
    expect(f.floor).toBe(2000);
    expect(f.average).toBe(2000);
    expect(f.monthsAtOrAboveFloor).toBe(4);
  });

  it('sums multiple payouts within one month before ranking', () => {
    const t = [
      txn({ amount: 500, type: 'income', date: '2026-01-05' }),
      txn({ amount: 700, type: 'income', date: '2026-01-20' }),
      txn({ amount: 1400, type: 'income', date: '2026-02-10' }),
      txn({ amount: 1300, type: 'income', date: '2026-03-10' }),
    ];
    const f = computeIncomeFloor(t);
    expect(f.monthsWithIncome).toBe(3); // not 4 rows
    expect(f.best).toBe(1400);
    expect(f.worst).toBe(1200); // 500 + 700
  });

  it('refuses to claim a floor on thin history', () => {
    const f = computeIncomeFloor(incomeMonths([2000, 2500]));
    expect(f.reliable).toBe(false);
    expect(f.floor).toBe(0);
    expect(f.monthsAtOrAboveFloor).toBe(0);
    // …but still reports what it legitimately observed, so the UI can show progress.
    expect(f.monthsWithIncome).toBe(2);
    expect(f.average).toBe(2250);
  });

  it('claims a floor at exactly the minimum months', () => {
    const f = computeIncomeFloor(incomeMonths(Array(FLOOR_MIN_MONTHS).fill(1800)));
    expect(f.reliable).toBe(true);
    expect(f.floor).toBe(1800);
  });

  it('handles an empty ledger without inventing a floor', () => {
    const f = computeIncomeFloor([]);
    expect(f).toMatchObject({ reliable: false, floor: 0, average: 0, monthsWithIncome: 0 });
  });

  it('ignores expenses entirely', () => {
    const withSpend = [...incomeMonths([2000, 2100, 2200]), txn({ amount: 9999, type: 'expense' })];
    expect(computeIncomeFloor(withSpend)).toEqual(computeIncomeFloor(incomeMonths([2000, 2100, 2200])));
  });

  it('is deterministic', () => {
    const t = incomeMonths([1900, 2400, 2100, 2600, 2200, 2000]);
    expect(computeIncomeFloor(t)).toEqual(computeIncomeFloor(t));
  });

  it('always reports a floor that is a month that genuinely happened', () => {
    // Nearest-rank, never interpolated: the UI claims "you cleared this", so the number has to
    // be a level the borrower actually reached.
    for (const months of [[900, 1000, 1100], [500, 3000, 3100, 3200], [2000, 2000, 2000, 5000, 100]]) {
      const f = computeIncomeFloor(incomeMonths(months));
      expect(months).toContain(f.floor);
      expect(f.floor).toBeGreaterThanOrEqual(f.worst);
      expect(f.floor).toBeLessThanOrEqual(f.best);
      expect(f.monthsAtOrAboveFloor).toBeGreaterThan(0);
    }
  });
});

describe('computeExpenseStructure', () => {
  /** Three months of: a stable RM120 bill, and genuinely varying groceries and shopping.
   *  The variance matters — `detectObligations` treats any merchant that repeats monthly at a
   *  near-constant amount as an obligation, so a fixture with suspiciously steady groceries
   *  would classify them as committed and quietly test nothing. */
  const GROCERIES = [250, 400, 320];
  const SHOPPING = [50, 300, 180];
  function ledger(): Transaction[] {
    const out: Transaction[] = [];
    for (let m = 1; m <= 3; m++) {
      const mm = String(m).padStart(2, '0');
      out.push(txn({ amount: 120, merchantRaw: 'TNB Electric', merchantKey: 'tnb', categoryId: 'housing', date: `2026-${mm}-05` }));
      out.push(txn({ amount: GROCERIES[m - 1], merchantRaw: 'Kedai Runcit', merchantKey: 'kedai', categoryId: 'food', date: `2026-${mm}-12` }));
      out.push(txn({ amount: SHOPPING[m - 1], merchantRaw: 'Shopee', merchantKey: 'shopee', categoryId: 'shopping', date: `2026-${mm}-20` }));
    }
    return out;
  }
  const AVG_GROCERIES = (250 + 400 + 320) / 3;
  const AVG_SHOPPING = (50 + 300 + 180) / 3;

  it('only treats the genuinely recurring merchant as committed', () => {
    const t = ledger();
    expect(detectObligations(t).obligations.map((o) => o.label)).toEqual(['TNB Electric']);
  });

  it('partitions spend by escapability', () => {
    const t = ledger();
    const s = computeExpenseStructure(t, detectObligations(t).obligations);
    expect(s.monthsWithExpense).toBe(3);
    expect(s.committed).toBeCloseTo(120, 6); // the recurring bill
    expect(s.essentialVariable).toBeCloseTo(AVG_GROCERIES, 6); // essential, but it moves
    expect(s.flexible).toBeCloseTo(AVG_SHOPPING, 6);
  });

  it('always sums exactly to observed monthly spend', () => {
    // Property: a partition that leaks money would misstate what the borrower can service.
    for (const t of [ledger(), [...ledger(), txn({ amount: 55.55, categoryId: null, merchantRaw: 'Odd', merchantKey: 'odd' })], []]) {
      const s = computeExpenseStructure(t, detectObligations(t).obligations);
      expect(s.committed + s.essentialVariable + s.flexible).toBeCloseTo(s.monthlyTotal, 6);
    }
  });

  it('agrees with the evidenced debt service it was given', () => {
    const t = ledger();
    const { obligations, evidencedMonthlyDebtService } = detectObligations(t);
    const s = computeExpenseStructure(t, obligations);
    expect(s.committed).toBeCloseTo(evidencedMonthlyDebtService, 6);
  });

  it('treats uncategorized spend as flexible, never as essential', () => {
    const t = [txn({ amount: 90, categoryId: null, date: '2026-01-04' })];
    const s = computeExpenseStructure(t, []);
    expect(s.flexible).toBeCloseTo(90, 6);
    expect(s.essentialVariable).toBe(0);
  });

  it('counts a recurring charge as committed once, not twice', () => {
    const t = ledger();
    const s = computeExpenseStructure(t, detectObligations(t).obligations);
    // The bill is category 'housing' (essential) AND an obligation; it must land in one bucket
    // only, or the borrower is charged for it twice over.
    expect(s.essentialVariable).toBeCloseTo(AVG_GROCERIES, 6);
    expect(s.committed).toBeCloseTo(120, 6);
  });

  it('reports the share of the month already spoken for', () => {
    const t = ledger();
    const s = computeExpenseStructure(t, detectObligations(t).obligations);
    expect(s.committedRatio).toBeCloseTo(120 / (120 + AVG_GROCERIES + AVG_SHOPPING), 4);
  });

  it('handles an empty ledger', () => {
    expect(computeExpenseStructure([], [])).toMatchObject({ committed: 0, flexible: 0, monthlyTotal: 0, committedRatio: 0 });
  });

  it('is deterministic', () => {
    const t = ledger();
    const o = detectObligations(t).obligations;
    expect(computeExpenseStructure(t, o)).toEqual(computeExpenseStructure(t, o));
  });
});

describe('dependableSurplus / serviceableCapacity', () => {
  const SAMPLE = { committed: 120, essentialVariable: 1250, flexible: 650, monthlyTotal: 2020, committedRatio: 120 / 2020, monthsWithExpense: 6 };

  it('is what a weak month leaves at current spending', () => {
    expect(dependableSurplus(2080, SAMPLE)).toBeCloseTo(60, 6); // 2080 − 2020
  });

  it('is never rosier than average-minus-average', () => {
    // The honest pairing: the income that HELD UP against the spending that actually happens.
    // Since floor ≤ best and average ≥ floor is NOT guaranteed, the invariant that does hold is
    // floor ≤ average ⟹ dependableSurplus ≤ avgSurplus. Assert it over several income shapes.
    for (const months of [[1200, 2500, 2600, 2700, 2800, 2900], [900, 1000, 1100, 1200], [2000, 2000, 2000]]) {
      const f = computeIncomeFloor(incomeMonths(months));
      const avgSurplus = f.average - SAMPLE.monthlyTotal;
      if (f.floor <= f.average) expect(dependableSurplus(f.floor, SAMPLE)).toBeLessThanOrEqual(avgSurplus + 1e-9);
    }
  });

  it('reports a shortfall rather than clamping it away', () => {
    const s = { committed: 900, essentialVariable: 900, flexible: 0, monthlyTotal: 1800, committedRatio: 0.5, monthsWithExpense: 4 };
    expect(dependableSurplus(1500, s)).toBeCloseTo(-300, 6);
  });

  it('serviceable capacity is the surplus plus the flexible spend that could be redirected', () => {
    // The two-number story: "a weak month leaves you RM60, but RM650 is flexible."
    expect(serviceableCapacity(2080, SAMPLE)).toBeCloseTo(710, 6);
    expect(serviceableCapacity(2080, SAMPLE) - dependableSurplus(2080, SAMPLE)).toBeCloseTo(SAMPLE.flexible, 6);
  });

  it('the two agree when there is no flexible spend left to cut', () => {
    const s = { committed: 500, essentialVariable: 700, flexible: 0, monthlyTotal: 1200, committedRatio: 500 / 1200, monthsWithExpense: 5 };
    expect(serviceableCapacity(1800, s)).toBeCloseTo(dependableSurplus(1800, s), 6);
  });
});
