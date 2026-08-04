/**
 * Generates the evaluation tables for the paper's Section 6, and verifies the
 * properties the paper claims about them.
 *
 * This is a harvest, not a new experiment: every number here comes from running
 * the committed engines on the committed corpus. The ablation arm re-runs the
 * SAME ledgers with the per-row income/expense labels stripped, which is the
 * documented back-compat path (`computeDataConfidence` leaves the integrity
 * rings inert when no row carries a `type`). That reproduces exactly what the
 * system scored before the rings existed, so the difference between the two
 * columns is the rings' contribution and nothing else.
 *
 * Writes paper/tables/evaluation-tables.md. Deterministic by construction: no
 * clock, no RNG, no I/O into the computation.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ATTACKS,
  PROBE,
  controlLedger,
  runControl,
  runGallery,
  signalLabel,
} from '../src/lib/attackGallery';
import { computeDataConfidence, type ConfidenceTxn } from '../src/lib/dataConfidence';
import { leadingDigitHistogram } from '../src/lib/transactionSignals';
import { decideLoan, DEFAULT_PRODUCTS, type Decision } from '../src/lib/loans';

/** Mirrors the narrow-band gig fixture in dataConfidence.test.ts (Section 5 fairness case a).
 *  Kept in step with that file by hand; both generate 60 daily payouts in RM80-120. */
function gigIncomeAmounts(): number[] {
  return Array.from({ length: 60 }, (_, i) => 80 + ((i * 7) % 40) + 0.45);
}

/** Strip the fields the rings need, leaving every other input identical. */
function stripIntegrityInputs(txns: ConfidenceTxn[]): ConfidenceTxn[] {
  return txns.map(({ type, merchantRaw, balance, ...rest }) => rest);
}

/** The caller-supplied expense ratio feeding the plausibility check. It predates
 *  the rings, so the ablation arm keeps it identical: only the rings are removed. */
function expenseRatioOf(txns: ConfidenceTxn[]): number {
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return income > 0 ? Math.min(expense / income, 1) : 1;
}

function decideAt(confidence: number, floorBreached: boolean): Decision {
  return decideLoan({
    score: PROBE.score,
    band: PROBE.band,
    confidence,
    avgMonthlySurplus: PROBE.avgSurplus,
    monthlyDebtService: 0,
    avgIncome: PROBE.avgIncome,
    requestedAmount: PROBE.request,
    products: DEFAULT_PRODUCTS,
    coverageRatio: 1,
    coverageDaysCovered: 90,
    integrityFloorBreached: floorBreached,
  }).decision;
}

interface Row {
  id: string;
  name: string;
  txnCount: number;
  baselineConfidence: number;
  baselineDecision: Decision;
  ringsConfidence: number;
  ringsDecision: Decision;
  hardCapped: boolean;
  floorBreached: boolean;
  verdict: string;
  signals: string[];
}

