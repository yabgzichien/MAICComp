import {
  applyPayment,
  apportionCents,
  computeItemized,
  computeSplit,
  DEFAULT_SURCHARGES,
  openReceivableTotal,
  outstanding,
  SELF,
  suggestSettlement,
  toCents,
  validateSplit,
  type OpenShare,
  type ReceiptLine,
  type SplitInput,
} from '../src/lib/split';

function input(over: Partial<SplitInput>): SplitInput {
  return { gross: 120, participants: [{ personId: 'ali' }], method: 'equal', includeSelf: true, ...over };
}

/** The invariant that makes the receivable reconcile: nothing is created or lost by dividing. */
function sumsToGross(result: { ownShare: number; shares: { owed: number }[] }, gross: number): boolean {
  const total = toCents(result.ownShare) + result.shares.reduce((s, x) => s + toCents(x.owed), 0);
  return total === toCents(gross);
}

describe('apportionCents', () => {
  it('sums to exactly the total', () => {
    expect(apportionCents([1, 1, 1], 10000).reduce((s, c) => s + c, 0)).toBe(10000);
  });

  it('handles zero and negative totals without inventing money', () => {
    expect(apportionCents([1, 1], 0)).toEqual([0, 0]);
    expect(apportionCents([0, 0], 500)).toEqual([0, 0]);
  });
});

describe('computeSplit', () => {
  it('divides a bill equally and hands the odd cent to the payer', () => {
    // RM100 across three people: the two friends pay 33.33, the payer eats the extra cent.
    const result = computeSplit(input({ gross: 100, participants: [{ personId: 'ali' }, { personId: 'siti' }] }));
    expect(result.shares.map((s) => s.owed)).toEqual([33.33, 33.33]);
    expect(result.ownShare).toBe(33.34);
    expect(sumsToGross(result, 100)).toBe(true);
  });

  it('never asks a friend for more than their arithmetic share', () => {
    const result = computeSplit(input({ gross: 100, participants: [{ personId: 'ali' }, { personId: 'siti' }] }));
    for (const s of result.shares) expect(s.owed).toBeLessThanOrEqual(100 / 3);
  });

  it('weights shares when someone ate double', () => {
    const result = computeSplit(
      input({ gross: 120, method: 'shares', participants: [{ personId: 'ali', weight: 2 }, { personId: 'siti', weight: 1 }] })
    );
    expect(result.shares.map((s) => s.owed)).toEqual([60, 30]);
    expect(result.ownShare).toBe(30);
    expect(sumsToGross(result, 120)).toBe(true);
  });

  it('gives the payer nothing when they were not on the bill', () => {
    const result = computeSplit(
      input({ gross: 100, includeSelf: false, participants: [{ personId: 'ali' }, { personId: 'siti' }, { personId: 'raj' }] })
    );
    expect(result.ownShare).toBe(0);
    expect(sumsToGross(result, 100)).toBe(true);
  });

  it('leaves the remainder as the payer share under the exact method', () => {
    const result = computeSplit(
      input({ gross: 120, method: 'exact', participants: [{ personId: 'ali', exact: 45.5 }, { personId: 'siti', exact: 30 }] })
    );
    expect(result.ownShare).toBe(44.5);
    expect(sumsToGross(result, 120)).toBe(true);
  });

  it('sums to exactly the gross across many totals and party sizes', () => {
    for (let cents = 1; cents <= 2000; cents += 7) {
      for (let n = 1; n <= 9; n++) {
        const gross = cents / 100;
        const participants = Array.from({ length: n }, (_, i) => ({ personId: `p${i}` }));
        expect(sumsToGross(computeSplit(input({ gross, participants })), gross)).toBe(true);
        expect(sumsToGross(computeSplit(input({ gross, participants, includeSelf: false })), gross)).toBe(true);
      }
    }
  });

  it('does not divide a zero bill', () => {
    const result = computeSplit(input({ gross: 0, participants: [{ personId: 'ali' }] }));
    expect(result.ownShare).toBe(0);
    expect(result.shares[0].owed).toBe(0);
  });
});

describe('validateSplit', () => {
  it('accepts a normal equal split', () => {
    expect(validateSplit(input({}))).toBeNull();
  });

  it('rejects a bill with no amount and a split with nobody on it', () => {
    expect(validateSplit(input({ gross: 0 }))).not.toBeNull();
    expect(validateSplit(input({ participants: [] }))).not.toBeNull();
  });

  it('rejects the same person twice', () => {
    expect(validateSplit(input({ participants: [{ personId: 'ali' }, { personId: 'ali' }] }))).not.toBeNull();
  });

  it('rejects exact amounts that overshoot the bill', () => {
    expect(
      validateSplit(input({ gross: 100, method: 'exact', participants: [{ personId: 'ali', exact: 60 }, { personId: 'siti', exact: 60 }] }))
    ).not.toBeNull();
  });

  it('requires exact amounts to land on the bill when the payer is not on it', () => {
    const off = input({ gross: 100, method: 'exact', includeSelf: false, participants: [{ personId: 'ali', exact: 60 }] });
    expect(validateSplit(off)).not.toBeNull();
    expect(validateSplit({ ...off, participants: [{ personId: 'ali', exact: 100 }] })).toBeNull();
  });

  it('allows exact amounts to leave a remainder when the payer is on it', () => {
    expect(
      validateSplit(input({ gross: 100, method: 'exact', participants: [{ personId: 'ali', exact: 30 }] }))
    ).toBeNull();
  });
});

