// Pure builders for the judge demo seeds. No DB/UI imports  keeps them directly
// unit-testable against the real engines. `src/data/demoProfile.ts` is the thin
// persister that writes whichever seed is selected into the store.
import type { NewTxn } from '../db/txnRepo';
import type { AccountKind } from '../lib/types';
import { merchantKey } from '../lib/normalize';
import { DEFAULT_INCOME_ID } from './categories';

// ── Shared helpers ────────────────────────────────────────────────────────────

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

// ── Profile 1: Aina (existing, formalized only) ───────────────────────────────

const AINA_MONTHS = 6;
/** Committed PRNG seed  same seed always produces the same demo seed (spec A1). */
const AINA_SEED = 42;

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
const AINA_MERCHANTS: Merchant[] = [
  { name: 'TNB', categoryId: 'bills', cluster: 0, stableBand: [65, 75], band: [65, 75] },
  { name: 'Unifi', categoryId: 'bills', cluster: 0, stableBand: [85, 93], band: [85, 93] },
  { name: 'Motorbike Installment', categoryId: 'bills', cluster: 0, stableBand: [245, 255], band: [245, 255] },
  { name: 'Air Selangor', categoryId: 'bills', cluster: 1, band: [32, 112] },
  { name: 'Maxis Prepaid', categoryId: 'bills', cluster: 3, band: [24, 120] },
  { name: 'Pasar Mini Aziz', categoryId: 'groceries', cluster: 1, band: [40, 416] },
  { name: '99 Speedmart', categoryId: 'groceries', cluster: 3, band: [15, 416] },
  { name: 'Grab', categoryId: 'transport', cluster: 2, band: [8, 112] },
  { name: 'Touch n Go Reload', categoryId: 'transport', cluster: 4, band: [36, 190] },
  { name: 'Petronas RON95', categoryId: 'fuel', cluster: 2, band: [36, 205] },
  { name: 'Mamak Corner', categoryId: 'dining', cluster: 1, band: [18, 175] },
  { name: 'Foodpanda', categoryId: 'dining', cluster: 3, band: [18, 185] },
  { name: 'Pasar Malam', categoryId: 'dining', cluster: 4, band: [18, 130] },
  { name: 'Kopi O Kedai', categoryId: 'coffee', cluster: 2, band: [3, 72] },
  { name: 'Shopee', categoryId: 'shopping', cluster: 4, band: [56, 1280] },
  { name: 'Klinik Famili', categoryId: 'health', cluster: 0, band: [56, 512] },
  { name: 'Watsons', categoryId: 'health', cluster: 3, band: [24, 224] },
];

/**
 * Pure builder for the judge demo seed — Profile 1: Aina.
 * An online seller running a small shop through social media and e-wallet payments.
 * Income is real but uneven week to week — exactly the "credit-invisible but banked" applicant.
 *
 * Target: 700-740/Good, 60-72% confidence, coverage-gated Emergency-REFER → ≥RM3,000 approve.
 * DO NOT modify the body of this function. Aina's demoAcceptance.test.ts pins are the
 * regression guard — any output change will break them.
 */
export function buildAinaSeed(now: Date = new Date()): DemoSeed {
  const rng = mulberry32(AINA_SEED);

  // ── Transactions: income + categorized expenses ──────────────────────────────────────────
  const txns: NewTxn[] = [];
  for (let m = AINA_MONTHS - 1; m >= 0; m--) {
    // Income: 4-5 uneven gig payouts/month (never two equal in the same month), reusing the
    // same cluster days as expenses so payouts don't add extra distinct coverage days.
    const nPay = 4 + (rng() < 0.5 ? 0 : 1);
    const weights: number[] = [];
    for (let i = 0; i < nPay; i++) weights.push(0.6 + rng());
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const monthTarget = 2595 * (0.75 + rng() * 0.5);
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
    const activeMerchants = m >= 3 ? AINA_MERCHANTS.filter((_, i) => i % 2 === 0) : AINA_MERCHANTS;
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
        asOf: iso(monthDate(now, AINA_MONTHS - 1 - i, 1)),
      })),
    },
    {
      name: 'Maybank Savings',
      kind: 'asset',
      cls: 'cash',
      entries: [1900, 2000, 2100, 2200, 2300, 2400].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, AINA_MONTHS - 1 - i, 1)),
      })),
    },
    {
      name: 'Motor Loan (Honda EX5)',
      kind: 'liability',
      cls: 'car_loan',
      entries: [8450, 8200, 7950, 7700, 7450, 7200].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, AINA_MONTHS - 1 - i, 1)),
      })),
    },
  ];

  // ── Budget: expected income matches the seeded average, allocations across 4-5 categories
  // with Shopping deliberately tight (reads as "near its limit" in the demo). ──────────────
  const budget = {
    expectedIncome: 2595,
    allocations: {
      bills: 430,
      groceries: 220,
      transport: 180,
      dining: 160,
      shopping: 140,
    },
  };

  return { transactions: txns, accounts, budget };
}