function harvest(): { rows: Row[]; control: Row } {
  const rows = ATTACKS.map((attack): Row => {
    const txns = attack.build();
    const ratio = expenseRatioOf(txns);
    const withRings = runGallery().find((r) => r.id === attack.id)!;
    const baseline = computeDataConfidence(stripIntegrityInputs(txns), 1, ratio);

    return {
      id: attack.id,
      name: attack.name,
      txnCount: txns.length,
      baselineConfidence: baseline.confidence,
      baselineDecision: decideAt(baseline.confidence, !!baseline.integrityFloorBreached),
      ringsConfidence: withRings.confidence,
      ringsDecision: withRings.decision,
      hardCapped: withRings.hardCapped,
      floorBreached: withRings.floorBreached,
      verdict: withRings.verdict,
      signals: withRings.signals.map((s) => `${signalLabel(s.key)}: ${s.detail}`),
    };
  });

  const ledger = controlLedger();
  const c = runControl();
  const cBase = computeDataConfidence(stripIntegrityInputs(ledger), 1, expenseRatioOf(ledger));
  const control: Row = {
    id: 'control',
    name: 'Genuine ledger (control)',
    txnCount: c.txnCount,
    baselineConfidence: cBase.confidence,
    baselineDecision: decideAt(cBase.confidence, false),
    ringsConfidence: c.confidence,
    ringsDecision: c.decision,
    hardCapped: false,
    floorBreached: false,
    verdict: c.passed ? 'approved' : 'REJECTED',
    signals: [],
  };

  return { rows, control };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const yn = (b: boolean) => (b ? 'yes' : 'no');

describe('paper Section 6 evaluation tables', () => {
  const { rows, control } = harvest();

  it('is deterministic across runs', () => {
    expect(harvest()).toEqual(harvest());
  });

  it('the control is approved and outscores every attack', () => {
    expect(control.ringsDecision).toBe('approve');
    for (const r of rows) expect(control.ringsConfidence).toBeGreaterThan(r.ringsConfidence);
  });

  it('every attack is caught once the rings are active', () => {
    for (const r of rows) expect(r.verdict).toBe('caught');
  });

  it('writes the tables', () => {
    const out: string[] = [];
    out.push('<!-- Generated by __tests__/paperTables.test.ts. Do not edit by hand. -->');
    out.push('');
    out.push('# Section 6 evaluation tables');
    out.push('');
    out.push(
      `Probe held fixed for every row: score ${PROBE.score} (${PROBE.band}), ` +
        `income RM${PROBE.avgIncome.toLocaleString('en-MY')}, surplus RM${PROBE.avgSurplus.toLocaleString('en-MY')}, ` +
        `request RM${PROBE.request.toLocaleString('en-MY')}, coverage 100% over 90 days.`
    );
    out.push('');
    out.push('## Table 1. Outcome per attack, with the genuine control');
    out.push('');
    out.push('| Attack | Rows | Confidence | Capped | Floor breached | Decision | Verdict |');
    out.push('|---|---|---|---|---|---|---|');
    for (const r of rows) {
      out.push(
        `| ${r.name} | ${r.txnCount} | ${pct(r.ringsConfidence)} | ${yn(r.hardCapped)} | ` +
          `${yn(r.floorBreached)} | ${r.ringsDecision} | ${r.verdict} |`
      );
    }
    out.push(
      `| **${control.name}** | ${control.txnCount} | **${pct(control.ringsConfidence)}** | ` +
        `${yn(control.hardCapped)} | ${yn(control.floorBreached)} | **${control.ringsDecision}** | ${control.verdict} |`
    );
    out.push('');
    out.push('## Table 2. Ablation: aggregate signals alone vs. with the integrity rings');
    out.push('');
    out.push('Same ledgers, same probe, same plausibility input. The only difference is whether');
    out.push('rows carry income/expense labels, which is what activates the rings.');
    out.push('');
    out.push('| Ledger | Aggregates only | Decision | With rings | Decision | Change |');
    out.push('|---|---|---|---|---|---|');
    for (const r of [...rows, control]) {
      const delta = r.ringsConfidence - r.baselineConfidence;
      const label = r.id === 'control' ? `**${r.name}**` : r.name;
      out.push(
        `| ${label} | ${pct(r.baselineConfidence)} | ${r.baselineDecision} | ` +
          `${pct(r.ringsConfidence)} | ${r.ringsDecision} | ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp |`
      );
    }
    out.push('');
    out.push('## Table 3. Checks that fired, per attack');
    out.push('');
    for (const r of rows) {
      out.push(`**${r.name}**`);
      out.push('');
      for (const s of r.signals) out.push(`- ${s}`);
      out.push('');
    }

    const dir = path.resolve(__dirname, '../../paper/tables');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'evaluation-tables.md'), out.join('\n'));

    // Figure data, harvested from the same engines so the plots cannot drift
    // from the tables. Rendered to SVG by paper/figures/render-figures.js.
    const injected = ATTACKS.find((a) => a.id === 'injected-salary')!.build();
    const roundNumber = ATTACKS.find((a) => a.id === 'round-number-fabrication')!.build();
    const figureData = {
      ablation: [...rows, control].map((r) => ({
        id: r.id,
        name: r.name,
        baseline: r.baselineConfidence,
        rings: r.ringsConfidence,
        isControl: r.id === 'control',
      })),
      thresholds: { decline: 0.35, hardCap: 0.39, approve: 0.7 },
      /** The eight income amounts behind Section 4.2.2's masking demonstration. */
      maskingIncome: injected.filter((t) => t.type === 'income').map((t) => t.amount),
      digitHistograms: {
        control: leadingDigitHistogram(controlLedger().map((t) => t.amount)),
        gigNarrowBand: leadingDigitHistogram(gigIncomeAmounts()),
        roundNumberAttack: leadingDigitHistogram(roundNumber.map((t) => t.amount)),
      },
    };
    fs.writeFileSync(
      path.resolve(__dirname, '../../paper/figures/figure-data.json'),
      JSON.stringify(figureData, null, 2)
    );

    // Echo the two headline tables so the run itself shows the numbers.
    console.log('\n' + out.slice(out.indexOf('## Table 1. Outcome per attack, with the genuine control')).join('\n'));
    expect(fs.existsSync(path.join(dir, 'evaluation-tables.md'))).toBe(true);
  });
});