describe('computeItemized', () => {
  const line = (id: string, amount: number, assignedTo: string[]): ReceiptLine => ({
    id,
    label: id,
    amount,
    assignedTo,
  });
  // The payer is always last so every rounding residue lands on them.
  const TABLE = ['ali', SELF];

  /** Everything handed out has to add up to what the bank actually charged. */
  function sums(result: { ownShare: number; shares: { owed: number }[] }, charged: number): boolean {
    return (
      toCents(result.ownShare) + result.shares.reduce((s, x) => s + toCents(x.owed), 0) === toCents(charged)
    );
  }

  it('charges each person for what they ate', () => {
    // Items 30 + 10 = 40. Service 10% = 4, tax 6% of 44 = 2.64. Total 46.64.
    const lines = [line('steak', 30, ['ali']), line('teh', 10, [SELF])];
    const r = computeItemized(lines, DEFAULT_SURCHARGES, 46.64, TABLE);
    expect(r.computedTotal).toBe(46.64);
    expect(r.difference).toBe(0);
    // Surcharges ride on each person's own items: 6.64 split 30:10.
    expect(r.shares[0].owed).toBe(34.98);
    expect(r.ownShare).toBe(11.66);
    expect(sums(r, 46.64)).toBe(true);
  });

  it('applies service charge first, then tax on top of it', () => {
    const lines = [line('food', 100, [SELF])];
    const r = computeItemized(lines, DEFAULT_SURCHARGES, 116.6, [SELF]);
    // 100 + 10 service = 110, then 6% of 110 = 6.60. Taxing only the subtotal would give 116.00.
    expect(r.computedTotal).toBe(116.6);
  });

  it('honours the bank amount over the receipt, as a shared line', () => {
    const lines = [line('food', 100, ['ali'])];
    // Paper says 116.60, card was charged 120 (a tip added at the till).
    const r = computeItemized(lines, DEFAULT_SURCHARGES, 120, TABLE);
    expect(r.computedTotal).toBe(116.6);
    expect(r.difference).toBe(3.4);
    expect(r.ownShare).toBe(1.7); // the tip is shared even though Ali ate everything
    expect(sums(r, 120)).toBe(true);
  });

  it('handles a bank amount below the receipt', () => {
    const lines = [line('food', 100, ['ali'])];
    const r = computeItemized(lines, DEFAULT_SURCHARGES, 110, TABLE);
    expect(r.difference).toBe(-6.6);
    expect(r.ownShare).toBe(-3.3);
    expect(sums(r, 110)).toBe(true);
  });

  it('splits a shared line among everyone who ate it', () => {
    const lines = [line('platter', 90, ['ali', SELF])];
    const r = computeItemized(lines, { serviceChargePct: 0, taxPct: 0 }, 90, TABLE);
    expect(r.shares[0].owed).toBe(45);
    expect(r.ownShare).toBe(45);
  });

  it('shares an unclaimed line across the table and reports it', () => {
    const lines = [line('rice', 10, ['ali']), line('mystery', 20, [])];
    const r = computeItemized(lines, { serviceChargePct: 0, taxPct: 0 }, 30, TABLE);
    expect(r.unassigned.map((l) => l.id)).toEqual(['mystery']);
    expect(r.shares[0].owed).toBe(20); // 10 of their own + half the mystery
    expect(r.ownShare).toBe(10);
    expect(sums(r, 30)).toBe(true);
  });

  it('turns surcharges off when the receipt has none', () => {
    const lines = [line('food', 50, [SELF])];
    expect(computeItemized(lines, { serviceChargePct: 0, taxPct: 0 }, 50, [SELF]).computedTotal).toBe(50);
  });

  it('splits the charge evenly when there are no readable items', () => {
    const r = computeItemized([], DEFAULT_SURCHARGES, 30, ['ali', 'siti', SELF]);
    expect(r.shares.map((s) => s.owed)).toEqual([10, 10]);
    expect(r.ownShare).toBe(10);
    expect(sums(r, 30)).toBe(true);
  });

  it('reconciles to the charged amount across many totals and tables', () => {
    for (let cents = 137; cents <= 40000; cents += 971) {
      for (let n = 1; n <= 6; n++) {
        const people = [...Array.from({ length: n }, (_, i) => `p${i}`), SELF];
        const lines = [
          line('a', cents / 300, ['p0']),
          line('b', cents / 250, people.slice(0, 2)),
          line('c', cents / 400, []),
        ];
        const charged = cents / 100;
        expect(sums(computeItemized(lines, DEFAULT_SURCHARGES, charged, people), charged)).toBe(true);
      }
    }
  });
});

