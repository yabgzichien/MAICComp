import { describe, it, expect } from 'vitest';
import { priceLoan, type PricingSuggestion } from './pricing';
import {
  DISCRETION_BAND_BPS,
  RATE_STEP_BPS,
  RATE_REASON_CODES,
  adjustmentSummary,
  buildAppliedRate,
  checkAdjustment,
  deviationBps,
  discountBpsAt,
  fromBps,
  inBounds,
  netMarginAt,
  rateBounds,
  ratePresets,
  reasonCodesFor,
  reasonTrigger,
  requiresReason,
  snapRate,
  toBps,
} from './rateAdjustment';

/** A file with real room to move: a wide ladder over a low break-even. */
const strong = (over: Partial<Parameters<typeof priceLoan>[0]> = {}): PricingSuggestion =>
  priceLoan({ band: 'Good', ladderApr: 0.36, costOfFunds: 0.05, targetReturn: 0.06, ...over });

describe('rateBounds', () => {
  it('floors at break-even and ceilings at the ladder rate', () => {
    const p = strong();
    const b = rateBounds(p);
    expect(b.floorRate).toBe(p.breakEvenRate);
    expect(b.ceilingRate).toBe(p.ladderApr);
    expect(b.locked).toBe(false);
  });

  it('keeps the suggested rate inside the band even when the ladder sits below break-even', () => {
    // Degenerate policy: a 6% ladder under an 8%+ break-even. The suggestion clamps to
    // the ladder, so the floor has to follow it down or the slider could not show it.
    const p = priceLoan({ band: 'Building', ladderApr: 0.06, costOfFunds: 0.05, targetReturn: 0.06 });
    expect(p.suggestedRate).toBeLessThan(p.breakEvenRate);
    const b = rateBounds(p);
    expect(inBounds(p.suggestedRate, b)).toBe(true);
    expect(b.floorRate).toBe(p.suggestedRate);
  });

  it('locks when floor and ceiling are within one tick', () => {
    const p = priceLoan({ band: 'Good', ladderApr: 0.36, costOfFunds: 0.36, targetReturn: 0.06 });
    expect(rateBounds(p).locked).toBe(true);
  });

  it('steps in RATE_STEP_BPS ticks', () => {
    expect(rateBounds(strong()).stepRate).toBe(fromBps(RATE_STEP_BPS));
  });
});

describe('snapRate', () => {
  const b = rateBounds(strong());

  it('snaps to the tick grid', () => {
    expect(toBps(snapRate(0.14237, b)) % RATE_STEP_BPS).toBe(0);
    expect(snapRate(0.1423, b)).toBeCloseTo(0.1425, 6);
  });

  it('clamps a rate above the ladder back to the ceiling', () => {
    expect(snapRate(0.9, b)).toBe(b.ceilingRate);
  });

  it('clamps a rate below break-even back to the floor', () => {
    expect(snapRate(0.001, b)).toBe(b.floorRate);
  });

  it('is idempotent — snapping a snapped rate changes nothing', () => {
    const once = snapRate(0.2317, b);
    expect(snapRate(once, b)).toBe(once);
  });
});

describe('deviationBps / discountBpsAt', () => {
  it('signs the deviation: negative below the suggestion, positive above', () => {
    const p = strong();
    expect(deviationBps(p, p.suggestedRate)).toBe(0);
    expect(deviationBps(p, p.suggestedRate - 0.01)).toBe(-100);
    expect(deviationBps(p, p.suggestedRate + 0.01)).toBe(100);
  });

  it('measures the discount off the ladder, never negative', () => {
    const p = strong();
    expect(discountBpsAt(p, p.ladderApr)).toBe(0);
    expect(discountBpsAt(p, p.ladderApr - 0.02)).toBe(200);
    expect(discountBpsAt(p, p.ladderApr + 0.05)).toBe(0);
  });

  it('is immune to float noise — 0.158 and its float-arithmetic twin are the same rate', () => {
    const p = strong();
    const noisy = 0.36 - 0.202;
    expect(noisy).not.toBe(0.158); // sanity: these really do differ as floats
    expect(deviationBps(p, noisy)).toBe(deviationBps(p, 0.158));
  });
});