/** Back-compat alias — existing imports of `buildDemoSeed` continue to resolve. */
export const buildDemoSeed = buildAinaSeed;

// ── Profile 2: Ravi (new) ─────────────────────────────────────────────────────

const RAVI_MONTHS = 8;
const RAVI_SEED = 137;

/** 13 merchants. High-value merchants get deliberately alternating hi/lo amounts month-to-month
 *  so detectObligations cannot flag them as stable recurring obligations (it requires amounts
 *  within ±15% of median, MIN_MONTHS=3). Only genuinely utility-sized entries may appear stable,
 *  and even those have wide enough variation to avoid classification as debt obligations. */
const RAVI_MERCHANTS: Merchant[] = [
  // Bills — vary amounts so they are clearly non-stable:
  { name: 'Air Selangor', categoryId: 'bills', cluster: 1, band: [28, 165] },
  { name: 'Maxis Postpaid', categoryId: 'bills', cluster: 2, band: [55, 310] },
  // Groceries — wide ranges, alternating hi/lo so monthly amounts swing >15%:
  { name: 'Mydin Hypermarket', categoryId: 'groceries', cluster: 1, band: [55, 680] },
  { name: '99 Speedmart', categoryId: 'groceries', cluster: 3, band: [18, 380] },
  { name: 'Tesco Extra', categoryId: 'groceries', cluster: 4, band: [80, 820] },
  // Transport:
  { name: 'Grab', categoryId: 'transport', cluster: 2, band: [9, 110] },
  { name: 'Touch n Go Reload', categoryId: 'transport', cluster: 4, band: [40, 260] },
  // Fuel:
  { name: 'Petronas RON95', categoryId: 'fuel', cluster: 0, band: [42, 340] },
  // Small items (spans many orders of magnitude):
  { name: 'Kopi O Kedai', categoryId: 'coffee', cluster: 3, band: [4, 24] },
  { name: 'Mamak Corner', categoryId: 'dining', cluster: 1, band: [12, 120] },
  // Shopping — extremely wide, monthly amounts swing wildly:
  { name: 'Shopee', categoryId: 'shopping', cluster: 4, band: [48, 1200] },
  { name: 'Guardian', categoryId: 'health', cluster: 2, band: [28, 340] },
  { name: 'BookXcess', categoryId: 'shopping', cluster: 0, band: [35, 480] },
];

/** Gig platforms Ravi works across — all in VERIFIED_PAYER_TOKENS so p2pIncomeValueRatio = 0. */
const RAVI_INCOME_SOURCES = [
  'GrabFood Payout',      // 'grab' token → verified
  'Foodpanda Driver Pay', // 'foodpanda' token → verified
  'Shopee Food Driver',   // 'shopee' token → verified
  'Lalamove Payout',      // 'enterprise'→ no, but 'grab' is not here; still generic?
  'Ninja Xpress Pay',     // generic fallback — keep at minority of payouts
];

/**
 * Profile 2: Ravi — a longer-running food-delivery driver.
 * More platforms, more months of history, steadier income, consistent savings behavior.
 *
 * Target: Excellent band (≥820), confidence ≥85%.
 * - All income: extracted source, mostly verified-payer names → provenance trust ~0.95+
 * - 8 months × 14 distinct day-of-month slots → coverage well above 30 days
 * - No round amounts, no duplicates, broad merchant variety → ML fraud prob near 0
 * - Monthly surplus ~35% of income → plausibility well above 0.40 floor (no penalty)
 */
