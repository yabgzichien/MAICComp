// Judge guided tour  borrower app (Unified cross-app tour, 2026-07-25; supersedes the v2
// Interactive Judge Tour registry of 2026-07-16). Pure step registry: no UI, no state. `Root`
// in App.tsx drives the real screen state machine from this data; nothing here renders
// anything or knows about React.
//
// This registry is one HALF of a single ten-act script that spans two apps. The borrower owns
// acts 1-6 and act 9; the Lender Console owns 7, 8 and 10 (see
// `LenderConsole/lib/tourSteps.ts`, the mirrored registry). Act numbers are therefore GLOBAL
// this registry legitimately skips the acts the other app owns, which is why the validator
// below checks only that acts never regress, not that they are contiguous from 1.
//
// The two halves are joined by `handoff` steps and by real loan state: a handoff waits on the
// underlying record actually existing (an offer published, an offer answered), and where that
// can only happen because the judge did the work next door it moves on by itself rather than
// asking them to confirm it (`onOpen`). Nothing here polls or fetches: the step declares WHAT
// must be true and what its opening means; the driver supplies whether it is, and
// `classifyHandoffGate` puts the two together.
//
// Kept separate from the tour's runtime state (App.tsx local state, persisted via metaRepo) so
// the steps stay trivially unit-testable.

/** The screens the tour can land on  a subset of App.tsx's `Screen` union, kept separate so
 *  this module has zero dependency on the app shell. Includes 'attacks' only as an optional
 *  step ACTION target (see `actionScreen`), never a step's own `screen`. */
export type TourScreen = 'home' | 'credit' | 'coach' | 'passport' | 'kyc' | 'loans';
export type TourActionScreen = TourScreen | 'attacks';

/** Total acts in the unified script, across BOTH apps. Drives the "Act 7 of 10" meter so the
 *  judge reads one continuous story rather than two five-act ones. Mirrored verbatim in the
 *  console registry  the two must agree or the meter jumps when the judge switches tabs. */
export const TOUR_TOTAL_ACTS = 10;

/** Which ending the script is running. Chosen from REAL state, never from a persona name: the
 *  borrower app reads it off the `POST /api/apply` response, the console off the status of the
 *  file it adopts. A step with no `branches` runs in all three.
 *
 *  referred  the engine deferred to a human (Aina). The officer genuinely decides.
 *  approved  the engine approved outright (Ravi); the offer is already standing at send time.
 *  declined  the engine declined (Faizal). No offer is ever published, so the acceptance and
 *             servicing acts are unreachable and the script closes in the console. */
export type TourBranch = 'referred' | 'approved' | 'declined';

/** Semantic events the app emits while the tour listens (see `lib/tourSignals.ts`). The union
 *  lives here so the registry  the source of truth for what the tour understands  has no
 *  import in the signals direction. */
export type TourSignalName =
  | 'scan-extracted'
  | 'scan-saved'
  | 'coach-chip-tapped'
  | 'kyc-verified'
  | 'kyc-occupation-saved'
  | 'passport-minted'
  | 'application-sent'
  | 'offer-accepted';

/** What completes a do-step or a mission phase: the judge arriving on a screen, or a
 *  semantic signal firing. */
export type TourAdvance = { screen: TourScreen; signal?: never } | { signal: TourSignalName; screen?: never };

export type TourStepKind = 'explain' | 'do' | 'mission' | 'handoff';

/** Pip's expression while narrating a step. Mirrors the `PipExpr` union in
 *  `components/Pip.tsx` by value; duplicated here so lib stays free of component imports. */
export type TourPip = 'idle' | 'happy' | 'think' | 'curious';

/** What must be true of the real loan before a handoff's Continue enables.
 *
 *  offer-pending  an offer for this borrower is awaiting their answer.
 *  none           nothing to wait for; the judge simply moves on when they are ready. */
export type TourHandoffGate = 'offer-pending' | 'none';

/** What the gate opening MEANS for this particular handoff.
 *
 *  advance  the record moving IS the judge coming back, so the step clears itself and no
 *            Continue button is ever rendered. Right when the gate can only open because the
 *            judge did the work in the other app (act 6 referred: an officer approved it).
 *  prompt   the gate merely ENABLES a Continue button the judge presses themselves. Right when
 *            the record can move without the judge having done anything yet: on the `approved`
 *            ending the offer is published at send time and simply takes a poll to arrive, so
 *            self-advancing would carry them past the console and they would never play the
 *            officer. Also the only sane setting for `gate: 'none'`, which has nothing to ride. */
export type TourHandoffOnOpen = 'advance' | 'prompt';

