// lib/rateAdjustment.ts (Interest rate adjustment, 2026-08-06)
// The officer-facing half of Brief R's pricing assistant. priceLoan() computes ONE
// suggested rate; this module opens that into a bounded range the officer can move
// within — floor at break-even (below it the loan is loss-making in expectation),
// ceiling at the tier's published ladder rate (the assistant never surcharges past it,
// and neither may the officer). Moves beyond a fixed discretion band carry a reason
// code into the memo, which is the fair-lending expectation for a pricing exception:
// discretion is allowed, undocumented discretion is not.
// Pure; no UI imports. The console owns the slider, this owns the rules.

import type { PricingSuggestion } from './pricing';

/** Slider granularity. Officers move in 5 bps ticks, not arbitrary floats. */
export const RATE_STEP_BPS = 5;

/** How far off the assistant's suggestion an officer may move before a reason code is
 *  required. 25 bps is the common supervisory parameter for unnoted loan-officer
 *  discretion; anything wider has to be written down. */
export const DISCRETION_BAND_BPS = 25;

/** Rates are decimals per annum; every comparison in this module goes through bps so
 *  0.158 and 0.15800000000000003 are the same rate. */
export const toBps = (rate: number): number => Math.round(rate * 10000);
export const fromBps = (b: number): number => b / 10000;

export type RateReasonId =
  | 'competitive-match'
  | 'relationship'
  | 'security-offered'
  | 'risk-premium'
  | 'policy-exception'
  | 'other';

export interface RateReasonCode {
  id: RateReasonId;
  label: string;
  /** Which way the rate moved off the suggestion this code can justify. */
  direction: 'down' | 'up' | 'any';
  /** True when the code is meaningless without free text (the catch-all). */
  noteRequired: boolean;
  hint: string;
}

export const RATE_REASON_CODES: RateReasonCode[] = [
  {
    id: 'competitive-match',
    label: 'Competitive match',
    direction: 'down',
    noteRequired: false,
    hint: 'A documented rival quote on file for the same amount and tenor.',
  },
  {
    id: 'relationship',
    label: 'Relationship / retention',
    direction: 'down',
    noteRequired: false,
    hint: 'Repeat borrower in good standing this console has already been repaid by.',
  },
  {
    id: 'security-offered',
    label: 'Security or guarantor offered',
    direction: 'down',
    noteRequired: false,
    hint: 'Collateral or a guarantor the engine does not price in.',
  },
  {
    id: 'risk-premium',
    label: 'Risk premium held',
    direction: 'up',
    noteRequired: false,
    hint: 'Officer judgment that the file carries risk the band does not capture.',
  },
  {
    id: 'policy-exception',
    label: 'Policy exception approved',
    direction: 'any',
    noteRequired: true,
    hint: 'Signed-off departure from policy — name the approver in the note.',
  },
  {
    id: 'other',
    label: 'Other',
    direction: 'any',
    noteRequired: true,
    hint: 'Anything the codes above do not cover. Explain it in the note.',
  },
];

export const reasonCode = (id: RateReasonId): RateReasonCode | undefined =>
  RATE_REASON_CODES.find((c) => c.id === id);

/** The codes offered for a given move. A discount can't be justified by a risk premium
 *  and vice versa, so the list narrows with the direction the officer actually moved. */
export function reasonCodesFor(deviation: number): RateReasonCode[] {
  if (deviation === 0) return RATE_REASON_CODES;
  const moved: 'down' | 'up' = deviation < 0 ? 'down' : 'up';
  return RATE_REASON_CODES.filter((c) => c.direction === moved || c.direction === 'any');
}

export interface RateBounds {
  /** Break-even (cost of funds + expected loss) — or the suggestion itself on the
   *  degenerate policy where the ladder sits below break-even, so the suggested rate is
   *  always inside the band. */
  floorRate: number;
  /** The tier's published ladder APR. A ceiling, never something to price above. */
  ceilingRate: number;
  stepRate: number;
  /** True when floor and ceiling are within one tick: there is nothing to move. */
  locked: boolean;
}

