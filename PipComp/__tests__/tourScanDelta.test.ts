// Interactive Judge Tour acceptance (spec 2026-07-16): scanning the bundled kit-1 sample
// statement over the default demo persona must visibly move the coverage chip  the
// mission's "you moved the number" beat can never silently go flat. Runs the REAL coverage
// engine over the real seed builder plus kit-1's own generated rows. If this fails, retune
// the kit's date spread in tools/demoKit/build.ts, not this test.
import { buildAinaSeed } from '../src/data/demoSeed';
import { buildDemoKit } from '../tools/demoKit/build';
import { computeCoverage } from '../src/lib/coverage';

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** Kit rows carry display dates ('9 Jul 2026') inside the current month at build time; map
 *  them back to ISO the same way the extraction flow would date a scanned row. */
function kitRowIso(display: string, now: Date): string {
  const [dayStr, mon, yearStr] = display.split(' ');
  const d = new Date(Date.UTC(yearStr ? Number(yearStr) : now.getUTCFullYear(), MONTHS[mon], Number(dayStr)));
  return d.toISOString();
}

describe('tour scan mission coverage delta', () => {
  // Fixed mid-month date: kit rows spread across elapsed days, so use a `now` with room.
  const now = new Date('2026-07-16T12:00:00Z');

  it('scanning kit-1 adds at least one new covered day to the Aina seed', () => {
    const seed = buildAinaSeed(now);
    const seedTxns = seed.transactions.map((t) => ({ date: t.date ?? null, createdAt: t.date ?? now.toISOString(), source: t.source ?? ('extracted' as const) }));
    const before = computeCoverage(seedTxns, now);

    const kit1 = buildDemoKit(now).find((k) => k.id === 'kit-1-tng-ewallet')!;
    const kitTxns = kit1.rows.map((r) => ({ date: kitRowIso(r.date, now), createdAt: now.toISOString(), source: 'extracted' as const }));
    const after = computeCoverage([...seedTxns, ...kitTxns], now);

    expect(after.daysCovered).toBeGreaterThan(before.daysCovered);
  });
});
