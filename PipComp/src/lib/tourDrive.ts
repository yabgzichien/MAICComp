// Judge guided tour  pure transition classifiers (Interactive Judge Tour spec, 2026-07-16).
// The App.tsx driver observes three event streams while a tour runs: screen changes, semantic
// tour signals, and a handoff's gate opening. These functions decide what each observation
// means for the active step, so the driver stays a thin wiring layer and the decision table
// stays unit-tested. Nothing here mutates state.
import { BORROWER_TOUR_STEPS, type TourAdvance, type TourSignalName, type TourStep } from './tourSteps';

export type ScreenChangeOutcome = 'advance' | 'phase' | 'pause' | 'ignore';
export type SignalOutcome = 'advance' | 'phase' | 'ignore';
export type HandoffGateOutcome = 'advance' | 'ignore';

function matchesScreen(advanceOn: TourAdvance | undefined, screen: string): boolean {
  return !!advanceOn && 'screen' in advanceOn && advanceOn.screen === screen;
}

function matchesSignal(advanceOn: TourAdvance | undefined, signal: TourSignalName): boolean {
  return !!advanceOn && 'signal' in advanceOn && advanceOn.signal === signal;
}

/** Classify a screen change the JUDGE made (tour-driven navigation is always ignored):
 *  arriving on a do-step's target advances; arriving on the current mission phase's target
 *  steps the phase (or completes the mission on the last one); anything else pauses the
 *  tour  the judge chose to wander, and the tour never fights for control. */
export function classifyScreenChange(
  step: TourStep | null,
  missionPhase: number,
  newScreen: string,
  tourDriven: boolean
): ScreenChangeOutcome {
  if (tourDriven || !step) return 'ignore';
  if (step.kind === 'do' && matchesScreen(step.advanceOn, newScreen)) return 'advance';
  if (step.kind === 'mission' && step.mission) {
    const phases = step.mission.phases;
    const phase = phases[missionPhase];
    if (phase && matchesScreen(phase.advanceOn, newScreen)) {
      return missionPhase === phases.length - 1 ? 'advance' : 'phase';
    }
  }
  return 'pause';
}

/** Classify a semantic signal: matching a signal-gated do-step advances; matching the
 *  current mission phase steps it (or completes the mission on the last phase). Signals
 *  never pause  a stray emission from elsewhere in the app is simply not the tour's
 *  business. */
export function classifySignal(step: TourStep | null, missionPhase: number, signal: TourSignalName): SignalOutcome {
  if (!step) return 'ignore';
  if (step.kind === 'do' && matchesSignal(step.advanceOn, signal)) return 'advance';
  if (step.kind === 'mission' && step.mission) {
    const phases = step.mission.phases;
    const phase = phases[missionPhase];
    if (phase && matchesSignal(phase.advanceOn, signal)) {
      return missionPhase === phases.length - 1 ? 'advance' : 'phase';
    }
  }
  return 'ignore';
}

/** Classify a handoff's gate. On an `onOpen: 'advance'` handoff the judge is in the other app
 *  when the real loan moves, so the step clears ITSELF the moment the gate reads open  no
 *  Continue button is ever rendered (see `handoffSelfAdvancing` at the call sites), only the
 *  live "waiting for…" status line. Coming back to press a button confirming an offer the judge
 *  can already see on screen told the app nothing it didn't already know.
 *
 *  Deliberately state-based, not transition-based: it does not matter whether the gate was
 *  already open when the step opened (e.g. the borrower answered before the officer got here, the
 *  `approved` ending's offer publishing at send time before this step is even reached, or the
 *  judge pressed Back onto an already-cleared step) — open is open, and it advances on sight.
 *  Which handoffs may do this is declared in the registry, not inferred here: see
 *  `TourHandoffOnOpen`. */
export function classifyHandoffGate(step: TourStep | null, open: boolean): HandoffGateOutcome {
  if (!step || step.kind !== 'handoff' || !step.handoff) return 'ignore';
  if (step.handoff.gate === 'none' || step.handoff.onOpen !== 'advance') return 'ignore';
  return open ? 'advance' : 'ignore';
}

/** Should the real control behind `anchorId` be locked while the tour is running?
 *
 *  A control the script asks for is the script's to hand over: pressing Send four acts before
 *  the tour gets there files a real application the narration then contradicts. So a control is
 *  locked while its own step is still AHEAD of the judge, and free from that step onward (the
 *  action is theirs to repeat once they have been asked once).
 *
 *  Three cases, in the order they are decided:
 *  - no do-step anywhere in the registry claims this anchor → the tour has no opinion, never
 *    locked. Locking is opt-in by being part of the script.
 *  - the claiming step exists but is not in THIS ending's run → the script never asks for it on
 *    this branch, so using it is off-script for the whole tour: locked.
 *  - otherwise → locked until the judge reaches that step.
 *
 *  Callers must only consult this while the tour is actually running; it says nothing about an
 *  app with no tour on it. */
export function isControlLocked(
  run: TourStep[],
  index: number,
  anchorId: string,
  registry: TourStep[] = BORROWER_TOUR_STEPS
): boolean {
  const claims = (s: TourStep) => s.kind === 'do' && s.anchorId === anchorId;
  if (!registry.some(claims)) return false;
  const owner = run.findIndex(claims);
  if (owner < 0) return true;
  return index < owner;
}
