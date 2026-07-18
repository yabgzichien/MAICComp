// Judge guided tour  console, v2 (Interactive Console Tour, 2026-07-17). Pure step registry,
// upgrading the passive Brief-M wizard into the same hands-on script as the borrower app's
// `PipComp/src/lib/tourSteps.ts`: `explain` steps read like before (auto-navigate + spotlight
// + Next), `do` steps wait for the officer's own action (soft-gated, always skippable) and
// advance when the matching semantic signal fires. No UI here; Console.tsx drives the real tab
// state, spotlight, and signal subscription from this data. Kept separate from the tour's
// runtime state so the steps stay trivially unit-testable.

export type ConsoleTourTab = 'verify' | 'portfolio' | 'capital' | 'policy';
export type ConsoleTourStepKind = 'explain' | 'do';

/** Semantic events the console emits while the tour listens (see `lib/tourSignals.ts`). The
 *  union lives here so the registry  the source of truth for what the tour understands  has
 *  no import in the signals direction. */
export type ConsoleTourSignal = 'pipeline-seeded' | 'assessed' | 'memo-opened' | 'letter-generated' | 'flagged-loaded';

export interface ConsoleTourStep {
  id: string;
  kind: ConsoleTourStepKind;
  tab: ConsoleTourTab;
  /** 1-based act number; contiguous and non-decreasing across the registry. */
  act: number;
  /** Short act name shown on the completion meter. Consistent within an act. */
  actLabel: string;
  title: string;
  /** Kept to ~2 lines on screen (UI/UX C5: one idea, ~12 words, verdict first). May carry
   *  `{officer}` / `{lender}` tokens when `persona` is set (filled at render). */
  body: string;
  /** Optional TourAnchor id to spotlight on this step. Anchors are enhancement, never a
   *  dependency  a step with none (or a mismatched one) still renders card-only. */
  anchorId?: string;
  /** Required on `do` steps: the semantic signal the officer's own action fires. */
  advanceOn?: ConsoleTourSignal;
  /** Short line for the checkmark beat when a do-step completes. */
  celebrate?: string;
  /** Body carries persona tokens to fill with the active lender/officer (act 1 opener). */
  persona?: boolean;
  /** The closing recap card. */
  finale?: boolean;
}