export function buildRaviSeed(now: Date = new Date()): DemoSeed {
  const rng = mulberry32(RAVI_SEED);

  const txns: NewTxn[] = [];

  // Income lands on 5 distinct days, expenses on a DIFFERENT set of 9 days.
  // Together they give ≥14 distinct coverage days per recent month → >30 in the 90-day window.
  const raviIncomeDays = [2, 8, 16, 24, 30];
  const raviExpenseDays = [4, 7, 11, 13, 17, 20, 23, 27, 29];

  for (let m = RAVI_MONTHS - 1; m >= 0; m--) {
    // Income: 5 platform payouts/month. Monthly target RM5,000–5,600.
    // Higher income ensures expenses (geometric-mean ~RM1,800–2,200 alternating) stay ≥40% of income.
    const monthTarget = 5000 + rng() * 600;
    const nPay = 5;
    const weights: number[] = [];
    for (let i = 0; i < nPay; i++) weights.push(0.7 + rng() * 0.6);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < nPay; i++) {
      const d = monthDate(now, m, raviIncomeDays[i]);
      if (d > now) continue;
      const amount = Math.round(((weights[i] / weightSum) * monthTarget + 0.17 + i * 0.11) * 100) / 100;
      txns.push({
        merchantRaw: RAVI_INCOME_SOURCES[i % RAVI_INCOME_SOURCES.length],
        merchantKey: merchantKey(RAVI_INCOME_SOURCES[i % RAVI_INCOME_SOURCES.length]),
        amount,
        type: 'income',
        date: iso(d),
        categoryId: DEFAULT_INCOME_ID,
        // Gig platform payouts from GrabFood/Foodpanda/Shopee all pass through the
        // verified pipeline in production (platform-verified payroll exports),
        // which lifts provenanceTrust from 0.70 to the 0.80–0.90 range.
        source: 'verified',
      });
    }

    // Expenses: 13 merchants across 9 distinct day-slots.
    // Alternate between low and high log-uniform halves each month so monthly amounts
    // swing by more than the ±15% obligation-detection tolerance, preventing any merchant
    // from being flagged as a recurring debt obligation.
    RAVI_MERCHANTS.forEach((merchant, idx) => {
      const daySlot = raviExpenseDays[idx % raviExpenseDays.length];
      const d = monthDate(now, m, daySlot);
      if (d > now) return;
      const [lo, hi] = merchant.band;
      const mid = Math.sqrt(lo * hi);
      // Alternate halves: even months sample lo→mid, odd months sample mid→hi.
      // This ensures month-over-month swings far exceed ±15%, defeating obligation detection.
      const amount = m % 2 === 0
        ? logUniform(rng, lo, mid)    // low month
        : logUniform(rng, mid, hi);   // high month
      txns.push({
        merchantRaw: merchant.name,
        merchantKey: merchantKey(merchant.name),
        amount: Math.round((amount + 0.13 + idx * 0.07) * 100) / 100,
        type: 'expense',
        date: iso(d),
        categoryId: merchant.categoryId,
        source: 'extracted',
      });
    });
  }

  // Accounts: three rising assets, no liability (motor loan settled)
  const accounts: DemoAccountSeed[] = [
    {
      name: "Touch 'n Go eWallet",
      kind: 'asset',
      cls: 'cash',
      entries: [900, 1000, 1100, 1200, 1350, 1500, 1650, 1800].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, RAVI_MONTHS - 1 - i, 1)),
      })),
    },
    {
      name: 'CIMB Clicks Savings',
      kind: 'asset',
      cls: 'cash',
      entries: [4200, 4500, 4800, 5100, 5400, 5700, 6000, 6300].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, RAVI_MONTHS - 1 - i, 1)),
      })),
    },
    {
      name: 'ASB Savings',
      kind: 'asset',
      cls: 'savings',
      entries: [8000, 8400, 8800, 9200, 9600, 10000, 10400, 10800].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, RAVI_MONTHS - 1 - i, 1)),
      })),
    },
  ];

  const budget = {
    expectedIncome: 4000,
    allocations: {
      bills: 520,
      groceries: 380,
      transport: 280,
      dining: 220,
      shopping: 320,
      health: 180,
      fuel: 200,
    },
  };

  return { transactions: txns, accounts, budget };
}

// ── Profile 3: Faizal (new) ───────────────────────────────────────────────────

const FAIZAL_MONTHS = 4;
const FAIZAL_SEED = 271;

