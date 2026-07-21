// Judge guided tour  borrower app, v2 (Interactive Judge Tour spec, 2026-07-16). Pure step
// registry: no UI, no state. `Root` in App.tsx drives the real screen state machine from this
// data; nothing here renders anything or knows about React. The v2 registry upgrades the
// passive wizard into a 5-act hands-on script: `explain` steps read like before, `do` steps
// wait for the judge's own tap (soft-gated, always skippable), and the single `mission` step
// walks the real scan flow phase by phase. Kept separate from the tour's runtime state
// (App.tsx local state, persisted via metaRepo) so the steps stay trivially unit-testable.

/** The screens the tour can land on  a subset of App.tsx's `Screen` union, kept separate so
 *  this module has zero dependency on the app shell. Includes 'attacks' only as an optional
 *  step ACTION target (see `actionScreen`), never a step's own `screen`. */
export type TourScreen = 'home' | 'credit' | 'coach' | 'passport' | 'kyc';
export type TourActionScreen = TourScreen | 'attacks';

/** Semantic events the app emits while the tour listens (see `lib/tourSignals.ts`). The
 *  union lives here so the registry  the source of truth for what the tour understands
 *  has no import in the signals direction. */
export type TourSignalName = 'scan-extracted' | 'scan-saved' | 'coach-chip-tapped' | 'kyc-verified' | 'kyc-occupation-saved' | 'passport-minted';

/** What completes a do-step or a mission phase: the judge arriving on a screen, or a
 *  semantic signal firing. */
export type TourAdvance = { screen: TourScreen; signal?: never } | { signal: TourSignalName; screen?: never };

export type TourStepKind = 'explain' | 'do' | 'mission';

/** Pip's expression while narrating a step. Mirrors the `PipExpr` union in
 *  `components/Pip.tsx` by value; duplicated here so lib stays free of component imports. */
export type TourPip = 'idle' | 'happy' | 'think' | 'curious';

export interface TourMissionPhase {
  /** One line shown on the slim mission banner while this phase is active. */
  instruction: string;
  advanceOn: TourAdvance;
}

export interface TourStep {
  id: string;
  kind: TourStepKind;
  screen: TourScreen;
  /** 1-based act number; contiguous and non-decreasing across the registry. */
  act: number;
  /** Short act name shown on the completion meter ("Meet Aina"). Consistent within an act. */
  actLabel: string;
  pip: TourPip;
  title: string;
  /** Kept to ~2 lines on screen (UI/UX C5: one idea, ~12 words, verdict first). */
  body: string;
  /** Optional TourAnchor id to spotlight on this step. Anchors are enhancement, never a
   *  dependency  a step with none (or a mismatched one) still renders card-only. */
  anchorId?: string;
  /** Required on `do` steps: what the judge's own action looks like. */
  advanceOn?: TourAdvance;
  /** Required on `mission` steps: the start button label plus the phased walk. */
  mission?: { cta: string; phases: TourMissionPhase[] };
  /** Short line for the checkmark beat when a do/mission step completes. */
  celebrate?: string;
  /** Optional secondary deep-link button. Ends the tour and opens `actionScreen` directly. */
  actionLabel?: string;
  actionScreen?: TourActionScreen;
}

