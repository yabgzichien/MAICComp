// tools/demoKit/build.ts
// Judge self-scan kit (Demo Data plan Task 7, spec D/E)  the agent-buildable half. Emits five
// deterministic HTML statement mockups a judge photographs/screenshots and scans through the
// real app, so they personally execute the coverage-unlock beat instead of only watching a
// pre-loaded seed. The live-Groq smoke test and PNG capture are human-gated (spec F5, H7 in the
// human-task guide)  this script only needs to produce the HTML deterministically and pass its
// own acceptance checks (see build.test.ts).
//
// Kit 1  Touch 'n Go eWallet (genuine)
// Kit 2  Maybank MAE-style bank statement (genuine)  shares "Kedai Kopi Ah Seng" with Kit 1
//        (the learning beat: the merchant is unseen in Kit 1, learned on Kit 2's re-appearance)
// Kit 3  GrabFood driver payout (genuine, income-only)
// Kit 4  Mixed month  e-wallet with a wider spread of categories (genuine)
// Kit 5  Fabricated  all-round RM500/1,000/2,000 income-only rows (the confidence-drop beat)
//
// Run: npx tsx tools/demoKit/build.ts

import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join(__dirname, 'templates');

/** mulberry32  same small deterministic PRNG used by src/data/demoSeed.ts. */
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

/** Log-uniform draw  the same Benford-friendly trick demoSeed.ts uses: amounts spread across
 *  multiple orders of magnitude, not a narrow linear band. */
function logUniform(rng: () => number, min: number, max: number): number {
  const l = Math.log10(min) + rng() * (Math.log10(max) - Math.log10(min));
  return Math.pow(10, l);
}

export interface KitRow {
  merchant: string;
  category: string;
  amount: number;
  type: 'expense' | 'income';
  date: string; // 'D Mon' display form, inside the current month at build time
}

export interface Kit {
  id: string;
  title: string;
  rows: KitRow[];
}

/** A date `daysAgo` days back from `now`, clamped to stay inside the current calendar month
 *  (spec A6's "never future-date, stay in-window" rule applied to a single-month kit). */
function dayInCurrentMonth(now: Date, dayOfMonth: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), Math.min(dayOfMonth, now.getDate()));
  return d;
}

function displayDate(d: Date): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Year included: a year-less date ("2 Jul") makes vision extraction guess the year, and
  // it guessed a past one live  which zeroed the tour's coverage-delta beat.
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Spreads `count` rows across the days elapsed so far this month, earliest first. */
function spreadDays(now: Date, count: number): Date[] {
  const elapsed = Math.max(now.getDate(), count); // at least one slot per row
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    const dayOfMonth = Math.max(1, Math.round(((i + 1) / count) * elapsed));
    days.push(dayInCurrentMonth(now, dayOfMonth));
  }
  return days;
}

// ── Kit builders (pure  same `now` + same SEED always produces the same rows) ───────────────

function buildTngKit(rng: () => number, now: Date): Kit {
  const merchants: { name: string; category: string; band: [number, number] }[] = [
    { name: 'Kedai Kopi Ah Seng', category: 'coffee', band: [3, 15] },
    { name: 'Grab', category: 'transport', band: [8, 45] },
    { name: '99 Speedmart', category: 'groceries', band: [12, 90] },
    { name: 'Touch n Go Reload', category: 'transport', band: [20, 100] },
    { name: 'Mamak Corner', category: 'dining', band: [8, 35] },
    { name: 'Parking (MBJ)', category: 'transport', band: [2, 8] },
    { name: 'Watsons', category: 'health', band: [10, 60] },
  ];
  const days = spreadDays(now, merchants.length);
  const rows: KitRow[] = merchants.map((m, i) => ({
    merchant: m.name,
    category: m.category,
    amount: Math.round(logUniform(rng, m.band[0], m.band[1]) * 100) / 100,
    type: 'expense',
    date: displayDate(days[i]),
  }));
  return { id: 'kit-1-tng-ewallet', title: "Touch 'n Go eWallet", rows };
}

