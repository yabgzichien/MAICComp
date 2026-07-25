// Judge guided tour  console (Unified cross-app tour, 2026-07-25; supersedes the v2
// Interactive Console Tour registry of 2026-07-17). Pure step registry: no UI here;
// Console.tsx drives the real tab state, spotlight, and signal subscription from this data.
//
// This registry is one HALF of a single ten-act script that spans two apps. The console owns
// acts 7, 8 and 10; the borrower app owns 1-6 and 9 (see `PipComp/src/lib/tourSteps.ts`, the
// mirrored registry). Act numbers are therefore GLOBAL  this registry starts at 7 and skips
// 9, which is why the validator below checks only that acts never regress, not that they are
// contiguous from 1.
//
// The officer never has their decision made for them. `do` steps wait for the officer's own
// action and advance on the matching semantic signal; `handoff` steps hand the baton back to
// the borrower app and stay put until the real record moves.

export type ConsoleTourTab = 'verify' | 'servicing' | 'portfolio' | 'capital' | 'policy';
export type ConsoleTourStepKind = 'explain' | 'do' | 'handoff';

/** Total acts in the unified script, across BOTH apps. Mirrored verbatim in the borrower
 *  registry  the two must agree or the meter jumps when the judge switches tabs. */
export const TOUR_TOTAL_ACTS = 10;

/** Which ending the script is running. Read from the REAL status of the direct-apply file this
 *  console adopted, never from a persona name the console was told. A step with no `branches`
 *  runs in all three. See the borrower registry for the full contract. */
export type ConsoleTourBranch = 'referred' | 'approved' | 'declined';

/** Semantic events the console emits while the tour listens (see `lib/tourSignals.ts`). The
 *  union lives here so the registry  the source of truth for what the tour understands  has
 *  no import in the signals direction. */
export type ConsoleTourSignal =
  | 'pipeline-seeded'
  | 'assessed'
  | 'memo-opened'
  | 'letter-generated'
  | 'flagged-loaded'
  | 'subject-opened'
  | 'application-approved'
  | 'repayment-recorded';

/** What must be true of the real loan before a handoff's Continue enables.
 *
 *  offer-answered  the borrower has accepted (or declined) the standing offer.
 *  none            nothing to wait for. */
export type ConsoleHandoffGate = 'offer-answered' | 'none';

export interface ConsoleHandoff {
  /** Where the judge is being sent. */
  target: 'borrower';
  cta: string;
  waiting: string;
  ready: string;
  gate: ConsoleHandoffGate;
}

export interface ConsoleTourStep {
  id: string;
  kind: ConsoleTourStepKind;
  tab: ConsoleTourTab;
  /** GLOBAL act number (1-10 across both apps), not an index into this registry. */
  act: number;
  /** Short act name shown on the completion meter. Consistent within an act. */
  actLabel: string;
  title: string;
  /** Kept to ~2 lines on screen (UI/UX C5: one idea, ~12 words, verdict first). May carry
   *  `{officer}` / `{lender}` / `{applicant}` tokens  see `fillPersona`. */
  body: string;
  /** Which endings this step belongs to. Absent = all three. */
  branches?: ConsoleTourBranch[];
  /** Optional TourAnchor id to spotlight on this step. Anchors are enhancement, never a
   *  dependency  a step with none (or a mismatched one) still renders card-only. */
  anchorId?: string;
  /** Required on `do` steps: the semantic signal the officer's own action fires. */
  advanceOn?: ConsoleTourSignal;
  /** Required on `handoff` steps: the cross-app baton. */
  handoff?: ConsoleHandoff;
  /** Short line for the checkmark beat when a do-step completes. */
  celebrate?: string;
  /** Body carries persona tokens to fill with the active lender/officer/applicant. */
  persona?: boolean;
  /** A closing recap card. There is one per ending  the declined branch closes at act 8. */
  finale?: boolean;
}