export const BORROWER_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    kind: 'explain',
    screen: 'home',
    act: 1,
    actLabel: 'Meet Aina',
    pip: 'happy',
    title: 'Welcome to Pip Credit',
    body: 'You are Aina, a gig seller with no payslip. In two minutes you will build her credit yourself.',
  },
  {
    id: 'coverage',
    kind: 'explain',
    screen: 'home',
    act: 1,
    actLabel: 'Meet Aina',
    pip: 'think',
    title: 'Coverage unlocks credit',
    body: 'This chip counts recorded days, not logins. Remember the number. You are about to move it.',
    anchorId: 'coverage-chip',
  },
  {
    id: 'open-credit',
    kind: 'do',
    screen: 'home',
    act: 2,
    actLabel: 'See the score',
    pip: 'curious',
    title: 'Open her score',
    body: 'Your turn: tap the Credit card below.',
    anchorId: 'credit-hero-card',
    advanceOn: { screen: 'credit' },
    celebrate: 'You opened the score.',
  },
  {
    id: 'credit-score',
    kind: 'explain',
    screen: 'credit',
    act: 2,
    actLabel: 'See the score',
    pip: 'think',
    title: 'A transparent score',
    body: 'Score, data confidence, and every factor visible. Nothing is a black box.',
    anchorId: 'credit-gauge',
  },
  {
    id: 'scan-mission',
    kind: 'mission',
    screen: 'home',
    act: 3,
    actLabel: 'Move the number',
    pip: 'curious',
    title: 'Add real data yourself',
    body: 'Do what a borrower does: scan a statement. Upload your own, or pick a sample.',
    mission: {
      cta: 'Add a statement',
      phases: [
        { instruction: 'Upload your own screenshot, or tap a provided sample.', advanceOn: { signal: 'scan-extracted' } },
        { instruction: 'Confirm a category for each row, then save.', advanceOn: { signal: 'scan-saved' } },
        { instruction: 'Saved. Tap Done to head back home.', advanceOn: { screen: 'home' } },
      ],
    },
    celebrate: 'You moved her coverage.',
  },
  {
    id: 'coverage-delta',
    kind: 'explain',
    screen: 'home',
    act: 3,
    actLabel: 'Move the number',
    pip: 'happy',
    title: 'You moved the number',
    body: 'The chip changed because of what you scanned. Real data, real movement.',
    anchorId: 'coverage-chip',
  },
  {
    id: 'open-coach',
    kind: 'do',
    screen: 'credit',
    act: 4,
    actLabel: 'Get the plan',
    pip: 'curious',
    title: 'Ask Pip for the plan',
    body: 'Your turn: tap Build my score.',
    anchorId: 'build-score-cta',
    advanceOn: { screen: 'coach' },
    celebrate: 'Coach opened.',
  },
  {
    id: 'coach-plan',
    kind: 'explain',
    screen: 'coach',
    act: 4,
    actLabel: 'Get the plan',
    pip: 'think',
    title: 'A real before and after',
    body: 'Reach 30 recorded days and the RM500 refer becomes roughly RM3,700 approved. Live engine.',
    anchorId: 'coach-hero-card',
  },
  {
    id: 'whatif',
    kind: 'do',
    screen: 'coach',
    act: 4,
    actLabel: 'Get the plan',
    pip: 'curious',
    title: 'Test a lever yourself',
    body: 'Tap any what-if chip to run a real simulation.',
    anchorId: 'whatif-chips',
    advanceOn: { signal: 'coach-chip-tapped' },
    celebrate: 'That ran the real engines.',
  },
  {
    // Deliberately its own step, not folded into 'whatif': the first tap only PROVES the
    // judge engaged. It must not also whisk them straight to Act 5  they need to actually
    // see the before/after result and be free to try other chips before moving on. An explain
    // step (not a do) so it renders a real Next button and the judge decides when they're done.
    // The anchor widens from the chip row to 'whatif-result', which spans the chips AND the
    // simulation card: this step is about the RESULT, so spotlighting the chips alone left the
    // judge staring at the control they'd already used instead of the outcome it produced. The
    // chips stay inside the cutout so they remain tappable (tapping the dim pauses the tour).
    id: 'whatif-explore',
    kind: 'explain',
    screen: 'coach',
    act: 4,
    actLabel: 'Get the plan',
    pip: 'happy',
    title: 'See it land',
    body: 'Try more chips if you like. The result updates live. Next when ready.',
    anchorId: 'whatif-result',
  },
  {
    id: 'kyc-verify',
    kind: 'do',
    screen: 'kyc',
    act: 5,
    actLabel: 'Mint the passport',
    pip: 'curious',
    // Deliberately no anchor: this step's action spans the whole KYC form (prefill button
    // at the top, Verify at the bottom, then the work & income fields and Done further
    // down), and a cutout around any one control walls the others off behind the dim. The
    // screen itself is the focus; KycScreen adds tour-time bottom padding so every control
    // can scroll clear of the card.
    title: 'Verify her identity',
    body: 'Her identity and work & income are already filled in. Tap Verify, then Done.',
    advanceOn: { signal: 'kyc-occupation-saved' },
    celebrate: 'Identity verified.',
  },
  {
    id: 'mint-passport',
    kind: 'do',
    screen: 'passport',
    act: 5,
    actLabel: 'Mint the passport',
    pip: 'curious',
    title: 'Mint her passport',
    body: 'Choose what to share, tier by tier, then mint. Consent is hers.',
    advanceOn: { signal: 'passport-minted' },
    celebrate: 'Passport minted.',
  },
  {
    id: 'passport',
    kind: 'explain',
    screen: 'passport',
    act: 5,
    actLabel: 'Mint the passport',
    pip: 'happy',
    title: 'The Credit Passport',
    body: 'Signed, aggregate only, and carrying her rising momentum. Lenders verify it offline.',
    anchorId: 'passport-card',
  },
  {
    id: 'finale',
    kind: 'explain',
    screen: 'passport',
    act: 5,
    actLabel: 'Mint the passport',
    pip: 'happy',
    title: 'You did the loop',
    body: 'You added data, moved coverage, tested the plan, and minted a verified passport.',
    actionLabel: 'Try the Attack Gallery',
    actionScreen: 'attacks',
  },
];