function buildMaeKit(rng: () => number, now: Date): Kit {
  const merchants: { name: string; category: string; band: [number, number]; type: 'expense' | 'income' }[] = [
    { name: 'GrabFood Payout', category: 'income', band: [280, 620], type: 'income' },
    { name: 'Kedai Kopi Ah Seng', category: 'coffee', band: [4, 18], type: 'expense' }, // learning beat: repeats from Kit 1
    { name: 'TNB', category: 'bills', band: [60, 95], type: 'expense' },
    { name: 'Unifi', category: 'bills', band: [80, 110], type: 'expense' },
    { name: 'Pasar Mini Aziz', category: 'groceries', band: [25, 180], type: 'expense' },
    { name: 'Petronas RON95', category: 'fuel', band: [30, 150], type: 'expense' },
    { name: 'Klinik Famili', category: 'health', band: [35, 220], type: 'expense' },
    { name: 'Shopee', category: 'shopping', band: [40, 380], type: 'expense' },
  ];
  const days = spreadDays(now, merchants.length);
  const rows: KitRow[] = merchants.map((m, i) => ({
    merchant: m.name,
    category: m.category,
    amount: Math.round(logUniform(rng, m.band[0], m.band[1]) * 100) / 100,
    type: m.type,
    date: displayDate(days[i]),
  }));
  return { id: 'kit-2-mae-bank', title: 'Maybank MAE: Statement', rows };
}

function buildGrabPayoutKit(rng: () => number, now: Date): Kit {
  const count = 6;
  const days = spreadDays(now, count);
  const rows: KitRow[] = days.map((d, i) => ({
    merchant: 'GrabFood Payout',
    category: 'income',
    amount: Math.round(logUniform(rng, 220, 640) * 100) / 100 + i * 0.03, // + tiny per-row jitter, never two equal
    type: 'income',
    date: displayDate(d),
  }));
  return { id: 'kit-3-grabfood-payout', title: 'GrabFood Driver: Weekly Payouts', rows };
}

function buildMixedMonthKit(rng: () => number, now: Date): Kit {
  const merchants: { name: string; category: string; band: [number, number]; type: 'expense' | 'income' }[] = [
    { name: 'GrabFood Payout', category: 'income', band: [300, 700], type: 'income' },
    { name: 'Air Selangor', category: 'bills', band: [20, 70], type: 'expense' },
    { name: 'Foodpanda', category: 'dining', band: [15, 90], type: 'expense' },
    { name: 'Pasar Malam', category: 'dining', band: [10, 60], type: 'expense' },
    { name: 'Maxis Prepaid', category: 'bills', band: [15, 75], type: 'expense' },
    { name: 'Watsons', category: 'health', band: [15, 140], type: 'expense' },
    { name: 'Touch n Go Reload', category: 'transport', band: [30, 150], type: 'expense' },
    { name: 'Shopee', category: 'shopping', band: [35, 300], type: 'expense' },
    { name: '99 Speedmart', category: 'groceries', band: [25, 200], type: 'expense' },
  ];
  const days = spreadDays(now, merchants.length);
  const rows: KitRow[] = merchants.map((m, i) => ({
    merchant: m.name,
    category: m.category,
    amount: Math.round(logUniform(rng, m.band[0], m.band[1]) * 100) / 100,
    type: m.type,
    date: displayDate(days[i]),
  }));
  return { id: 'kit-4-mixed-month', title: 'E-Wallet: Mixed Month', rows };
}

/** The fabricated kit: all round income-only amounts (RM500/1,000/2,000)  the confidence-drop
 *  beat (spec E). Round ratio must read 100% and it must trip the round-number/plausibility
 *  checks, never the hard integrity floor (that drama belongs to the console's flagged path). */
function buildFabricatedKit(now: Date): Kit {
  const amounts = [500, 1000, 2000, 500, 1000, 2000];
  const days = spreadDays(now, amounts.length);
  const rows: KitRow[] = amounts.map((amount, i) => ({
    merchant: 'Client Payment',
    category: 'income',
    amount,
    type: 'income',
    date: displayDate(days[i]),
  }));
  return { id: 'kit-5-fabricated', title: 'Bank Transfer: Statement', rows };
}