export const CONSOLE_TOUR_STEPS: ConsoleTourStep[] = [
  // ── Act 7 · Run the desk ────────────────────────────────────────────────────
  {
    id: 'seat',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    persona: true,
    title: 'You are the credit officer',
    body: 'You are {officer} at {lender}. The application you just sent is now on your desk.',
  },
  {
    id: 'trust',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'trust-panel',
    title: 'Five trust checks',
    body: 'Signature, issuer, freshness, consent, stacking. Five checks before any score is shown.',
  },
  {
    id: 'seed',
    kind: 'do',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'seed-button',
    advanceOn: 'pipeline-seeded',
    title: 'Fill the rest of the desk',
    body: 'Your turn: seed the demo pipeline so your file sits among a real day’s work.',
    celebrate: 'Your desk is live.',
  },
  {
    id: 'queues',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'queue-rail',
    title: 'Only what needs you',
    body: 'New and referred files need your call. Approved loans move to Servicing; declines sit below.',
  },
  {
    id: 'open-file',
    kind: 'do',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'direct-file',
    advanceOn: 'subject-opened',
    persona: true,
    title: 'Open the file you sent',
    body: 'Your turn: open {applicant}’s application — the one that arrived from the borrower app.',
    celebrate: 'That is your own application.',
  },
  {
    id: 'assess',
    kind: 'do',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'assess-button',
    advanceOn: 'assessed',
    title: 'Run the engine',
    body: 'Your turn: set an amount and click Assess.',
    celebrate: 'You ran the engine.',
  },
  // The verdict differs by ending, so the explanation does too. Same anchor, same beat  only
  // the honest reading of the result changes.
  {
    id: 'decision-referred',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'decision-card',
    branches: ['referred'],
    title: 'The engine deferred to you',
    body: 'Confidence sits below the automatic bar. Real income, only partly verifiable. Your call.',
  },
  {
    id: 'decision-approved',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'decision-card',
    branches: ['approved'],
    title: 'The engine already decided',
    body: 'Every gate cleared, so this approved on submission. You are reading, not deciding.',
  },
  {
    id: 'decision-declined',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'decision-card',
    branches: ['declined'],
    title: 'Declined on the evidence',
    body: 'The money looks fine. The evidence behind it does not. That distinction is the product.',
  },
  {
    id: 'memo',
    kind: 'do',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'memo-button',
    advanceOn: 'memo-opened',
    title: 'Open the audit memo',
    body: 'Your turn: generate the audit memo — the writeup a regulator would ask for.',
    celebrate: 'That is the paper trail.',
  },
  // The one action that differs per ending.
  {
    id: 'approve',
    kind: 'do',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'resolve-action',
    advanceOn: 'application-approved',
    branches: ['referred'],
    title: 'Make the call',
    // Approving is gated on a written rationale — that field is the audit trail, and the tour
    // must not write it for the officer. So the copy names the rationale as part of the step
    // rather than pointing at a button that looks inexplicably dead.
    body: 'Your turn: write a one-line rationale, then approve. The reason is the audit trail.',
    celebrate: 'The offer is out.',
  },
  {
    id: 'offer-standing',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'decision-card',
    branches: ['approved'],
    title: 'The offer is already out',
    body: 'Nothing here to approve. The engine published these terms the moment the request arrived.',
  },
  {
    id: 'letter',
    kind: 'do',
    tab: 'verify',
    act: 7,
    actLabel: 'Run the desk',
    anchorId: 'letter-button',
    advanceOn: 'letter-generated',
    branches: ['declined'],
    title: 'Issue the notice',
    body: 'Your turn: generate the adverse-action letter. A decline owes the borrower a reason.',
    celebrate: 'Compliant notice issued.',
  },
  // ── Act 8 · Catch a fraudster ───────────────────────────────────────────────
  {
    id: 'flagged',
    kind: 'do',
    tab: 'verify',
    act: 8,
    actLabel: 'Catch a fraudster',
    // Anchored to the control that actually fires `flagged-loaded`. Pointing at the queue rail
    // sent judges clicking every application card, none of which emits it — the fabricated
    // passport is loaded from its own button, not filed as a queue entry.
    anchorId: 'load-flagged',
    advanceOn: 'flagged-loaded',
    title: 'Load a fabricated file',
    body: 'Your turn: click Load flagged applicant, below the pipeline search.',
    celebrate: 'The rings caught it.',
  },
  {
    id: 'signals',
    kind: 'explain',
    tab: 'verify',
    act: 8,
    actLabel: 'Catch a fraudster',
    anchorId: 'fraud-signals',
    title: 'The rings fired',
    body: 'Round numbers, Benford breaks, an ML flag. Confidence collapses and the engine declines.',
  },
  // Hand the baton back. On the declined branch there is no offer to answer, so that ending
  // closes here instead.
  {
    id: 'handoff-answer',
    kind: 'handoff',
    tab: 'verify',
    act: 8,
    actLabel: 'Catch a fraudster',
    branches: ['referred', 'approved'],
    persona: true,
    title: 'Back to the borrower',
    body: 'Your offer is standing. An approval is only an offer until {applicant} accepts it.',
    handoff: {
      target: 'borrower',
      cta: 'They answered — continue',
      waiting: 'Waiting for the borrower to answer…',
      ready: 'Answered. Come back and service the loan.',
      gate: 'offer-answered',
    },
  },
  {
    id: 'finale-declined',
    kind: 'explain',
    tab: 'verify',
    act: 8,
    actLabel: 'Catch a fraudster',
    branches: ['declined'],
    finale: true,
    title: 'You ran the desk',
    body: 'You verified, declined on evidence, issued the notice, and caught a fabricated file.',
  },
  // ── Act 10 · Service & structure ────────────────────────────────────────────
  // Unreachable on the `declined` branch: no offer was ever published, so no loan exists.
  {
    id: 'servicing',
    kind: 'explain',
    tab: 'servicing',
    act: 10,
    actLabel: 'Service & structure',
    anchorId: 'servicing-list',
    branches: ['referred', 'approved'],
    persona: true,
    title: 'A live loan',
    body: '{applicant} accepted, so the loan is on your book with a schedule. Not a filing — a loan.',
  },
  {
    id: 'repayment',
    kind: 'do',
    tab: 'servicing',
    act: 10,
    actLabel: 'Service & structure',
    anchorId: 'repayment-control',
    advanceOn: 'repayment-recorded',
    branches: ['referred', 'approved'],
    title: 'Collect an instalment',
    body: 'Your turn: record the first repayment and watch the loan’s standing update.',
    celebrate: 'Standing updated.',
  },
  {
    id: 'policy',
    kind: 'explain',
    tab: 'policy',
    act: 10,
    actLabel: 'Service & structure',
    anchorId: 'policy-thresholds',
    branches: ['referred', 'approved'],
    title: 'The flywheel',
    body: 'These thresholds are exactly what borrowers are coached toward on the other app.',
  },
  {
    id: 'portfolio',
    kind: 'explain',
    tab: 'portfolio',
    act: 10,
    actLabel: 'Service & structure',
    anchorId: 'portfolio-bands',
    branches: ['referred', 'approved'],
    title: 'The approved book',
    body: 'The approved book by band and purpose. Concentration risk, visible at a glance.',
  },
  {
    id: 'capital',
    kind: 'explain',
    tab: 'capital',
    act: 10,
    actLabel: 'Service & structure',
    anchorId: 'capital-tranches',
    branches: ['referred', 'approved'],
    title: 'Structure the book',
    body: 'Bundle the book into rated tranches. Capital-markets AI funds the informal economy.',
  },
  {
    id: 'finale',
    kind: 'explain',
    tab: 'capital',
    act: 10,
    actLabel: 'Service & structure',
    branches: ['referred', 'approved'],
    finale: true,
    title: 'You closed the loop',
    body: 'You built a score, asked for money, decided on it, took the offer, and serviced the loan.',
  },
];