/** Validates the registry's own invariants: unique non-empty ids, known screens, kind rules
 *  (do needs advanceOn, mission needs phases, explain carries neither), contiguous acts with
 *  consistent labels, and action pairing. Returns an empty array when the registry is valid. */
export function validateTourSteps(steps: TourStep[], validScreens: readonly string[]): string[] {
  const problems: string[] = [];
  if (steps.length === 0) problems.push('tour has no steps');
  const seen = new Set<string>();
  const actLabels = new Map<number, string>();
  let prevAct = 0;
  for (const step of steps) {
    if (!step.id) problems.push('a step has an empty id');
    if (seen.has(step.id)) problems.push(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (!validScreens.includes(step.screen)) problems.push(`step ${step.id} targets unknown screen: ${step.screen}`);
    if (step.actionScreen && !validScreens.includes(step.actionScreen)) problems.push(`step ${step.id} has an action targeting unknown screen: ${step.actionScreen}`);
    if ((step.actionLabel && !step.actionScreen) || (!step.actionLabel && step.actionScreen)) {
      problems.push(`step ${step.id}: actionLabel and actionScreen must be set together`);
    }

    if (step.kind === 'do' && !step.advanceOn) problems.push(`do step ${step.id} has no advanceOn`);
    if (step.kind === 'explain' && (step.advanceOn || step.mission)) {
      problems.push(`explain step ${step.id} must not have advanceOn or mission`);
    }
    if (step.kind === 'mission') {
      if (!step.mission || step.mission.phases.length === 0) problems.push(`mission step ${step.id} has no phases`);
      step.mission?.phases.forEach((phase, i) => {
        if (phase.advanceOn.screen && !validScreens.includes(phase.advanceOn.screen)) {
          problems.push(`step ${step.id} phase ${i + 1} advances on unknown screen: ${phase.advanceOn.screen}`);
        }
      });
    }
    if (step.advanceOn?.screen && !validScreens.includes(step.advanceOn.screen)) {
      problems.push(`step ${step.id} advances on unknown screen: ${step.advanceOn.screen}`);
    }

    if (prevAct === 0 && step.act !== 1) problems.push('first step must start act 1');
    if (step.act > prevAct + 1) problems.push(`acts must be contiguous: step ${step.id} jumps to act ${step.act}`);
    if (step.act < prevAct) problems.push(`acts must not regress: step ${step.id} returns to act ${step.act}`);
    prevAct = Math.max(prevAct, step.act);
    const label = actLabels.get(step.act);
    if (label === undefined) actLabels.set(step.act, step.actLabel);
    else if (label !== step.actLabel) problems.push(`act ${step.act} has inconsistent labels`);
  }
  return problems;
}

/** Act-meter derivation for the tour card and resume chip. */
export function actProgress(steps: TourStep[], index: number): { act: number; totalActs: number; actLabel: string } {
  const step = steps[clampTourStep(index, steps.length)];
  const totalActs = steps.reduce((max, s) => Math.max(max, s.act), 0);
  return { act: step?.act ?? 1, totalActs, actLabel: step?.actLabel ?? '' };
}

export function clampTourStep(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
