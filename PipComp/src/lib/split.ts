// src/lib/split.ts
// Pure, deterministic bill-splitting math and settlement matching. No UI/DB imports  unit-tested.
//
// Two invariants hold everywhere in this file:
//   1. Shares always sum to EXACTLY the gross. Anything else and the receivable stops
//      reconciling against what actually left the account.
//   2. The payer absorbs every rounding residue. RM100 across three people is
//      33.33 / 33.33 / 33.34, with the extra cent on the person who fronted the money.
import { merchantKey } from './normalize';
import type { ShareStatus, SplitMethod } from './types';

/** Ringgit to whole cents. Every internal calculation runs in cents to dodge float drift. */
export function toCents(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

/** Whole cents back to ringgit. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Splits `totalCents` across `weights` as whole cents that sum to EXACTLY `totalCents`.
 *
 * Rounding each share independently is what a naive version does, and it silently drifts:
 * three shares each rounding up a third of a cent hands out a cent nobody paid. Assigning
 * against a running cumulative target instead makes the rounding error cancel rather than
 * accumulate, so the total is exact by construction at any number of participants.
 *
 * Ported from `apportion` in belanjawankuBudget.ts, which solves the same problem for
 * whole-ringgit budget lines.
 */
export function apportionCents(weights: number[], totalCents: number): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || totalCents <= 0) return weights.map(() => 0);
  const out: number[] = [];
  let cumulative = 0;
  let assigned = 0;
  weights.forEach((w, i) => {
    cumulative += w;
    const target = i === weights.length - 1 ? totalCents : Math.round((totalCents * cumulative) / total);
    out.push(target - assigned);
    assigned = target;
  });
  return out;
}

/**
 * Stands in for the payer wherever people are addressed by id, so the itemiser can hand them
 * a line without needing a `people` row for its own user.
 */
export const SELF = '__self__';

/** One friend at the table. The payer is never in this list; they are `includeSelf`. */
export interface Participant {
  personId: string;
  /** `shares` method: how many portions this person takes. Defaults to 1. */
  weight?: number;
  /** `exact` method: the exact ringgit this person owes. */
  exact?: number;
}

export interface SplitInput {
  /** What actually left the payer's account. */
  gross: number;
  participants: Participant[];
  method: SplitMethod;
  /** False when the payer fronted money for a bill they were not part of (a gift, a group ticket). */
  includeSelf: boolean;
  /** `shares` method: how many portions the payer takes. Defaults to 1. */
  selfWeight?: number;
}

export interface SplitResult {
  /** What the ledger records as the payer's own expense. */
  ownShare: number;
  shares: { personId: string; owed: number }[];
}

/**
 * Divide a bill. The result always satisfies `ownShare + Σ owed === gross`.
 *
 * With the payer in the bill, everyone else is floored to whole cents so no friend is ever
 * asked for more than their arithmetic share, and the payer takes the remainder. With the
 * payer out of it, the friends have to absorb the whole bill between them, so the residue
 * falls on the last participant instead.
 */
export function computeSplit(input: SplitInput): SplitResult {
  const grossCents = Math.max(0, toCents(input.gross));
  const people = input.participants;

  if (input.method === 'exact') {
    const shares = people.map((p) => ({
      personId: p.personId,
      owedCents: Math.max(0, toCents(p.exact ?? 0)),
    }));
    const owedCents = Math.min(
      grossCents,
      shares.reduce((s, x) => s + x.owedCents, 0)
    );
    return {
      ownShare: fromCents(grossCents - owedCents),
      shares: shares.map((x) => ({ personId: x.personId, owed: fromCents(x.owedCents) })),
    };
  }

  const weights = people.map((p) => Math.max(0, Math.round(p.weight ?? 1)));
  const selfWeight = input.includeSelf ? Math.max(0, Math.round(input.selfWeight ?? 1)) : 0;
  const totalWeight = weights.reduce((s, w) => s + w, 0) + selfWeight;

  if (totalWeight <= 0 || grossCents <= 0) {
    return { ownShare: fromCents(grossCents), shares: people.map((p) => ({ personId: p.personId, owed: 0 })) };
  }

  if (selfWeight === 0) {
    const cents = apportionCents(weights, grossCents);
    return {
      ownShare: 0,
      shares: people.map((p, i) => ({ personId: p.personId, owed: fromCents(cents[i]) })),
    };
  }

  const cents = weights.map((w) => Math.floor((grossCents * w) / totalWeight));
  const ownCents = grossCents - cents.reduce((s, c) => s + c, 0);
  return {
    ownShare: fromCents(ownCents),
    shares: people.map((p, i) => ({ personId: p.personId, owed: fromCents(cents[i]) })),
  };
}

/**
 * Why this split cannot be saved, as a sentence the user can act on, or null when it is fine.
 *
 * The `exact` rules differ by whether the payer ate: in the bill, their share is whatever is
 * left over, so the friends' amounts only have to fit inside the gross; out of it, the friends
 * are the whole bill, so their amounts have to land on it exactly.
 */
