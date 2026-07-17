/**
 * Judge self-scan kit acceptance tests (Demo Data plan Task 7, spec D/E). Runs `buildDemoKit`
 * directly  the numbers here define "done" for this pass, not eyeballing the HTML.
 */
import { buildDemoKit, type Kit } from './build';

const NOW = new Date('2026-07-15T12:00:00.000Z');

function roundRatio(kit: Kit): number {
  const amounts = kit.rows.map((r) => r.amount);
  return amounts.filter((a) => a > 0 && a % 1 === 0 && a % 100 === 0).length / amounts.length;
}

describe('buildDemoKit', () => {
  it('is deterministic: two calls at the same `now` produce identical output', () => {
    const a = buildDemoKit(NOW);
    const b = buildDemoKit(NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('emits exactly 5 kits', () => {
    expect(buildDemoKit(NOW)).toHaveLength(5);
  });

  it('every kit has 6-12 rows', () => {
    for (const kit of buildDemoKit(NOW)) {
      expect(kit.rows.length).toBeGreaterThanOrEqual(6);
      expect(kit.rows.length).toBeLessThanOrEqual(12);
    }
  });

  it('every row falls inside the current month as of `now`, never in the future', () => {
    const monthPrefix = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;
    for (const kit of buildDemoKit(NOW)) {
      for (const row of kit.rows) {
        // display date is 'D Mon YYYY' (year printed so vision extraction can't misdate the
        // rows into a past year)  reparse to check the window.
        const [dayStr, monStr, yearStr] = row.date.split(' ');
        expect(yearStr).toBe(String(NOW.getFullYear()));
        const parsed = new Date(`${monStr} ${dayStr}, ${yearStr}`);
        expect(parsed.getTime()).toBeLessThanOrEqual(NOW.getTime());
        expect(`${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`).toBe(monthPrefix);
      }
    }
  });

  it('the 4 genuine kits keep a round-amount ratio <= 5%', () => {
    const [kit1, kit2, kit3, kit4] = buildDemoKit(NOW);
    for (const kit of [kit1, kit2, kit3, kit4]) {
      expect(roundRatio(kit)).toBeLessThanOrEqual(0.05);
    }
  });

  it('the fabricated kit (5th) is 100% round, income-only amounts', () => {
    const [, , , , fabricated] = buildDemoKit(NOW);
    expect(roundRatio(fabricated)).toBe(1);
    expect(fabricated.rows.every((r) => r.type === 'income')).toBe(true);
    expect(fabricated.rows.every((r) => [500, 1000, 2000].includes(r.amount))).toBe(true);
  });

  it('"Kedai Kopi Ah Seng" appears in kit-1 and kit-2 (the learning beat)', () => {
    const kits = buildDemoKit(NOW);
    const kit1 = kits.find((k) => k.id === 'kit-1-tng-ewallet')!;
    const kit2 = kits.find((k) => k.id === 'kit-2-mae-bank')!;
    expect(kit1.rows.some((r) => r.merchant === 'Kedai Kopi Ah Seng')).toBe(true);
    expect(kit2.rows.some((r) => r.merchant === 'Kedai Kopi Ah Seng')).toBe(true);
  });

  it('spans at least 4 distinct categories across the genuine kits', () => {
    const kits = buildDemoKit(NOW).filter((k) => k.id !== 'kit-5-fabricated');
    const categories = new Set(kits.flatMap((k) => k.rows.map((r) => r.category)));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  it('no two rows within a kit share the exact same amount (income payouts included)', () => {
    for (const kit of buildDemoKit(NOW)) {
      if (kit.id === 'kit-5-fabricated') continue; // deliberately repeats round amounts
      const amounts = kit.rows.map((r) => r.amount);
      expect(new Set(amounts).size).toBe(amounts.length);
    }
  });
});