export interface TourHandoff {
  /** Where the judge is being sent. 'console' renders the Lender Console link (web only  on
   *  native there is no second window to open, so the card shows the instruction alone). */
  target: 'console';
  /** Button label. On an `onOpen: 'advance'` handoff this is never actually rendered  the step
   *  advances itself the moment its gate reads open, so the `cta` only exists for `onOpen:
   *  'prompt'` handoffs and to satisfy the type. */
  cta: string;
  /** Status line while the gate is still closed. Must describe what is being waited ON, not
   *  merely that something is loading  the judge is in another tab and needs to know when to
   *  come back. This is the whole card on a self-advancing handoff. */
  waiting: string;
  /** Status line once the gate opens. */
  ready: string;
  gate: TourHandoffGate;
  onOpen: TourHandoffOnOpen;
}

export interface TourMissionPhase {
  /** One line shown on the slim mission banner while this phase is active. */
  instruction: string;
  advanceOn: TourAdvance;
}

export interface TourStep {
  id: string;
  kind: TourStepKind;
  screen: TourScreen;
  /** GLOBAL act number (1-10 across both apps), not an index into this registry. */
  act: number;
  /** Short act name shown on the completion meter ("Meet Aina"). Consistent within an act. */
  actLabel: string;
  pip: TourPip;
  /** May carry `{name}` / `{role}` tokens  see `fillPersona`. */
  title: string;
  /** Kept to ~2 lines on screen (UI/UX C5: one idea, ~12 words, verdict first). May carry
   *  `{name}` / `{role}` tokens. */
  body: string;
  /** Which endings this step belongs to. Absent = all three. */
  branches?: TourBranch[];
  /** This beat cannot be skipped: the card renders no Skip, and the driver refuses one even if
   *  something else asks for it. Reserved for the acts that MAKE the artefacts the rest of the
   *  script reads — a skipped scan, eKYC, mint or send leaves later steps narrating a passport
   *  or an application that was never built, which is worse than no tour at all. Exit is still
   *  the way out; this removes the half-measure, not the escape hatch.
   *
   *  Only meaningful on `do` and `mission` steps: explain steps advance on Next, and a handoff's
   *  Skip is the only thing standing between the judge and a gate that never opens. */
  required?: boolean;
  /** Optional TourAnchor id to spotlight on this step. Anchors are enhancement, never a
   *  dependency  a step with none (or a mismatched one) still renders card-only. */
  anchorId?: string;
  /** Required on `do` steps: what the judge's own action looks like. */
  advanceOn?: TourAdvance;
  /** Required on `mission` steps: the start button label plus the phased walk. */
  mission?: { cta: string; phases: TourMissionPhase[] };
  /** Required on `handoff` steps: the cross-app baton. */
  handoff?: TourHandoff;
  /** Short line for the checkmark beat when a do/mission step completes. */
  celebrate?: string;
  /** Optional secondary deep-link button. Ends the tour and opens `actionScreen` directly. */
  actionLabel?: string;
  actionScreen?: TourActionScreen;
}