export function rateBounds(pricing: PricingSuggestion): RateBounds {
  const ceilingRate = pricing.ladderApr;
  const floorRate = Math.min(pricing.breakEvenRate, pricing.suggestedRate, ceilingRate);
  return {
    floorRate,
    ceilingRate,
    stepRate: fromBps(RATE_STEP_BPS),
    locked: toBps(ceilingRate) - toBps(floorRate) < RATE_STEP_BPS,
  };
}

/** Clamp to the band and snap to the tick grid, so a dragged slider can never hand the
 *  engine a rate the officer wasn't allowed to pick. */
export function snapRate(rate: number, bounds: RateBounds): number {
  const lo = toBps(bounds.floorRate);
  const hi = toBps(bounds.ceilingRate);
  const snapped = Math.round(toBps(rate) / RATE_STEP_BPS) * RATE_STEP_BPS;
  return fromBps(Math.max(lo, Math.min(hi, snapped)));
}

export function inBounds(rate: number, bounds: RateBounds): boolean {
  const b = toBps(rate);
  return b >= toBps(bounds.floorRate) && b <= toBps(bounds.ceilingRate);
}

/** Net margin if the loan is written at `rate`: rate − cost of funds − expected loss.
 *  Break-even already IS cost of funds + expected loss, so the whole curve the slider
 *  needs is one subtraction off it — no need to carry the policy inputs around. */
export function netMarginAt(pricing: PricingSuggestion, rate: number): number {
  return rate - pricing.breakEvenRate;
}

/** Signed distance from the assistant's suggestion, in bps: negative = the officer
 *  discounted further, positive = the officer held a premium. */
export function deviationBps(pricing: PricingSuggestion, rate: number): number {
  return toBps(rate) - toBps(pricing.suggestedRate);
}

/** Total discount off the published ladder at `rate` — what the memo and the borrower's
 *  offer speak in. Never negative: the ladder is a ceiling. */
export function discountBpsAt(pricing: PricingSuggestion, rate: number): number {
  return Math.max(0, toBps(pricing.ladderApr) - toBps(rate));
}

export type ReasonTrigger = 'band' | 'standing' | null;

/** Why this rate needs a written reason, or null when it doesn't.
 *  - 'band'     — more than DISCRETION_BAND_BPS off the assistant's suggestion.
 *  - 'standing' — any discount at all on a file whose repayment standing already ruled
 *                 the loyalty discount out. Without this, the 25 bps free band would be
 *                 a silent way around the arrears rule. */
export function reasonTrigger(pricing: PricingSuggestion, rate: number): ReasonTrigger {
  if (!pricing.discountEligible && toBps(rate) < toBps(pricing.ladderApr)) return 'standing';
  if (Math.abs(deviationBps(pricing, rate)) > DISCRETION_BAND_BPS) return 'band';
  return null;
}

export const requiresReason = (pricing: PricingSuggestion, rate: number): boolean =>
  reasonTrigger(pricing, rate) !== null;

export interface AdjustmentDraft {
  rate: number;
  reasonCode: RateReasonId | null;
  note: string;
}