export const CONSOLE_TOUR_STEPS: ConsoleTourStep[] = [
  // ── Act 1 · Take your seat ──────────────────────────────────────────────────
  {
    id: 'seat',
    kind: 'explain',
    tab: 'verify',
    act: 1,
    actLabel: 'Take your seat',
    persona: true,
    title: 'You are the credit officer',
    body: "You are {officer} at {lender}. Aina's passport just landed, already verified.",
  },
  {
    id: 'trust',
    kind: 'explain',
    tab: 'verify',
    act: 1,
    actLabel: 'Take your seat',
    anchorId: 'trust-panel',
    title: 'Five trust checks',
    body: 'Signature, issuer, freshness, consent, stacking. Five checks before any score is shown.',
  },
  // ── Act 2 · Fill your desk ──────────────────────────────────────────────────
  {
    id: 'seed',
    kind: 'do',
    tab: 'verify',
    act: 2,
    actLabel: 'Fill your desk',
    anchorId: 'seed-button',
    advanceOn: 'pipeline-seeded',
    title: "Populate today's queue",
    body: 'Your turn: click Seed demo pipeline to fill the applications queue.',
    celebrate: 'Your desk is live.',
  },
  {
    id: 'queues',
    kind: 'explain',
    tab: 'verify',
    act: 2,
    actLabel: 'Fill your desk',
    anchorId: 'queue-rail',
    title: 'Your whole book',
    body: 'New, referred, approved, declined, watchlist. The whole book, at a glance.',
  },
  // ── Act 3 · Make the call ───────────────────────────────────────────────────
  {
    id: 'assess',
    kind: 'do',
    tab: 'verify',
    act: 3,
    actLabel: 'Make the call',
    anchorId: 'assess-button',
    advanceOn: 'assessed',
    title: 'Assess her loan',
    body: 'Your turn: set an amount and click Assess.',
    celebrate: 'You ran the engine.',
  },
  {
    id: 'decision',
    kind: 'explain',
    tab: 'verify',
    act: 3,
    actLabel: 'Make the call',
    anchorId: 'decision-card',
    title: 'A deterministic verdict',
    body: 'Verdict, loss waterfall, and any counter-offer. Deterministic and fully auditable.',
  },
  {
    id: 'memo',
    kind: 'do',
    tab: 'verify',
    act: 3,
    actLabel: 'Make the call',
    anchorId: 'memo-button',
    advanceOn: 'memo-opened',
    title: 'Open the audit memo',
    body: 'Your turn: click Generate audit memo, the audit-ready writeup.',
    celebrate: "That's the paper trail.",
  },
  {
    id: 'letter',
    kind: 'do',
    tab: 'verify',
    act: 3,
    actLabel: 'Make the call',
    anchorId: 'letter-button',
    advanceOn: 'letter-generated',
    title: 'Issue the notice',
    body: 'Your turn: generate the adverse-action letter for this decline.',
    celebrate: 'Compliant notice issued.',
  },
  // ── Act 4 · Catch a fraudster ───────────────────────────────────────────────
  {
    id: 'flagged',
    kind: 'explain',
    tab: 'verify',
    act: 4,
    actLabel: 'Catch a fraudster',
    anchorId: 'fraud-signals',
    title: 'The integrity rings',
    body: 'When a fabricated passport is verified, the asymmetric integrity rings fire and confidence collapses — the engine declines automatically.',
  },
  {
    id: 'signals',
    kind: 'explain',
    tab: 'verify',
    act: 4,
    actLabel: 'Catch a fraudster',
    anchorId: 'fraud-signals',
    title: 'The rings fired',
    body: 'Round numbers, Benford breaks, ML flag. Confidence collapses, the loan is declined.',
  },
  // ── Act 5 · The flywheel & the book ─────────────────────────────────────────
  {
    id: 'policy',
    kind: 'explain',
    tab: 'policy',
    act: 5,
    actLabel: 'The flywheel & the book',
    anchorId: 'policy-thresholds',
    title: 'The flywheel',
    body: 'These thresholds are exactly what borrowers are coached toward on the other app.',
  },
  {
    id: 'portfolio',
    kind: 'explain',
    tab: 'portfolio',
    act: 5,
    actLabel: 'The flywheel & the book',
    anchorId: 'portfolio-bands',
    title: 'The approved book',
    body: 'The approved book by band and purpose. Concentration risk, visible at a glance.',
  },
  {
    id: 'capital',
    kind: 'explain',
    tab: 'capital',
    act: 5,
    actLabel: 'The flywheel & the book',
    anchorId: 'capital-tranches',
    title: 'Structure the book',
    body: 'Bundle the book into rated tranches. Capital-markets AI funds the informal economy.',
  },
  {
    id: 'finale',
    kind: 'explain',
    tab: 'capital',
    act: 5,
    actLabel: 'The flywheel & the book',
    finale: true,
    title: 'You ran the desk',
    body: "You verified, decided, caught fraud, and structured a book. That's Pip Credit, lender-side.",
  },
];

/** Fill the persona tokens in a step body with the active lender's name and officer. Leaves a
 *  non-persona body untouched; a missing field falls back to a neutral label. */
export function fillPersona(body: string, ctx: { officer?: string; lender?: string }): string {
  return body
    .replace(/\{officer\}/g, ctx.officer || 'the loan officer')
    .replace(/\{lender\}/g, ctx.lender || 'your institution');
}

/** Validates the registry's own invariants: unique non-empty ids, known tabs, kind rules (do
 *  needs advanceOn, explain carries none), and contiguous acts with consistent labels. Returns
 *  an empty array when the registry is valid. */
export function validateConsoleTourSteps(steps: ConsoleTourStep[], validTabs: readonly string[]): string[] {
  const problems: string[] = [];
  if (steps.length === 0) problems.push('tour has no steps');
  const seen = new Set<string>();
  const actLabels = new Map<number, string>();
  let prevAct = 0;
  for (const step of steps) {
    if (!step.id) problems.push('a step has an empty id');
    if (seen.has(step.id)) problems.push(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (!validTabs.includes(step.tab)) problems.push(`step ${step.id} targets unknown tab: ${step.tab}`);

    if (step.kind === 'do' && !step.advanceOn) problems.push(`do step ${step.id} has no advanceOn`);
    if (step.kind === 'explain' && step.advanceOn) problems.push(`explain step ${step.id} must not have advanceOn`);

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
export function actProgress(steps: ConsoleTourStep[], index: number): { act: number; totalActs: number; actLabel: string } {
  const step = steps[clampConsoleTourStep(index, steps.length)];
  const totalActs = steps.reduce((max, s) => Math.max(max, s.act), 0);
  return { act: step?.act ?? 1, totalActs, actLabel: step?.actLabel ?? '' };
}

export function clampConsoleTourStep(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
