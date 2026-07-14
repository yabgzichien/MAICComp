// Pure builder for the judge demo seed. No DB/UI imports  keeps it directly unit-testable
// against the real engines. `src/data/demoProfile.ts` is the thin persister that writes this
// shape into the store.
import type { NewTxn } from '../db/txnRepo';
import type { AccountKind } from '../lib/types';
import { merchantKey } from '../lib/normalize';
import { DEFAULT_INCOME_ID } from './categories';

const MONTHS = 6;
/** Committed PRNG seed  same seed always produces the same demo seed (spec A1). */
const SEED = 42;

/** A date `monthsAgo` months back on `day` (clamped to the month's length), at local noon. */
function monthDate(now: Date, monthsAgo: number, day: number): Date {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** mulberry32  small deterministic PRNG so the seed is reproducible (mirrors tools/fraudRealData/perturb.ts). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value drawn uniformly on a log scale between `min` and `max`  the standard trick for
 *  synthetic amounts whose leading-digit distribution approximates Benford's Law, since
 *  Benford conformity requires amounts spread across multiple orders of magnitude, not a
 *  narrow linear band. */
function logUniform(rng: () => number, min: number, max: number): number {
  const l = Math.log10(min) + rng() * (Math.log10(max) - Math.log10(min));
  return Math.pow(10, l);
}

/** Five shared calendar days per month  transactions cluster on these like a real "errands"
 *  pattern (a shopping trip, a bills day), which is what keeps 90-day coverage thin (~15
 *  distinct days) despite ~20-30 transactions/month, rather than one distinct day per merchant. */
const CLUSTER_DAYS = [3, 9, 15, 21, 27];

interface Merchant {
  name: string;
  categoryId: string;
  cluster: number;
  /** Present only for the merchants meant to be detected as recurring obligations
   *  (TNB, Unifi, the motorbike installment)  a tight amount band so they read as stable. */
  stableBand?: [number, number];
  /** For all other merchants: a wide amount band, sampled log-uniform and split into a
   *  low/high half by month parity so they never look recurring-stable (keeps
   *  `detectObligations` at exactly the intended 3). */
  band: [number, number];
}

/** ~17 Malaysian merchants across every real expense category (never `other`)  see
 *  src/data/categories.ts for the category ids. */
const MERCHANTS: Merchant[] = [
  { name: 'TNB', categoryId: 'bills', cluster: 0, stableBand: [65, 75], band: [65, 75] },
  { name: 'Unifi', categoryId: 'bills', cluster: 0, stableBand: [85, 93], band: [85, 93] },
  { name: 'Motorbike Installment', categoryId: 'bills', cluster: 0, stableBand: [245, 255], band: [245, 255] },
  { name: 'Air Selangor', categoryId: 'bills', cluster: 1, band: [20, 70] },
  { name: 'Maxis Prepaid', categoryId: 'bills', cluster: 3, band: [15, 75] },
  { name: 'Pasar Mini Aziz', categoryId: 'groceries', cluster: 1, band: [25, 260] },
  { name: '99 Speedmart', categoryId: 'groceries', cluster: 3, band: [25, 260] },
  { name: 'Grab', categoryId: 'transport', cluster: 2, band: [10, 70] },
  { name: 'Touch n Go Reload', categoryId: 'transport', cluster: 4, band: [30, 200] },
  { name: 'Petronas RON95', categoryId: 'fuel', cluster: 2, band: [30, 210] },
  { name: 'Mamak Corner', categoryId: 'dining', cluster: 1, band: [15, 190] },
  { name: 'Foodpanda', categoryId: 'dining', cluster: 3, band: [15, 200] },
  { name: 'Pasar Malam', categoryId: 'dining', cluster: 4, band: [15, 140] },
  { name: 'Kopi O Kedai', categoryId: 'coffee', cluster: 2, band: [5, 45] },
  { name: 'Shopee', categoryId: 'shopping', cluster: 4, band: [35, 800] },
  { name: 'Klinik Famili', categoryId: 'health', cluster: 0, band: [35, 320] },
  { name: 'Watsons', categoryId: 'health', cluster: 3, band: [15, 140] },
];

export interface DemoAccountSeed {
  name: string;
  kind: AccountKind;
  cls: string;
  /** Every entry, oldest first; the last is the account's current value. */
  entries: { value: number; asOf: string }[];
}

export interface DemoSeed {
  transactions: NewTxn[];
  accounts: DemoAccountSeed[];
  budget: { expectedIncome: number; allocations: Record<string, number> };
}

/**
 * Pure builder for the judge demo seed (spec `Fable5Evaluation/2026-07-12-demo-data-spec.md`
 * A1-A5, B). Deterministic in `now`: rebuilding at a later date shifts only which dates fall
 * inside the trailing windows, never the shape of the data. Engineered so every downstream
 * surface (dashboard categorization, coverage, Benford/round/duplicate authenticity checks,
 * recurring-obligation detection, net worth, budget adherence) tells a coherent, honest story
 * see spec §B for the target ranges each block below is tuned against.
 */
export function buildDemoSeed(now: Date = new Date()): DemoSeed {
  const rng = mulberry32(SEED);

  // ── Transactions: income + categorized expenses ──────────────────────────────────────────
  const txns: NewTxn[] = [];
  for (let m = MONTHS - 1; m >= 0; m--) {
    // Income: 4-5 uneven gig payouts/month (never two equal in the same month), reusing the
    // same cluster days as expenses so payouts don't add extra distinct coverage days.
    const nPay = 4 + (rng() < 0.5 ? 0 : 1);
    const weights: number[] = [];
    for (let i = 0; i < nPay; i++) weights.push(0.6 + rng());
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const monthTarget = 2595 * (0.94 + rng() * 0.12);
    CLUSTER_DAYS.slice(0, nPay).forEach((day, i) => {
      const d = monthDate(now, m, day);
      if (d > now) return; // never future-date. Keeps the coverage signal honest
      const amount = Math.round(((weights[i] / weightSum) * monthTarget + 0.3 + i * 0.07) * 100) / 100;
      txns.push({
        merchantRaw: 'GrabFood Payout',
        merchantKey: merchantKey('GrabFood Payout'),
        amount,
        type: 'income',
        date: iso(d),
        categoryId: DEFAULT_INCOME_ID,
        source: 'extracted',
      });
    });

    // Older months (outside the 90-day coverage window) carry fewer merchants  an honest
    // rising Credit Momentum, while current coverage stays deliberately thin.
    const activeMerchants = m >= 3 ? MERCHANTS.filter((_, i) => i % 2 === 0) : MERCHANTS;
    activeMerchants.forEach((merchant, idx) => {
      const d = monthDate(now, m, CLUSTER_DAYS[merchant.cluster]);
      if (d > now) return;
      const [lo, hi] = merchant.band;
      const mid = Math.sqrt(lo * hi);
      const amount = merchant.stableBand
        ? lo + rng() * (hi - lo)
        : m % 2 === 0
          ? logUniform(rng, lo, mid)
          : logUniform(rng, mid, hi);
      txns.push({
        merchantRaw: merchant.name,
        merchantKey: merchantKey(merchant.name),
        amount: Math.round((amount + 0.4 + idx * 0.03) * 100) / 100,
        type: 'expense',
        date: iso(d),
        categoryId: merchant.categoryId,
        source: 'extracted',
      });
    });
  }

  // ── Accounts: two assets rising gently, one liability paid down monthly ─────────────────
  // 6 monthly entries each so the net-worth trend is a smooth, every-month step (never a
  // single-month cliff from an account "appearing" mid-window).
  const accounts: DemoAccountSeed[] = [
    {
      name: "Touch 'n Go eWallet",
      kind: 'asset',
      cls: 'cash',
      entries: [550, 600, 650, 700, 750, 800].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, MONTHS - 1 - i, 1)),
      })),
    },
    {
      name: 'Maybank Savings',
      kind: 'asset',
      cls: 'cash',
      entries: [1900, 2000, 2100, 2200, 2300, 2400].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, MONTHS - 1 - i, 1)),
      })),
    },
    {
      name: 'Motor Loan (Honda EX5)',
      kind: 'liability',
      cls: 'car_loan',
      entries: [8450, 8200, 7950, 7700, 7450, 7200].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, MONTHS - 1 - i, 1)),
      })),
    },
  ];

  // ── Budget: expected income matches the seeded average, allocations across 4-5 categories
  // with Shopping deliberately tight (reads as "near its limit" in the demo). ──────────────
  const budget = {
    expectedIncome: 2595,
    allocations: {
      bills: 500,
      groceries: 220,
      transport: 180,
      dining: 160,
      shopping: 140,
    },
  };

  return { transactions: txns, accounts, budget };
}