describe('netMarginAt', () => {
  it('agrees with priceLoan at both anchors', () => {
    const p = strong();
    expect(netMarginAt(p, p.ladderApr)).toBeCloseTo(p.ladder.netMargin, 12);
    expect(netMarginAt(p, p.suggestedRate)).toBeCloseTo(p.suggested.netMargin, 12);
  });

  it('is zero at break-even and negative below it', () => {
    const p = strong();
    expect(netMarginAt(p, p.breakEvenRate)).toBeCloseTo(0, 12);
    expect(netMarginAt(p, p.breakEvenRate - 0.01)).toBeLessThan(0);
  });
});

describe('reasonTrigger', () => {
  it('needs nothing inside the discretion band', () => {
    const p = strong();
    expect(reasonTrigger(p, p.suggestedRate)).toBeNull();
    expect(reasonTrigger(p, p.suggestedRate - fromBps(DISCRETION_BAND_BPS))).toBeNull();
    expect(requiresReason(p, p.suggestedRate + fromBps(DISCRETION_BAND_BPS))).toBe(false);
  });

  it('fires on the first bps past the band, in either direction', () => {
    const p = strong();
    expect(reasonTrigger(p, p.suggestedRate - fromBps(DISCRETION_BAND_BPS + 1))).toBe('band');
    expect(reasonTrigger(p, p.suggestedRate + fromBps(DISCRETION_BAND_BPS + 1))).toBe('band');
  });

  it('fires on ANY discount when standing already ruled the loyalty discount out', () => {
    // Without this the 25 bps free band would be a silent way around the arrears rule.
    const p = strong({ standingClean: false });
    expect(p.discountEligible).toBe(false);
    expect(p.suggestedRate).toBe(p.ladderApr);
    expect(reasonTrigger(p, p.ladderApr - fromBps(5))).toBe('standing');
    expect(reasonTrigger(p, p.ladderApr)).toBeNull(); // holding the ladder is not an exception
  });
});

describe('reasonCodesFor', () => {
  it('offers only downward codes for a discount', () => {
    const codes = reasonCodesFor(-100).map((c) => c.id);
    expect(codes).toContain('competitive-match');
    expect(codes).not.toContain('risk-premium');
  });

  it('offers only upward codes for a premium', () => {
    const codes = reasonCodesFor(50).map((c) => c.id);
    expect(codes).toContain('risk-premium');
    expect(codes).not.toContain('competitive-match');
  });

  it('always keeps the direction-agnostic codes available', () => {
    for (const dev of [-100, 0, 100]) {
      const codes = reasonCodesFor(dev).map((c) => c.id);
      expect(codes).toContain('policy-exception');
      expect(codes).toContain('other');
    }
  });

  it('every code carries a hint and a stable id', () => {
    expect(new Set(RATE_REASON_CODES.map((c) => c.id)).size).toBe(RATE_REASON_CODES.length);
    for (const c of RATE_REASON_CODES) expect(c.hint.length).toBeGreaterThan(0);
  });
});

describe('checkAdjustment', () => {
  const p = strong();

  it('passes an in-band move with no reason code', () => {
    const r = checkAdjustment(p, { rate: p.suggestedRate, reasonCode: null, note: '' });
    expect(r.ok).toBe(true);
    expect(r.blocker).toBeNull();
  });

  it('blocks an out-of-band move with no reason code', () => {
    const r = checkAdjustment(p, { rate: p.suggestedRate - 0.05, reasonCode: null, note: '' });
    expect(r.ok).toBe(false);
    expect(r.trigger).toBe('band');
    expect(r.blocker).toMatch(/reason code/i);
  });

  it('passes the same move once a code is attached', () => {
    const r = checkAdjustment(p, { rate: p.suggestedRate - 0.05, reasonCode: 'competitive-match', note: '' });
    expect(r.ok).toBe(true);
  });

  it('blocks a note-required code with a blank note', () => {
    const draft = { rate: p.suggestedRate - 0.05, reasonCode: 'other' as const, note: '   ' };
    expect(checkAdjustment(p, draft).ok).toBe(false);
    expect(checkAdjustment(p, { ...draft, note: 'Branch manager signed off.' }).ok).toBe(true);
  });

  it('blocks a rate outside the band outright, code or not', () => {
    const above = checkAdjustment(p, { rate: p.ladderApr + 0.01, reasonCode: 'risk-premium', note: '' });
    expect(above.ok).toBe(false);
    expect(above.blocker).toMatch(/ladder ceiling/i);
    const below = checkAdjustment(p, { rate: 0.001, reasonCode: 'competitive-match', note: '' });
    expect(below.ok).toBe(false);
  });

  it('blocks a below-ladder rate on a file with arrears until a code is attached', () => {
    const arrears = strong({ standingClean: false });
    const draft = { rate: arrears.ladderApr - fromBps(10), reasonCode: null, note: '' };
    expect(checkAdjustment(arrears, draft).blocker).toMatch(/arrears/i);
    expect(checkAdjustment(arrears, { ...draft, reasonCode: 'policy-exception', note: 'Approved by A. Rahman.' }).ok).toBe(true);
  });
});