export const BORROWER_TOUR_STEPS: TourStep[] = [
  // ── Act 1 · Meet the borrower ───────────────────────────────────────────────
  {
    id: 'welcome',
    kind: 'explain',
    screen: 'home',
    act: 1,
    actLabel: 'Meet {name}',
    pip: 'happy',
    title: 'Welcome to Pip Credit',
    // A colon label rather than "a {role}" ("a delivery driver" / "an online seller" / "a small
    // trader" would need a/an grammar logic just for this one line). Found live: the first cut
    // read "a online seller" for Aina.
    body: 'You are {name}: {role}, no payslip. You are about to build that credit yourself.',
  },
  {
    id: 'coverage',
    kind: 'explain',
    screen: 'home',
    act: 1,
    actLabel: 'Meet {name}',
    pip: 'think',
    title: 'Coverage unlocks credit',
    body: 'This chip counts days you recorded data, not logins. Remember the number, because you move it next.',
    anchorId: 'coverage-chip',
  },
  // ── Act 2 · See the score ───────────────────────────────────────────────────
  {
    id: 'open-credit',
    kind: 'do',
    screen: 'home',
    act: 2,
    actLabel: 'See the score',
    pip: 'curious',
    title: 'Open the score',
    body: 'Your task: tap the Credit card below.',
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
    body: 'You can see the score, how much data backs it, and every factor that fed it.',
    anchorId: 'credit-gauge',
  },
  // ── Act 3 · Move the number ─────────────────────────────────────────────────
  {
    id: 'scan-mission',
    kind: 'mission',
    screen: 'home',
    act: 3,
    actLabel: 'Move the number',
    pip: 'curious',
    title: 'Add real data yourself',
    body: 'Do what a borrower does: scan a statement. Upload your own, or pick a sample.',
    // The coverage delta, the score movement and everything downstream is measured against
    // this scan actually happening.
    required: true,
    mission: {
      cta: 'Add a statement',
      phases: [
        { instruction: 'Upload your own screenshot, or tap a provided sample.', advanceOn: { signal: 'scan-extracted' } },
        { instruction: 'Confirm a category for each row, then save.', advanceOn: { signal: 'scan-saved' } },
        { instruction: 'Saved. Tap Done to head back home.', advanceOn: { screen: 'home' } },
      ],
    },
    celebrate: 'You moved the coverage.',
  },
  {
    id: 'coverage-delta',
    kind: 'explain',
    screen: 'home',
    act: 3,
    actLabel: 'Move the number',
    pip: 'happy',
    title: 'You moved the number',
    body: 'The chip changed because of the statement you just scanned.',
    anchorId: 'coverage-chip',
  },
  // ── Act 4 · Get the plan ────────────────────────────────────────────────────
  {
    id: 'open-coach',
    kind: 'do',
    screen: 'credit',
    act: 4,
    actLabel: 'Get the plan',
    pip: 'curious',
    title: 'Ask Pip for the plan',
    body: 'Your task: tap Build my score.',
    anchorId: 'build-score-cta',
    advanceOn: { screen: 'coach' },
    celebrate: 'Coach opened.',
  },
  {
    // Opens on the lender's published bars, which sit at the top of Build my score with the
    // borrower's own standing marked against each one. Body is deliberately one short line:
    // it names what the whole screen is for before the plan below it starts arguing detail.
    id: 'coach-criteria',
    kind: 'explain',
    screen: 'coach',
    act: 4,
    actLabel: 'Get the plan',
    pip: 'think',
    title: 'What this lender asks for',
    body: 'This screen shows what they want, and how to reach it.',
    anchorId: 'lender-criteria',
  },
  {
    // Copy deliberately carries NO specific before/after figures. The coverage-only-unlock
    // beat this line used to quote (RM500 refer → ~RM3,700 approved) was retired in the
    // 2026-07-22 confidence-gate rework, and the numbers differ per persona anyway now that
    // the tour runs on all three.
    id: 'coach-plan',
    kind: 'explain',
    screen: 'coach',
    act: 4,
    actLabel: 'Get the plan',
    pip: 'think',
    title: 'A real before and after',
    body: 'Every lever re-runs the real engines, including the ones that turn out to change nothing.',
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
    body: 'Try more chips if you like; the result updates as you go. Hit Next when you are done.',
    anchorId: 'whatif-result',
  },
  // ── Act 5 · Mint the passport ───────────────────────────────────────────────
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
    title: 'Verify the identity',
    body: 'Identity and work details are already filled in. Tap Verify, then Done.',
    // The passport cannot be minted without a verified identity, so skipping here only moves
    // the dead end one step later.
    required: true,
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
    title: 'Mint the passport',
    body: 'Choose what to share, tier by tier, then mint. Consent stays with {name}.',
    // No passport, no application, no console half of the script.
    required: true,
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
    body: 'Signed aggregates only, plus how the score has moved. Lenders can verify it offline.',
    anchorId: 'passport-card',
    // The one place in the script where a judge can leave and watch the fraud defences run
    // live. PAUSES the tour (the Resume chip brings them straight back to this step), so it sits
    // on an explain step rather than mid-mission.
    actionLabel: 'See the fraud defences work',
    actionScreen: 'attacks',
  },
  // ── Act 6 · Ask for the money ───────────────────────────────────────────────
  {
    id: 'choose-lender',
    kind: 'explain',
    screen: 'passport',
    act: 6,
    actLabel: 'Ask for the money',
    pip: 'think',
    title: 'Every lender decides differently',
    body: 'Each row runs that lender’s own published policy at this amount, so it previews the real answer.',
    anchorId: 'lender-picker',
  },
  {
    id: 'send-request',
    kind: 'do',
    screen: 'passport',
    act: 6,
    actLabel: 'Ask for the money',
    pip: 'curious',
    title: 'Send the request',
    body: 'Your task: send the passport to the lender you picked.',
    // The send is what decides the ending and what puts a file on the console's desk: skip it
    // and the remaining four acts have nothing real to narrate. The button itself is locked
    // until this step for the same reason from the other side — see `isControlLocked`.
    required: true,
    anchorId: 'send-button',
    advanceOn: { signal: 'application-sent' },
    celebrate: 'Your application is filed.',
  },
  // The three endings diverge here. Exactly one of these renders, chosen by the decision the
  // send actually came back with — see `stepsForBranch`. They live on My Financing rather than
  // the passport screen because `useLenderSyncPoll` only mounts on Dashboard and My Financing:
  // a tour parked on the passport screen would never notice the offer arrive.
  {
    id: 'handoff-referred',
    kind: 'handoff',
    screen: 'loans',
    act: 6,
    actLabel: 'Ask for the money',
    pip: 'curious',
    branches: ['referred'],
    title: 'Referred to a human',
    body: 'There is no instant answer here: an officer has to decide. Go and be that officer.',
    handoff: {
      target: 'console',
      cta: 'I have decided',
      waiting: 'Waiting for the lender’s decision…',
      ready: 'The lender has answered. Come back and see.',
      gate: 'offer-pending',
      // The only way this gate opens is the judge approving the file in the console, so the
      // offer landing already IS their decision. Pressing Continue on top of that told the app
      // nothing it could not see, so the step clears itself onto the offer.
      onOpen: 'advance',
    },
  },
  {
    id: 'handoff-approved',
    kind: 'handoff',
    screen: 'loans',
    act: 6,
    actLabel: 'Ask for the money',
    pip: 'happy',
    branches: ['approved'],
    title: 'Approved on the spot',
    body: 'The engine cleared every gate, so an offer is already standing. See the file it left.',
    handoff: {
      target: 'console',
      cta: 'I have seen the file',
      waiting: 'Publishing the offer…',
      ready: 'The offer is waiting for you here.',
      gate: 'offer-pending',
      // Deliberately NOT self-advancing. This offer exists at send time and only takes a poll
      // to show up — nothing about it opening says the judge has been to the console, and
      // advancing on it would skip acts 7 and 8 entirely.
      onOpen: 'prompt',
    },
  },
  {
    id: 'handoff-declined',
    kind: 'handoff',
    screen: 'loans',
    act: 6,
    actLabel: 'Ask for the money',
    pip: 'think',
    branches: ['declined'],
    title: 'Declined',
    body: 'No offer is coming. See exactly why, and the notice the lender owes you.',
    handoff: {
      target: 'console',
      cta: 'Finish in the console',
      waiting: '',
      ready: 'The rest of this story happens on the lender’s desk.',
      gate: 'none',
      onOpen: 'prompt',
    },
  },
  // ── Act 9 · Take the offer ──────────────────────────────────────────────────
  // Unreachable on the `declined` branch: nothing was ever offered, so there is nothing to
  // answer. That branch ends in the console at act 8.
  {
    id: 'offer-arrived',
    kind: 'explain',
    screen: 'loans',
    act: 9,
    actLabel: 'Take the offer',
    pip: 'happy',
    branches: ['referred', 'approved'],
    title: 'The terms came back',
    body: 'The amount, instalment and rate all came from the lender’s own engine. Accept it.',
    anchorId: 'offer-card',
  },
  {
    id: 'accept-offer',
    kind: 'do',
    screen: 'loans',
    act: 9,
    actLabel: 'Take the offer',
    pip: 'curious',
    branches: ['referred', 'approved'],
    title: 'Answer the offer',
    // Names the button by its real label: this step is where the auto-advancing act-6 handoff
    // now lands the judge, so it must point at the control rather than at the idea.
    body: 'Your task: tap Accept financing. An approval is an offer until you say yes.',
    // Narrower than 'offer-arrived's card-wide anchor: this step's own action is one button,
    // and "No thanks" stays visible-but-disabled beside it (declining strands the tour), so the
    // spotlight should land on the control the judge can actually press.
    anchorId: 'offer-accept-btn',
    advanceOn: { signal: 'offer-accepted' },
    celebrate: 'You took the loan.',
  },
  {
    id: 'loan-live',
    kind: 'handoff',
    screen: 'loans',
    act: 9,
    actLabel: 'Take the offer',
    pip: 'happy',
    branches: ['referred', 'approved'],
    title: 'It is a live loan',
    body: 'The schedule, balance and standing all start now, and the lender sees the same thing.',
    handoff: {
      target: 'console',
      cta: 'Finish on the lender’s desk',
      waiting: '',
      ready: 'Head back and service the loan you just took.',
      gate: 'none',
      onOpen: 'prompt',
    },
  },
];

