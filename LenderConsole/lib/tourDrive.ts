// Judge guided tour  pure transition classifiers (Interactive Console Tour, 2026-07-17).
// The Console.tsx driver observes two streams while a tour runs: semantic tour signals and
// tab changes. These two functions decide what each observation means for the active step, so
// the driver stays a thin wiring layer and the decision table stays unit-tested. Nothing here
// mutates state.
import type { ConsoleTourSignal, ConsoleTourStep, ConsoleTourTab } from './tourSteps';

export type SignalOutcome = 'advance' | 'ignore';
export type TabChangeOutcome = 'pause' | 'ignore';

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