export function validateSplit(input: SplitInput): string | null {
  if (toCents(input.gross) <= 0) return 'Enter the full bill amount first.';
  if (input.participants.length === 0) return 'Add at least one person to split with.';

  const seen = new Set<string>();
  for (const p of input.participants) {
    if (seen.has(p.personId)) return 'Someone is on this bill twice.';
    seen.add(p.personId);
  }

  if (input.method === 'exact') {
    const grossCents = toCents(input.gross);
    let owedCents = 0;
    for (const p of input.participants) {
      const cents = toCents(p.exact ?? 0);
      if (cents < 0) return 'Amounts cannot be negative.';
      owedCents += cents;
    }
    if (owedCents > grossCents) return 'Those amounts add up to more than the bill.';
    if (!input.includeSelf && owedCents !== grossCents) {
      return "You are not on this bill, so the amounts have to add up to it exactly.";
    }
    return null;
  }

  if (input.method === 'shares') {
    const totalWeight =
      input.participants.reduce((s, p) => s + Math.max(0, Math.round(p.weight ?? 1)), 0) +
      (input.includeSelf ? Math.max(0, Math.round(input.selfWeight ?? 1)) : 0);
    if (totalWeight <= 0) return 'Give at least one person a share.';
  }

  return null;
}

/** What is still owed on a share, in ringgit, never below zero. */
export function outstanding(share: { owed: number; paid: number }): number {
  return fromCents(Math.max(0, toCents(share.owed) - toCents(share.paid)));
}

/** Total open receivable across every share. This is the receivable account's balance. */
export function openReceivableTotal(shares: { owed: number; paid: number; status: ShareStatus }[]): number {
  const cents = shares.reduce(
    (s, share) => (share.status === 'open' ? s + toCents(outstanding(share)) : s),
    0
  );
  return fromCents(cents);
}

/**
 * Apply a repayment to a share. Overpayment is capped at what was owed rather than
 * turning into a negative receivable: a friend who rounds up to a nicer number is
 * making a gift, not lending you money.
 */
export function applyPayment(
  share: { owed: number; paid: number },
  amount: number
): { paid: number; status: ShareStatus } {
  const owedCents = toCents(share.owed);
  const paidCents = Math.min(owedCents, toCents(share.paid) + Math.max(0, toCents(amount)));
  return { paid: fromCents(paidCents), status: paidCents >= owedCents ? 'settled' : 'open' };
}

/* --- Itemised splitting (scan the receipt) -------------------------------- */

/** One printed line on a receipt, and who ate it. */
export interface ReceiptLine {
  id: string;
  label: string;
  /** The line total as printed, before service charge and tax. */
  amount: number;
  /** Person ids (SELF for the payer). Empty means nobody has claimed it yet. */
  assignedTo: string[];
}

/**
 * The two charges a Malaysian restaurant bill adds on top of the items. Order matters:
 * service charge applies to the subtotal, and service tax then applies to the subtotal PLUS
 * the service charge, which is how the receipt itself computes it.
 */
export interface Surcharges {
  /** Service charge, conventionally 10%. */
  serviceChargePct: number;
  /** Service tax (SST on F&B), conventionally 6%. */
  taxPct: number;
}

export const DEFAULT_SURCHARGES: Surcharges = { serviceChargePct: 10, taxPct: 6 };

export interface ItemizedResult {
  ownShare: number;
  shares: { personId: string; owed: number }[];
  /** What the items plus surcharges came to, before reconciling against the bank. */
  computedTotal: number;
  /** charged − computedTotal: a tip, a discount, or a drink added after printing. */
  difference: number;
  /** Lines nobody claimed. They are shared by everyone so the total still reconciles. */
  unassigned: ReceiptLine[];
}

/**
 * Divide a receipt line by line.
 *
 * Each line is split equally among whoever ate it, then the service charge and tax are
 * allocated in proportion to what each person's items came to. Whatever is left between that
 * and what the bank actually charged becomes a shared line split equally, because the card
 * charge is the only figure that has to reconcile: the ledger is built on what left the
 * account, not on what the paper said.
 *
 * `participants` is the full table with the payer LAST, so every rounding residue lands on
 * the person who fronted the money, exactly as the simpler methods do.
 */