/** Fill the persona tokens in a step's title or body. Leaves untokenized copy untouched; a
 *  missing field falls back to a neutral label so a half-loaded persona never renders "{name}".
 *  Mirrors `fillPersona` in the console registry, which fills officer/lender the same way. */
export function fillPersona(text: string, ctx: { name?: string; role?: string }): string {
  return text
    .replace(/\{name\}/g, ctx.name || 'the borrower')
    .replace(/\{role\}/g, ctx.role || 'micro-entrepreneur');
}

/** Map the verdict the lender's console returned onto the ending the script should run.
 *  Mirrors `branchForDecision` in the console registry, which derives the same branch from the
 *  file's `engineDecision` — so both halves of the script agree without ever exchanging tour
 *  state, only the loan record itself. */
export function branchForDecision(decision: 'approve' | 'refer' | 'decline'): TourBranch {
  if (decision === 'approve') return 'approved';
  if (decision === 'decline') return 'declined';
  return 'referred';
}

/** The steps that actually run for one ending. A step with no `branches` runs always.
 *
 *  Passing `null` (no application sent yet) yields exactly the unbranched steps, i.e. acts 1-6
 *  up to and including the send. That is what keeps the persisted step index stable across the
 *  moment the branch is decided: every step BEFORE the branch exists is unbranched, so the
 *  filtered list only ever grows at the tail, never shifts underneath a saved index. */