// ── HTML rendering ───────────────────────────────────────────────────────────────────────
// A phone-sized (390x844) mockup per kit, styled distinctly per source so the vision model
// sees varied real-world statement chrome, not five copies of the same layout. Every template
// carries a corner "DEMO" watermark (spec A7) so nothing here could be mistaken for a real
// financial document if it ever leaked out of this repo.

function rm(n: number): string {
  return `RM${n.toFixed(2)}`;
}

function watermark(): string {
  return `<div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.55);color:#fff;font:700 10px/1 sans-serif;letter-spacing:.08em;padding:3px 8px;border-radius:4px;z-index:5;">DEMO</div>`;
}

function renderRow(row: KitRow, accent: string): string {
  const sign = row.type === 'income' ? '+' : '−';
  const color = row.type === 'income' ? '#1f8a5b' : '#16201b';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eef1ee;">
      <div>
        <div style="font:600 14px/1.3 sans-serif;color:#16201b;">${row.merchant}</div>
        <div style="font:400 11px/1.3 sans-serif;color:#8a938e;margin-top:2px;">${row.date} &middot; ${row.category}</div>
      </div>
      <div style="font:700 14px/1 sans-serif;color:${color};">${sign}${rm(row.amount)}</div>
    </div>`;
}

function renderKitHtml(kit: Kit, opts: { headerBg: string; headerFg: string; brand: string }): string {
  const total = kit.rows.reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${kit.title} (DEMO)</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #dfe3df; font-family: sans-serif; }
  .phone { position: relative; width: 390px; height: 844px; margin: 20px auto; background: #fff; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.25); border-radius: 28px; }
</style>
</head>
<body>
  <div class="phone">
    ${watermark()}
    <div style="background:${opts.headerBg};color:${opts.headerFg};padding:22px 18px 18px;">
      <div style="font:700 12px/1 sans-serif;letter-spacing:.08em;text-transform:uppercase;opacity:.75;">${opts.brand}</div>
      <div style="font:700 20px/1.3 sans-serif;margin-top:6px;">${kit.title}</div>
      <div style="font:400 12px/1 sans-serif;opacity:.8;margin-top:10px;">Net this period: ${total >= 0 ? '+' : '−'}${rm(Math.abs(total))}</div>
    </div>
    <div style="overflow-y:auto;">
      ${kit.rows.map((r) => renderRow(r, opts.headerBg)).join('')}
    </div>
  </div>
</body>
</html>`;
}

const KIT_STYLES: Record<string, { headerBg: string; headerFg: string; brand: string }> = {
  'kit-1-tng-ewallet': { headerBg: '#0a2540', headerFg: '#ffffff', brand: "Touch 'n Go eWallet" },
  'kit-2-mae-bank': { headerBg: '#ffc800', headerFg: '#111111', brand: 'Maybank2u  MAE' },
  'kit-3-grabfood-payout': { headerBg: '#00b14f', headerFg: '#ffffff', brand: 'Grab Driver' },
  'kit-4-mixed-month': { headerBg: '#1f8a5b', headerFg: '#ffffff', brand: 'E-Wallet' },
  'kit-5-fabricated': { headerBg: '#2b2f36', headerFg: '#ffffff', brand: 'Bank Transfer History' },
};

/** Committed PRNG seed (spec A1): same seed always produces the same kit. */
const SEED = 4207;

export function buildDemoKit(now: Date = new Date()): Kit[] {
  const rng = mulberry32(SEED);
  return [
    buildTngKit(rng, now),
    buildMaeKit(rng, now),
    buildGrabPayoutKit(rng, now),
    buildMixedMonthKit(rng, now),
    buildFabricatedKit(now),
  ];
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const kits = buildDemoKit(new Date());
  for (const kit of kits) {
    const style = KIT_STYLES[kit.id];
    const html = renderKitHtml(kit, style);
    const outFile = path.join(OUT_DIR, `${kit.id}.html`);
    fs.writeFileSync(outFile, html);
    console.log(`Wrote ${outFile} (${kit.rows.length} rows).`);
  }
  console.log('Open each file in a browser at ~390x844 and screenshot into tools/demoKit/out/ (see README.md).');
}

if (require.main === module) main();
