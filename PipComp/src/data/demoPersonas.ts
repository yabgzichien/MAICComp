// src/data/demoPersonas.ts
// Pure UI-facing registry for the three demo personas — no db imports, so tests and screens
// can read it without dragging in expo-sqlite (the reason it lives here and not in
// demoProfile.ts, which is the persister). Same split as demoSeed.ts (builder) vs
// demoProfile.ts (persister).
import type { PipExpr } from '../components/Pip';
import type { EmploymentType } from '../db/occupationRepo';

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
 *  seeded story) — see `src/data/sampleIdentity.ts` for the same "clearly demo" convention. */
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
    story: 'Real but uneven e-wallet income. The credit-invisible gig worker.',
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
      note: 'The money looks fine. The evidence behind it does not.',
    },
    expr: 'think',
    identity: { fullName: 'Mohd Faizal Bin Ismail', nric: '880203-14-5679' },
    occupation: { occupation: 'Small trader', sector: 'Retail', employmentType: 'self-employed', tenureMonths: 8 },
  },
] as const;