export function stepsForBranch(steps: TourStep[], branch: TourBranch | null): TourStep[] {
  return steps.filter((s) => !s.branches || (branch !== null && s.branches.includes(branch)));
}

/** Validates the registry's own invariants: unique non-empty ids, known screens, kind rules
 *  (do needs advanceOn, mission needs phases, handoff needs a handoff block, explain carries
 *  none of them), sane act numbering, and action pairing.
 *
 *  Act numbering is checked for regression and label consistency but NOT contiguity: this
 *  registry is half of a ten-act cross-app script and legitimately skips acts 7, 8 and 10,
 *  which the Lender Console owns. Returns an empty array when the registry is valid. */
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
    if (step.branches && step.branches.length === 0) problems.push(`step ${step.id} has an empty branches list`);

    if (step.kind === 'do' && !step.advanceOn) problems.push(`do step ${step.id} has no advanceOn`);
    if (step.kind === 'handoff' && !step.handoff) problems.push(`handoff step ${step.id} has no handoff block`);
    if (step.kind === 'handoff' && (step.advanceOn || step.mission)) {
      problems.push(`handoff step ${step.id} must not have advanceOn or mission`);
    }
    // An ungated handoff has no opening to ride, so asking it to self-advance would strand the
    // judge on a card with neither a button nor anything to wait for.
    if (step.handoff?.gate === 'none' && step.handoff.onOpen === 'advance') {
      problems.push(`handoff step ${step.id} is ungated, so it cannot self-advance`);
    }
    if (step.kind === 'explain' && (step.advanceOn || step.mission || step.handoff)) {
      problems.push(`explain step ${step.id} must not have advanceOn, mission, or handoff`);
    }
    // `required` withholds Skip, which only exists on do/mission steps. On an explain step it
    // would be a no-op that reads as a guarantee; on a handoff it would remove the judge's only
    // way past a gate that never opens.
    if (step.required && step.kind !== 'do' && step.kind !== 'mission') {
      problems.push(`step ${step.id} is ${step.kind}, which cannot be required`);
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

/** Every branch must reach a last step, and no branch may end on a handoff whose gate can
 *  never open. Checked separately from `validateTourSteps` because it reasons about the
 *  registry as a whole rather than step by step. */
export function validateTourBranches(steps: TourStep[]): string[] {
  const problems: string[] = [];
  for (const branch of ['referred', 'approved', 'declined'] as TourBranch[]) {
    const run = stepsForBranch(steps, branch);
    if (run.length === 0) {
      problems.push(`branch ${branch} has no steps`);
      continue;
    }
    const last = run[run.length - 1];
    if (last.kind === 'handoff' && last.handoff?.gate !== 'none') {
      problems.push(`branch ${branch} ends on a gated handoff (${last.id}) the judge can never clear`);
    }
  }
  return problems;
}

/** Act-meter derivation for the tour card and resume chip. `totalActs` defaults to this
 *  registry's own highest act, which is right for a standalone fixture; the app passes
 *  `TOUR_TOTAL_ACTS` so the meter counts the whole cross-app script. */
export function actProgress(
  steps: TourStep[],
  index: number,
  totalActs?: number
): { act: number; totalActs: number; actLabel: string } {
  const step = steps[clampTourStep(index, steps.length)];
  const derived = steps.reduce((max, s) => Math.max(max, s.act), 0);
  return { act: step?.act ?? 1, totalActs: totalActs ?? derived, actLabel: step?.actLabel ?? '' };
}

export function clampTourStep(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