export function computeItemized(
  lines: ReceiptLine[],
  surcharges: Surcharges,
  charged: number,
  participants: string[]
): ItemizedResult {
  const chargedCents = Math.max(0, toCents(charged));
  const people = participants.length > 0 ? participants : [SELF];
  const indexOf: Record<string, number> = {};
  people.forEach((id, i) => (indexOf[id] = i));

  // Per-person item subtotals. A line nobody claimed is everyone's, so the arithmetic still
  // closes rather than quietly dropping the amount.
  const subtotals = people.map(() => 0);
  const unassigned: ReceiptLine[] = [];
  let subtotalCents = 0;

  for (const line of lines) {
    const lineCents = Math.max(0, toCents(line.amount));
    if (lineCents <= 0) continue;
    subtotalCents += lineCents;

    const eaters = line.assignedTo.filter((id) => id in indexOf);
    if (eaters.length === 0) {
      unassigned.push(line);
      const each = apportionCents(people.map(() => 1), lineCents);
      people.forEach((_, i) => (subtotals[i] += each[i]));
      continue;
    }
    const each = apportionCents(eaters.map(() => 1), lineCents);
    eaters.forEach((id, i) => (subtotals[indexOf[id]] += each[i]));
  }

  const serviceCents = Math.round((subtotalCents * Math.max(0, surcharges.serviceChargePct)) / 100);
  const taxCents = Math.round(((subtotalCents + serviceCents) * Math.max(0, surcharges.taxPct)) / 100);
  const computedCents = subtotalCents + serviceCents + taxCents;

  // Surcharges ride on each person's own items. With no items at all there is nothing to ride
  // on, so they fall back to an even split.
  const surchargeWeights = subtotalCents > 0 ? subtotals : people.map(() => 1);
  const surchargeEach = apportionCents(surchargeWeights, serviceCents + taxCents);

  // The reconciliation line. Negative when the bank charged less than the paper said (a
  // discount applied at the till), which apportionCents cannot express, so it is split on the
  // absolute value and flipped back.
  const diffCents = chargedCents - computedCents;
  const diffEach = apportionCents(people.map(() => 1), Math.abs(diffCents));
  const diffSign = diffCents < 0 ? -1 : 1;

  const totals = people.map((_, i) => subtotals[i] + surchargeEach[i] + diffSign * diffEach[i]);

  const selfIndex = indexOf[SELF];
  return {
    ownShare: selfIndex === undefined ? 0 : fromCents(totals[selfIndex]),
    shares: people
      .map((id, i) => ({ personId: id, owed: fromCents(totals[i]) }))
      .filter((s) => s.personId !== SELF),
    computedTotal: fromCents(computedCents),
    difference: fromCents(diffCents),
    unassigned,
  };
}

/* --- Settlement matching ------------------------------------------------- */

/** An unsettled share, flattened with the context needed to recognise its repayment. */
export interface OpenShare {
  shareId: string;
  personId: string;
  personName: string;
  outstanding: number;
  /** The day the bill was paid; a transfer that predates it cannot be settling it. */
  billDate: string | null;
  merchant: string;
}

/** An extracted inbound row that might be someone paying you back. */
export interface SettlementCandidate {
  merchant: string;
  amount: number;
  date: string | null;
}

export interface SettlementMatch {
  share: OpenShare;
  /** How much of the inbound row goes against this share. */
  amount: number;
  partial: boolean;
  /** `strong` when both the amount and the sender's name line up. */
  confidence: 'strong' | 'likely';
}

/** How long after a bill a repayment is still plausibly for that bill. */
const SETTLEMENT_WINDOW_DAYS = 120;

/** YYYY-MM-DD out of an ISO date/datetime, or null. */
function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** Whole days from `from` to `to`, or null when either is unreadable. */
export function daysBetween(from: string | null, to: string | null): number | null {
  const a = dayOf(from);
  const b = dayOf(to);
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

/**
 * True when the transfer's label carries the person's name. A DuitNow transfer usually
 * arrives labelled with the sender, which is the strongest signal available on-device.
 * Matched per name token so "ALI BIN HASSAN" still recognises a person saved as "Ali",
 * with two-character tokens skipped so initials cannot match everything.
 */
function nameMatches(merchant: string, personName: string): boolean {
  const hay = merchantKey(merchant);
  if (!hay) return false;
  return personName
    .toLowerCase()
    .split(/\s+/)
    .filter((tok) => tok.length >= 3)
    .some((tok) => hay.includes(tok));
}

/**
 * The open share an inbound row is most likely settling, or null when nothing fits.
 *
 * A row only qualifies if it is no larger than what is outstanding (an inbound bigger than
 * the debt is something else, most likely real income) and lands inside the window after the
 * bill. Beyond that it has to agree on the amount, the sender's name, or both. Ties break on
 * the oldest bill, so the debt that has been waiting longest clears first.
 */
export function suggestSettlement(
  open: OpenShare[],
  candidate: SettlementCandidate,
  today: string
): SettlementMatch | null {
  const amountCents = toCents(candidate.amount);
  if (amountCents <= 0) return null;
  const day = dayOf(candidate.date) ?? today;

  const matches: SettlementMatch[] = [];
  for (const share of open) {
    const outstandingCents = toCents(share.outstanding);
    if (outstandingCents <= 0 || amountCents > outstandingCents) continue;

    const age = daysBetween(share.billDate, day);
    if (age !== null && (age < 0 || age > SETTLEMENT_WINDOW_DAYS)) continue;

    const amountHit = amountCents === outstandingCents;
    const nameHit = nameMatches(candidate.merchant, share.personName);
    if (!amountHit && !nameHit) continue;

    matches.push({
      share,
      amount: fromCents(amountCents),
      partial: amountCents < outstandingCents,
      confidence: amountHit && nameHit ? 'strong' : 'likely',
    });
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'strong' ? -1 : 1;
    const ageA = daysBetween(a.share.billDate, day) ?? 0;
    const ageB = daysBetween(b.share.billDate, day) ?? 0;
    return ageB - ageA;
  });
  return matches[0];
}