describe('buildAppliedRate', () => {
  const p = strong();

  it('returns null for a draft that does not pass the check', () => {
    expect(buildAppliedRate(p, { rate: p.suggestedRate - 0.05, reasonCode: null, note: '' })).toBeNull();
  });

  it('records no reason for an unjustified in-band move', () => {
    const a = buildAppliedRate(p, { rate: p.suggestedRate, reasonCode: null, note: '' });
    expect(a).toEqual({ rate: p.suggestedRate, reason: null });
  });

  it('records the code, the trimmed note, and the signed deviation', () => {
    const rate = p.suggestedRate - 0.05;
    const a = buildAppliedRate(p, { rate, reasonCode: 'competitive-match', note: '  BSN quoted 12% on 2026-08-04.  ' })!;
    expect(a.rate).toBe(rate);
    expect(a.reason).toEqual({
      code: 'competitive-match',
      label: 'Competitive match',
      note: 'BSN quoted 12% on 2026-08-04.',
      deviationBps: -500,
      trigger: 'band',
    });
  });

  it('keeps a voluntarily attached code on an in-band move', () => {
    const a = buildAppliedRate(p, { rate: p.suggestedRate, reasonCode: 'relationship', note: '' })!;
    expect(a.reason?.code).toBe('relationship');
    expect(a.reason?.note).toBeNull();
    expect(a.reason?.trigger).toBeNull();
  });
});

describe('ratePresets', () => {
  it('offers break-even, suggested and ladder as three distinct chips', () => {
    const p = strong();
    const presets = ratePresets(p);
    expect(presets.map((x) => x.label)).toEqual(['Break-even', 'Suggested', 'Ladder']);
    expect(presets.map((x) => x.rate)).toEqual([p.breakEvenRate, p.suggestedRate, p.ladderApr]);
  });

  it('merges the anchors that coincide instead of rendering duplicates', () => {
    // break-even + target lands at or above the ladder, so suggested IS the ladder.
    const p = priceLoan({ band: 'Good', ladderApr: 0.15, costOfFunds: 0.05, targetReturn: 0.06 });
    expect(p.suggestedRate).toBe(p.ladderApr);
    const presets = ratePresets(p);
    expect(presets).toHaveLength(2);
    expect(presets[1].label).toBe('Suggested = ladder');
  });

  it('never offers a chip the slider cannot reach', () => {
    for (const over of [{}, { standingClean: false }, { ladderApr: 0.06 }]) {
      const p = strong(over);
      const b = rateBounds(p);
      for (const preset of ratePresets(p)) expect(inBounds(preset.rate, b)).toBe(true);
    }
  });
});

describe('adjustmentSummary', () => {
  const p = strong();

  it('states the move in bps off the suggestion, with the code and note', () => {
    const a = buildAppliedRate(p, { rate: p.suggestedRate - 0.05, reasonCode: 'competitive-match', note: 'BSN quoted 12%.' })!;
    const line = adjustmentSummary(a, p);
    expect(line).toContain('500 bps below');
    expect(line).toContain('Competitive match');
    expect(line).toContain('BSN quoted 12%.');
  });

  it('says "above" for a premium', () => {
    const a = buildAppliedRate(p, { rate: p.suggestedRate + 0.05, reasonCode: 'risk-premium', note: '' })!;
    expect(adjustmentSummary(a, p)).toContain('500 bps above');
  });

  it('names the discretion band when no reason was attached', () => {
    const a = buildAppliedRate(p, { rate: p.suggestedRate, reasonCode: null, note: '' })!;
    expect(adjustmentSummary(a, p)).toMatch(/discretion band/);
  });
});