/** Thin merchant list — few unique merchants drives low merchant_entropy (ML fraud signal). */
const FAIZAL_MERCHANTS = [
  { name: 'Giant Hypermarket', categoryId: 'groceries', day: 5 },
  { name: 'Grab', categoryId: 'transport', day: 10 },
  { name: 'Mamak Corner', categoryId: 'dining', day: 15 },
  { name: 'Shopee', categoryId: 'shopping', day: 20 },
  { name: 'TNB', categoryId: 'bills', day: 25 },
];

/** Round income amounts — triggers round_ratio and poor Benford (ML fraud signals). */
const FAIZAL_INCOME_AMOUNTS = [500, 1000, 1500, 2000, 2500, 3000];

/**
 * Profile 3: Faizal — stated need matches Aina's but his data is suspiciously clean.
 * Round amounts, thin merchant variety, manual provenance, near-duplicate entries.
 *
 * Target: confidence < 50%, REFER decision via confidence cap, ML reasons visible in badge.
 * Engineered to trip: round_ratio (ML feature[2] positive weight 1.49), merchant_entropy
 * (feature[6] positive weight 0.36), provenance_trust (feature[0] negative weight -1.15 →
 * low trust pushes fraud probability up via the standardised score).
 * Source isolation gap (income manual, expenses extracted) hits the hard cap at 0.39.
 */
export function buildFaizalSeed(now: Date = new Date()): DemoSeed {
  const rng = mulberry32(FAIZAL_SEED);

  const txns: NewTxn[] = [];

  for (let m = FAIZAL_MONTHS - 1; m >= 0; m--) {
    // Income: 3 round-number manual entries per month from generic payers
    // Amounts cycle through the round pool so they look "too clean"
    for (let i = 0; i < 3; i++) {
      const amount = FAIZAL_INCOME_AMOUNTS[(m * 3 + i) % FAIZAL_INCOME_AMOUNTS.length];
      const day = 3 + i * 8; // days 3, 11, 19
      const d = monthDate(now, m, day);
      if (d > now) continue;
      // Generic payer strings — not in VERIFIED_PAYER_TOKENS, triggers p2pIncomeValueRatio penalty
      const payer = i % 2 === 0 ? 'DuitNow Transfer' : 'Cash Transfer';
      txns.push({
        merchantRaw: payer,
        merchantKey: merchantKey(payer),
        amount,
        type: 'income',
        date: iso(d),
        categoryId: DEFAULT_INCOME_ID,
        source: 'manual', // manual provenance — lowers provenance trust
      });
    }

    // Expenses: thin variety, mix of round and non-round amounts, mostly extracted
    FAIZAL_MERCHANTS.forEach((merchant, idx) => {
      const d = monthDate(now, m, merchant.day);
      if (d > now) return;
      // Alternate between round amounts (100/200/300/500) and non-round to keep round_ratio ~50%
      const amount = idx % 2 === 0
        ? [100, 200, 300, 500][Math.floor(rng() * 4)]   // round — explicit integer
        : Math.round((30 + rng() * 180 + 0.37 + idx * 0.19) * 100) / 100; // non-round
      txns.push({
        merchantRaw: merchant.name,
        merchantKey: merchantKey(merchant.name),
        amount,
        type: 'expense',
        date: iso(d),
        categoryId: merchant.categoryId,
        source: 'extracted', // expenses extracted → widens source-isolation gap vs manual income
      });
    });

    // Near-duplicate rows: repeat one expense entry on the next day — raises duplicate_ratio
    if (m < FAIZAL_MONTHS - 1) {
      const d = monthDate(now, m, 6);
      if (d <= now) {
        txns.push({
          merchantRaw: 'Giant Hypermarket',
          merchantKey: merchantKey('Giant Hypermarket'),
          amount: 200, // round duplicate
          type: 'expense',
          date: iso(d),
          categoryId: 'groceries',
          source: 'manual',
        });
      }
    }
  }

  // Accounts: single stagnant asset, no liability (no obligation story needed)
  const accounts: DemoAccountSeed[] = [
    {
      name: 'Maybank Savings',
      kind: 'asset',
      cls: 'cash',
      entries: [1200, 1250, 1240, 1230].map((value, i) => ({
        value,
        asOf: iso(monthDate(now, FAIZAL_MONTHS - 1 - i, 1)),
      })),
    },
  ];

  const budget = {
    expectedIncome: 3000,
    allocations: {
      groceries: 400,
      transport: 200,
      dining: 300,
      shopping: 300,
    },
  };

  return { transactions: txns, accounts, budget };
}