/** Fill the persona tokens in a step body with the active lender, its officer, and the
 *  applicant whose file the tour is following. Leaves a non-persona body untouched; a missing
 *  field falls back to a neutral label. */
export function fillPersona(body: string, ctx: { officer?: string; lender?: string; applicant?: string }): string {
  return body
    .replace(/\{officer\}/g, ctx.officer || 'the loan officer')
    .replace(/\{lender\}/g, ctx.lender || 'your institution')
    .replace(/\{applicant\}/g, ctx.applicant || 'the borrower');
}

/** Map the engine's verdict at filing onto the ending the script should run.
 *
 *  Deliberately keyed to `ApplicationRecord.engineDecision` and NOT to `status`. The two agree
 *  when a file arrives, but `status` is mutable: the moment the officer approves a referred
 *  file it becomes 'approved', which would silently flip the tour from the referred branch to
 *  the approved one — reshaping the step list underneath the persisted index, mid-tour, right
 *  after the officer's most important action. `engineDecision` is never rewritten (resolutions
 *  live in `resolution`), so the branch is stable for the whole run and across a reload. */
export function branchForDecision(decision: 'approve' | 'refer' | 'decline'): ConsoleTourBranch {
  if (decision === 'approve') return 'approved';
  if (decision === 'decline') return 'declined';
  return 'referred';
}

