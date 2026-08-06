// src/data/demoPersonas.ts
// Pure UI-facing registry for the three demo personas — no db imports, so tests and screens
// can read it without dragging in expo-sqlite (the reason it lives here and not in
// demoProfile.ts, which is the persister). Same split as demoSeed.ts (builder) vs
// demoProfile.ts (persister).
import type { PipExpr } from '../components/Pip';
import type { EmploymentType } from '../db/occupationRepo';
import { TOUR_TOTAL_ACTS } from '../lib/tourSteps';

export type DemoProfileId = 'aina' | 'ravi' | 'faizal';

/** The lender outcome this persona is built to demonstrate. Advertised on the onboarding
 *  front door as a verdict pill, so a judge sees one engine produce three different answers
 *  before picking one. Pinned against the real engine in
 *  `__tests__/demoPersonaOutcomes.test.ts` — a seed tweak that flips an outcome fails the
 *  suite rather than leaving this screen advertising something untrue. */
export type DemoOutcome = {
  decision: 'approve' | 'refer' | 'decline';
  /** Pill text. Plain lender language, never jargon. */
  label: string;
  /** One short line on why — the honest reason, taken from the gate that actually decides. */
  note: string;
};

export type DemoPersona = {
  id: DemoProfileId;
  name: string;
  /** Short role line shown under the name. */
  role: string;
  /** One-line story. Kept tight — it sits on a card, not in a paragraph. */
  story: string;
  outcome: DemoOutcome;
  /** Pip's face while this persona is selected on the front door — the mascot reacts to who
   *  you picked. Cosmetic only. */
  expr: PipExpr;
  identity: { fullName: string; nric: string };
  occupation: { occupation: string; sector: string; employmentType: EmploymentType; tenureMonths: number };
};

/** Ordered best → worst outcome, so the picker reads as a range rather than a list.
 *  Names/ICs are clearly synthetic (format-valid MyKad structure, matching each persona's
 *  seeded story) — the same "clearly demo" convention the eKYC screens follow. */
export const DEMO_PROFILES: ReadonlyArray<DemoPersona> = [
  {
    id: 'ravi',
    name: 'Ravi',
    role: 'Delivery driver',
    story: 'Steady multi-platform income, strong savings, no debt.',
    outcome: {
      decision: 'approve',
      label: 'Approved',
      note: 'Enough verifiable history to decide on the spot.',
    },
    expr: 'happy',
    identity: { fullName: 'Ravindran A/L Suresh Kumar', nric: '920815-10-5271' },
    occupation: { occupation: 'Multi-platform delivery driver', sector: 'Transport / Gig economy', employmentType: 'gig', tenureMonths: 26 },
  },
  {
    id: 'aina',
    name: 'Aina',
    role: 'Online seller',
    story: 'Real but uneven e-wallet income, and no paper trail a bank would recognise.',
    outcome: {
      decision: 'refer',
      label: 'Referred',
      note: 'A human decides. Her income is real, only partly verifiable.',
    },
    expr: 'curious',
    identity: { fullName: 'Aina Binti Rahman', nric: '980412-10-5566' },
    occupation: { occupation: 'Online seller', sector: 'E-commerce / Retail', employmentType: 'micro-business', tenureMonths: 14 },
  },
  {
    id: 'faizal',
    name: 'Faizal',
    role: 'Small trader',
    story: 'Applies for working capital with plenty of income on paper.',
    outcome: {
      decision: 'decline',
      label: 'Declined',
      note: 'The money looks fine, but the evidence behind it does not hold up.',
    },
    expr: 'think',
    identity: { fullName: 'Mohd Faizal Bin Ismail', nric: '880203-14-5679' },
    occupation: { occupation: 'Small trader', sector: 'Retail', employmentType: 'self-employed', tenureMonths: 8 },
  },
] as const;

/** What the guided tour actually DOES on each ending, for the front door.
 *
 *  The three paths are not equal — the referral plays all ten acts and is the only one where the
 *  judge personally makes the lending call (the console's `approve` step exists on that branch
 *  alone); an outright approval publishes its offer at submission, so the judge reads a verdict
 *  rather than reaching one; a decline never publishes an offer, so the acceptance and servicing
 *  acts are unreachable and the script closes at the lender's desk. Left invisible, a judge
 *  discovers that asymmetry two acts from the end and reads the short path as a thin demo. This
 *  makes it a labelled choice instead.
 *
 *  Keyed on the DECISION, never on a persona id, so the copy follows the engine: if a seed change
 *  flips a persona's verdict, `outcome.decision` moves with it (pinned against the real engine by
 *  `__tests__/demoPersonaOutcomes.test.ts`) and this line moves too. The act count comes from
 *  `TOUR_TOTAL_ACTS` for the same reason. */
export const TOUR_PATH: Record<DemoOutcome['decision'], { line: string; recommended: boolean }> = {
  refer: {
    line: `All ${TOUR_TOTAL_ACTS} acts, and the only path where you make the lending call yourself.`,
    recommended: true,
  },
  approve: {
    line: 'Cleared on submission, so you read the verdict rather than reach it.',
    recommended: false,
  },
  decline: {
    line: 'The short path: no offer is ever made, so it closes at the lender’s desk.',
    recommended: false,
  },
};

/** The persona the front door opens on, and the one wearing the "start here" badge. Derived from
 *  `TOUR_PATH` rather than named, so the badge always sits on whichever borrower currently gets
 *  the fullest run of the script. */
export const RECOMMENDED_DEMO_PROFILE: DemoProfileId =
  DEMO_PROFILES.find((p) => TOUR_PATH[p.outcome.decision].recommended)?.id ?? DEMO_PROFILES[0].id;

/** Can this persona be picked as the FIRST run, on the front door?
 *
 *  Only the recommended one. A judge's first pass through a ten-act cross-app script should be
 *  the ending that plays all of it and hands them the lending decision; the two short paths land
 *  much better as "now see what changes" than as an opening move.
 *
 *  Scoped to the front door on purpose, and deliberately NOT backed by any persisted "tour
 *  finished" flag. The other two endings stay one screen away for the whole session (Profile →
 *  Demo profiles, which the console's finale card points at), so this steers the opening move
 *  without ever being a door that can get stuck shut — and the rows stay visible and labelled,
 *  because three verdicts on screen at once is the front door's own proof that one engine
 *  produces three answers. */
export function canStartWith(persona: DemoPersona): boolean {
  return TOUR_PATH[persona.outcome.decision].recommended;
}
