// Judge guided tour  pure transition classifiers (Interactive Judge Tour spec, 2026-07-16).
// The App.tsx driver observes two event streams while a tour runs: screen changes and
// semantic tour signals. These two functions decide what each observation means for the
// active step, so the driver stays a thin wiring layer and the decision table stays
// unit-tested. Nothing here mutates state.
import type { TourAdvance, TourSignalName, TourStep } from './tourSteps';

export type ScreenChangeOutcome = 'advance' | 'phase' | 'pause' | 'ignore';
export type SignalOutcome = 'advance' | 'phase' | 'ignore';

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