export interface AdjustmentCheck {
  ok: boolean;
  /** The one thing stopping this from being applied, in officer-facing words. */
  blocker: string | null;
  trigger: ReasonTrigger;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function checkAdjustment(pricing: PricingSuggestion, draft: AdjustmentDraft): AdjustmentCheck {
  const bounds = rateBounds(pricing);
  const trigger = reasonTrigger(pricing, draft.rate);
  if (!inBounds(draft.rate, bounds)) {
    return {
      ok: false,
      blocker: `Rate must sit between the ${pct(bounds.floorRate)} break-even floor and the ${pct(bounds.ceilingRate)} ladder ceiling.`,
      trigger,
    };
  }
  const code = draft.reasonCode ? reasonCode(draft.reasonCode) : undefined;
  if (trigger && !code) {
    return {
      ok: false,
      blocker:
        trigger === 'standing'
          ? 'Arrears on file rule out the loyalty discount. Pricing below the ladder here is an exception — pick a reason code.'
          : `This rate is more than ${DISCRETION_BAND_BPS} bps off the suggestion. Pick a reason code.`,
      trigger,
    };
  }
  if (code?.noteRequired && draft.note.trim() === '') {
    return { ok: false, blocker: `"${code.label}" needs a note explaining it.`, trigger };
  }
  return { ok: true, blocker: null, trigger };
}

/** The reason as it lands in the memo. Present only when the officer actually attached
 *  one — a move inside the band with no code selected records nothing. */
export interface AppliedReason {
  code: RateReasonId;
  label: string;
  note: string | null;
  /** Signed, off the suggestion, at the moment of applying. */
  deviationBps: number;
  trigger: ReasonTrigger;
}

/** The rate in force on a file, plus its paper trail. */
export interface AppliedRate {
  rate: number;
  reason: AppliedReason | null;
}

/** Null when the draft doesn't pass checkAdjustment — callers apply nothing rather than
 *  applying a rate whose justification is missing. */
export function buildAppliedRate(pricing: PricingSuggestion, draft: AdjustmentDraft): AppliedRate | null {
  if (!checkAdjustment(pricing, draft).ok) return null;
  const code = draft.reasonCode ? reasonCode(draft.reasonCode) : undefined;
  const note = draft.note.trim();
  return {
    rate: draft.rate,
    reason: code
      ? {
          code: code.id,
          label: code.label,
          note: note === '' ? null : note,
          deviationBps: deviationBps(pricing, draft.rate),
          trigger: reasonTrigger(pricing, draft.rate),
        }
      : null,
  };
}

export interface RatePreset {
  /** Joined with ' = ' when two anchors land on the same rate (the clamped case). */
  label: string;
  rate: number;
}

/** The three anchors worth one tap: the break-even floor, the assistant's suggestion,
 *  and the ladder ceiling. Anchors that coincide merge into one chip rather than
 *  rendering as duplicates. */
export function ratePresets(pricing: PricingSuggestion): RatePreset[] {
  const bounds = rateBounds(pricing);
  const floorLabel = toBps(bounds.floorRate) === toBps(pricing.breakEvenRate) ? 'Break-even' : 'Floor';
  const anchors: RatePreset[] = [
    { label: floorLabel, rate: bounds.floorRate },
    { label: 'Suggested', rate: pricing.suggestedRate },
    { label: 'Ladder', rate: bounds.ceilingRate },
  ];
  const merged: RatePreset[] = [];
  for (const a of anchors) {
    const hit = merged.find((m) => toBps(m.rate) === toBps(a.rate));
    if (hit) hit.label = `${hit.label} = ${a.label.toLowerCase()}`;
    else merged.push({ ...a });
  }
  return merged;
}

/** One-line restatement of an officer move, for the memo and the decision file. Speaks
 *  in bps off the suggestion, which is the number a reviewer checks the code against. */
export function adjustmentSummary(applied: AppliedRate, pricing: PricingSuggestion): string {
  const dev = deviationBps(pricing, applied.rate);
  const where =
    dev === 0
      ? `matches the ${pct(pricing.suggestedRate)} suggestion`
      : `${Math.abs(dev)} bps ${dev < 0 ? 'below' : 'above'} the ${pct(pricing.suggestedRate)} suggestion`;
  if (!applied.reason) return `Officer applied ${pct(applied.rate)}, ${where} — inside the ${DISCRETION_BAND_BPS} bps discretion band.`;
  const note = applied.reason.note ? ` Note: ${applied.reason.note}` : '';
  return `Officer applied ${pct(applied.rate)}, ${where} — ${applied.reason.label}.${note}`;
}