/** The steps that actually run for one ending. A step with no `branches` runs always. Passing
 *  `null` (no direct-apply file adopted yet) yields exactly the unbranched steps. */
export function stepsForBranch(steps: ConsoleTourStep[], branch: ConsoleTourBranch | null): ConsoleTourStep[] {
  return steps.filter((s) => !s.branches || (branch !== null && s.branches.includes(branch)));
}

/** Validates the registry's own invariants: unique non-empty ids, known tabs, kind rules (do
 *  needs advanceOn, handoff needs a handoff block, explain carries neither), and sane act
 *  numbering.
 *
 *  Act numbering is checked for regression and label consistency but NOT contiguity: this
 *  registry is half of a ten-act cross-app script, starting at 7 and skipping 9, which the
 *  borrower app owns. Returns an empty array when the registry is valid. */
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
    if (step.branches && step.branches.length === 0) problems.push(`step ${step.id} has an empty branches list`);

    if (step.kind === 'do' && !step.advanceOn) problems.push(`do step ${step.id} has no advanceOn`);
    if (step.kind === 'handoff' && !step.handoff) problems.push(`handoff step ${step.id} has no handoff block`);
    if (step.kind === 'handoff' && step.advanceOn) problems.push(`handoff step ${step.id} must not have advanceOn`);
    if (step.kind === 'explain' && (step.advanceOn || step.handoff)) {
      problems.push(`explain step ${step.id} must not have advanceOn or handoff`);
    }

    if (step.act < 1) problems.push(`step ${step.id} has act ${step.act}, below 1`);
    if (step.act > TOUR_TOTAL_ACTS) problems.push(`step ${step.id} has act ${step.act}, above the script's ${TOUR_TOTAL_ACTS}`);
    if (step.act < prevAct) problems.push(`acts must not regress: step ${step.id} returns to act ${step.act}`);
    prevAct = Math.max(prevAct, step.act);
    const label = actLabels.get(step.act);
    if (label === undefined) actLabels.set(step.act, step.actLabel);
    else if (label !== step.actLabel) problems.push(`act ${step.act} has inconsistent labels`);
  }
  return problems;
}

/** Every ending must actually end: each branch's run must be non-empty and finish on a finale
 *  rather than trailing off or stalling on a gate that can never open. */
export function validateConsoleTourBranches(steps: ConsoleTourStep[]): string[] {
  const problems: string[] = [];
  for (const branch of ['referred', 'approved', 'declined'] as ConsoleTourBranch[]) {
    const run = stepsForBranch(steps, branch);
    if (run.length === 0) {
      problems.push(`branch ${branch} has no steps`);
      continue;
    }
    if (!run[run.length - 1].finale) problems.push(`branch ${branch} does not end on a finale`);
    if (run.filter((s) => s.finale).length !== 1) problems.push(`branch ${branch} must have exactly one finale`);
  }
  return problems;
}

/** Act-meter derivation for the tour card. `totalActs` defaults to this registry's own highest
 *  act, which is right for a standalone fixture; the console passes `TOUR_TOTAL_ACTS` so the
 *  meter counts the whole cross-app script. */
export function actProgress(
  steps: ConsoleTourStep[],
  index: number,
  totalActs?: number
): { act: number; totalActs: number; actLabel: string } {
  const step = steps[clampConsoleTourStep(index, steps.length)];
  const derived = steps.reduce((max, s) => Math.max(max, s.act), 0);
  return { act: step?.act ?? 1, totalActs: totalActs ?? derived, actLabel: step?.actLabel ?? '' };
}

export function clampConsoleTourStep(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