describe('outstanding and receivable total', () => {
  it('nets paid off owed and never goes negative', () => {
    expect(outstanding({ owed: 80, paid: 50 })).toBe(30);
    expect(outstanding({ owed: 80, paid: 90 })).toBe(0);
  });

  it('totals only what is still open', () => {
    expect(
      openReceivableTotal([
        { owed: 80, paid: 50, status: 'open' },
        { owed: 40, paid: 0, status: 'open' },
        { owed: 25, paid: 0, status: 'settled' },
        { owed: 15, paid: 0, status: 'written_off' },
      ])
    ).toBe(70);
  });
});

describe('applyPayment', () => {
  it('leaves a share open on a partial payment', () => {
    expect(applyPayment({ owed: 80, paid: 0 }, 50)).toEqual({ paid: 50, status: 'open' });
  });

  it('settles once the balance is cleared across several payments', () => {
    const first = applyPayment({ owed: 80, paid: 0 }, 50);
    expect(applyPayment({ owed: 80, paid: first.paid }, 30)).toEqual({ paid: 80, status: 'settled' });
  });

  it('caps an overpayment at what was owed', () => {
    expect(applyPayment({ owed: 80, paid: 0 }, 100)).toEqual({ paid: 80, status: 'settled' });
  });
});

describe('suggestSettlement', () => {
  const share = (over: Partial<OpenShare> = {}): OpenShare => ({
    shareId: 's1',
    personId: 'ali',
    personName: 'Ali',
    outstanding: 80,
    billDate: '2026-06-01',
    merchant: 'Nasi Kandar Pelita',
    ...over,
  });
  const TODAY = '2026-06-10';

  it('matches on the amount alone', () => {
    const hit = suggestSettlement([share()], { merchant: 'DuitNow Transfer', amount: 80, date: '2026-06-05' }, TODAY);
    expect(hit?.share.shareId).toBe('s1');
    expect(hit?.partial).toBe(false);
    expect(hit?.confidence).toBe('likely');
  });

  it('calls it strong when the sender name lines up too', () => {
    const hit = suggestSettlement([share()], { merchant: 'ALI BIN HASSAN', amount: 80, date: '2026-06-05' }, TODAY);
    expect(hit?.confidence).toBe('strong');
  });

  it('offers a partial settlement on a smaller transfer from a known name', () => {
    const hit = suggestSettlement([share()], { merchant: 'Ali Hassan', amount: 50, date: '2026-06-05' }, TODAY);
    expect(hit?.partial).toBe(true);
    expect(hit?.amount).toBe(50);
  });

  it('ignores an inbound larger than the debt', () => {
    expect(suggestSettlement([share()], { merchant: 'Ali Hassan', amount: 200, date: '2026-06-05' }, TODAY)).toBeNull();
  });

  it('ignores a transfer that predates the bill or lands long after it', () => {
    expect(suggestSettlement([share()], { merchant: 'Ali', amount: 80, date: '2026-05-20' }, TODAY)).toBeNull();
    expect(suggestSettlement([share()], { merchant: 'Ali', amount: 80, date: '2026-11-20' }, TODAY)).toBeNull();
  });

  it('ignores a row that agrees on neither amount nor name', () => {
    expect(suggestSettlement([share()], { merchant: 'Shopee Payout', amount: 55, date: '2026-06-05' }, TODAY)).toBeNull();
  });

  it('prefers the strong match, then the oldest debt', () => {
    const shares = [
      share({ shareId: 'new', billDate: '2026-06-08' }),
      share({ shareId: 'old', billDate: '2026-06-01' }),
    ];
    expect(suggestSettlement(shares, { merchant: 'DuitNow', amount: 80, date: '2026-06-09' }, TODAY)?.share.shareId).toBe('old');

    const mixed = [
      share({ shareId: 'amount-only', personName: 'Siti', billDate: '2026-06-01' }),
      share({ shareId: 'both', personName: 'Ali', billDate: '2026-06-08' }),
    ];
    expect(suggestSettlement(mixed, { merchant: 'ALI BIN HASSAN', amount: 80, date: '2026-06-09' }, TODAY)?.share.shareId).toBe('both');
  });

  it('does not match a two-letter name fragment', () => {
    const hit = suggestSettlement(
      [share({ personName: 'Al', outstanding: 80 })],
      { merchant: 'Petronas Alor Setar', amount: 55, date: '2026-06-05' },
      TODAY
    );
    expect(hit).toBeNull();
  });
});
