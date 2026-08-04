// Judge guided tour  pure transition classifiers (Interactive Console Tour, 2026-07-17).
// The Console.tsx driver observes three streams while a tour runs: semantic tour signals, tab
// changes, and a handoff's gate opening. These functions decide what each observation means
// for the active step, so the driver stays a thin wiring layer and the decision table stays
// unit-tested. Nothing here mutates state.
import { CONSOLE_TOUR_STEPS, type ConsoleTourSignal, type ConsoleTourStep, type ConsoleTourTab } from './tourSteps';

export type SignalOutcome = 'advance' | 'ignore';
export type TabChangeOutcome = 'pause' | 'ignore';
export type HandoffGateOutcome = 'advance' | 'ignore';

/** Classify a semantic signal: matching the current do-step's `advanceOn` advances the tour.
 *  Signals never pause  a stray emission from elsewhere in the console is simply not the
 *  tour's business (an explain step ignores every signal). */
export function classifyConsoleSignal(step: ConsoleTourStep | null, signal: ConsoleTourSignal): SignalOutcome {
  if (!step) return 'ignore';
  if (step.kind === 'do' && step.advanceOn === signal) return 'advance';
  return 'ignore';
}

/** Classify a tab change. Tour-driven navigation (the tour switching to a step's own tab) is
 *  always ignored. A change the officer made themselves to a tab other than the current step's
 *  pauses the tour  they chose to wander, and the tour never fights for control. Landing on
 *  the step's own tab (e.g. clicking back to it) is a no-op. */
export function classifyConsoleTabChange(
  step: ConsoleTourStep | null,
  newTab: ConsoleTourTab,
  tourDriven: boolean
): TabChangeOutcome {
  if (tourDriven || !step) return 'ignore';
  return newTab === step.tab ? 'ignore' : 'pause';
}

/** Classify a handoff's gate. On an `onOpen: 'advance'` handoff the officer is in the borrower
 *  app when the offer is answered, so the step clears ITSELF the moment the gate reads open  no
 *  Continue button is ever rendered, only the live "waiting for…" status line. Making them come
 *  back to press a button confirming an answer the console can already see told it nothing new.
 *
 *  Deliberately state-based, not transition-based: it does not matter whether the gate was
 *  already open when the step opened (the borrower answered before the officer got here, or the
 *  officer pressed Back onto an already-cleared step) — open is open, and it advances on sight.
 *  Mirrors `classifyHandoffGate` in the borrower app. */
export function classifyConsoleHandoffGate(step: ConsoleTourStep | null, open: boolean): HandoffGateOutcome {
  if (!step || step.kind !== 'handoff' || !step.handoff) return 'ignore';
  if (step.handoff.gate === 'none' || step.handoff.onOpen !== 'advance') return 'ignore';
  return open ? 'advance' : 'ignore';
}

/** Should the real control behind `anchorId` be locked while the tour is running? Mirrors
 *  `isControlLocked` in the borrower app.
 *
 *  A desk is not a sandbox mid-script: assessing, resolving or collecting ahead of the narration
 *  writes real records the tour then describes in the wrong order — and approving before being
 *  asked publishes an offer the borrower half is not waiting for yet. So a control is locked
 *  while its own step is still AHEAD of the officer, and free from that step onward.
 *
 *  - no do-step in the registry claims this anchor → the tour has no opinion, never locked
 *  - the claiming step exists but is not in THIS ending's run → off-script all tour: locked.
 *    This is what keeps Approve dead on the `declined` ending and the adverse-action letter
 *    dead on the `referred` one.
 *  - otherwise → locked until the officer reaches that step. */
export function isConsoleControlLocked(
  run: ConsoleTourStep[],
  index: number,
  anchorId: string,
  registry: ConsoleTourStep[] = CONSOLE_TOUR_STEPS
): boolean {
  const claims = (s: ConsoleTourStep) => s.kind === 'do' && s.anchorId === anchorId;
  if (!registry.some(claims)) return false;
  const owner = run.findIndex(claims);
  if (owner < 0) return true;
  return index < owner;
}

/** Every anchor id the script claims as a do-step control, locked or not. The driver walks this
 *  once per step change to publish the locked set, so a control site only has to ask "am I in
 *  it?" rather than know anything about the script. */
export function tourControlledAnchors(registry: ConsoleTourStep[] = CONSOLE_TOUR_STEPS): string[] {
  const ids: string[] = [];
  for (const s of registry) {
    if (s.kind === 'do' && s.anchorId && !ids.includes(s.anchorId)) ids.push(s.anchorId);
  }
  return ids;
}
