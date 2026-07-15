// Judge guided tour  borrower app (Judge Tour spec, 2026-07-12). Pure step registry: no UI,
// no state. `Root` in App.tsx drives the real screen state machine from this data; nothing
// here renders anything or knows about React. Kept separate from the tour's runtime state
// (App.tsx local state, persisted via metaRepo) so the steps themselves are trivially
// unit-testable ("step registries are valid: unique ids, screens exist, order stable").

/** The screens the tour can land on  a subset of App.tsx's `Screen` union, kept separate so
 *  this module has zero dependency on the app shell. Includes 'attacks' only as an optional
 *  step ACTION target (see `actionScreen` below), never a step's own `screen`  the tour
 *  itself stays linear and doesn't walk the Attack Gallery. */
export type TourScreen = 'home' | 'credit' | 'coach' | 'loans' | 'passport';
export type TourActionScreen = TourScreen | 'attacks';

export interface TourStep {
  id: string;
  screen: TourScreen;
  title: string;
  /** Kept to ~2 lines on screen (UI/UX C5: one idea, ~12 words, verdict first). */
  body: string;
  /** Optional TourAnchor id to spotlight on this step. Anchors are enhancement, never a
   *  dependency  a step with none (or a mismatched one) still renders card-only. */
  anchorId?: string;
  /** Optional secondary deep-link button (UI/UX P3.18: surface the Attack Gallery from the
   *  tour, not only Settings). Ends the tour and opens `actionScreen` directly. */
  actionLabel?: string;
  actionScreen?: TourActionScreen;
}

export const BORROWER_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    screen: 'home',
    title: 'Welcome to Pip Credit',
    body: "You're looking at a sample profile. Track money, build a credit score, borrow.",
  },
  {
    id: 'coverage',
    screen: 'home',
    title: 'Coverage unlocks credit',
    body: 'This chip tracks recorded days, not logins. Coverage is what unlocks credit.',
    anchorId: 'coverage-chip',
  },
  {
    id: 'credit-score',
    screen: 'credit',
    title: 'A transparent score',
    body: 'Score, data confidence, and a per-factor breakdown. Nothing is a black box.',
    anchorId: 'credit-gauge',
  },
  {
    id: 'coach-hero',
    screen: 'coach',
    title: "Pip's coach",
    body: 'A concrete next step with a real before/after. Not generic advice.',
    anchorId: 'coach-hero-card',
  },
  {
    id: 'loans',
    screen: 'loans',
    title: 'Loan tiers',
    body: 'Every tier shows its likely outcome up front, computed by the real engine.',
    anchorId: 'loans-tier-stack',
  },
  {
    id: 'passport-consent',
    screen: 'passport',
    title: 'The Credit Passport',
    body: 'Signed, aggregate-only evidence a lender can verify. Consent is tiered and explicit.',
  },
  {
    id: 'closing',
    screen: 'passport',
    title: "That's the borrower side",
    body: 'See the Lender Console next to verify this passport, and the Attack Gallery to see fraud caught live.',
    actionLabel: 'Try the Attack Gallery',
    actionScreen: 'attacks',
  },
];

/** Validates the registry's own invariants: unique, non-empty ids, in a stable (already
 *  fixed) order, and every `screen` present in the caller-supplied set of screens the host
 *  app actually renders. Returns an empty array when the registry is valid. */
export function validateTourSteps(steps: TourStep[], validScreens: readonly string[]): string[] {
  const problems: string[] = [];
  if (steps.length === 0) problems.push('tour has no steps');
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.id) problems.push('a step has an empty id');
    if (seen.has(step.id)) problems.push(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (!validScreens.includes(step.screen)) problems.push(`step ${step.id} targets unknown screen: ${step.screen}`);
    if (step.actionScreen && !validScreens.includes(step.actionScreen)) problems.push(`step ${step.id} has an action targeting unknown screen: ${step.actionScreen}`);
    if ((step.actionLabel && !step.actionScreen) || (!step.actionLabel && step.actionScreen)) {
      problems.push(`step ${step.id}: actionLabel and actionScreen must be set together`);
    }
  }
  return problems;
}

export function clampTourStep(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
