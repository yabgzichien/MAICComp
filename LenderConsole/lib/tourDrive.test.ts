import { describe, expect, it } from 'vitest';
import {
  classifyConsoleHandoffGate,
  classifyConsoleSignal,
  classifyConsoleTabChange,
  isConsoleControlLocked,
  tourControlledAnchors,
} from './tourDrive';
import { CONSOLE_TOUR_STEPS, stepsForBranch, type ConsoleTourStep } from './tourSteps';

const doStep: ConsoleTourStep = {
  id: 'memo',
  kind: 'do',
  tab: 'verify',
  act: 3,
  actLabel: 'Make the call',
  title: 'Open the memo',
  body: 'Click Credit memo.',
  advanceOn: 'memo-opened',
};

const explainStep: ConsoleTourStep = {
  id: 'decision',
  kind: 'explain',
  tab: 'verify',
  act: 3,
  actLabel: 'Make the call',
  title: 'Verdict',
  body: 'A deterministic verdict.',
};

describe('classifyConsoleSignal', () => {
  it("advances when a do-step's own signal fires", () => {
    expect(classifyConsoleSignal(doStep, 'memo-opened')).toBe('advance');
  });

  it('ignores a signal a do-step does not wait for', () => {
    expect(classifyConsoleSignal(doStep, 'flagged-loaded')).toBe('ignore');
  });

  it('ignores every signal on an explain step', () => {
    expect(classifyConsoleSignal(explainStep, 'memo-opened')).toBe('ignore');
  });

  it('ignores a signal when there is no active step', () => {
    expect(classifyConsoleSignal(null, 'memo-opened')).toBe('ignore');
  });
});

describe('classifyConsoleTabChange', () => {
  it('ignores tour-driven navigation', () => {
    expect(classifyConsoleTabChange(doStep, 'policy', true)).toBe('ignore');
  });

  it('pauses when the officer wanders to another tab', () => {
    expect(classifyConsoleTabChange(doStep, 'policy', false)).toBe('pause');
  });

  it("ignores a change that lands on the step's own tab", () => {
    expect(classifyConsoleTabChange(doStep, 'verify', false)).toBe('ignore');
  });

  it('ignores a tab change when there is no active step', () => {
    expect(classifyConsoleTabChange(null, 'policy', false)).toBe('ignore');
  });
});

describe('classifyConsoleHandoffGate', () => {
  const handoff = CONSOLE_TOUR_STEPS.find((s) => s.id === 'handoff-answer')!;
  const ungated: ConsoleTourStep = {
    ...handoff,
    id: 'ungated',
    handoff: { target: 'borrower', cta: 'Go', waiting: '', ready: 'r', gate: 'none', onOpen: 'prompt' },
  };
  const prompted: ConsoleTourStep = {
    ...handoff,
    id: 'prompted',
    handoff: { ...handoff.handoff!, onOpen: 'prompt' },
  };

  it('advances when the borrower answers while the officer is in the other tab', () => {
    expect(classifyConsoleHandoffGate(handoff, true)).toBe('advance');
  });

  it('stays put while the offer is still unanswered', () => {
    expect(classifyConsoleHandoffGate(handoff, false)).toBe('ignore');
  });

  // Deliberately state-based, not transition-based: whether the gate was ALREADY open when the
  // step opened (a borrower who answered before the officer got here, or Back onto an
  // already-cleared step) must not matter — there is no Continue button to fall back on either
  // way, so it advances on sight.
  it('advances even when the gate was already open on arrival', () => {
    expect(classifyConsoleHandoffGate(handoff, true)).toBe('advance');
  });

  it('never advances an ungated handoff', () => {
    expect(classifyConsoleHandoffGate(ungated, true)).toBe('ignore');
  });

  it('never advances a handoff the registry marked as prompting', () => {
    expect(classifyConsoleHandoffGate(prompted, true)).toBe('ignore');
  });

  it('ignores non-handoff steps and no step at all', () => {
    expect(classifyConsoleHandoffGate(doStep, true)).toBe('ignore');
    expect(classifyConsoleHandoffGate(explainStep, true)).toBe('ignore');
    expect(classifyConsoleHandoffGate(null, true)).toBe('ignore');
  });
});

describe('isConsoleControlLocked', () => {
  const run = stepsForBranch(CONSOLE_TOUR_STEPS, 'referred');
  const indexOf = (id: string) => run.findIndex((s) => s.id === id);

  it('holds the officer’s decision until act 7 asks for it', () => {
    expect(isConsoleControlLocked(run, 0, 'resolve-action')).toBe(true);
    expect(isConsoleControlLocked(run, indexOf('approve') - 1, 'resolve-action')).toBe(true);
    expect(isConsoleControlLocked(run, indexOf('approve'), 'resolve-action')).toBe(false);
  });

  it('holds the memo and the fabricated file to their own steps', () => {
    expect(isConsoleControlLocked(run, 0, 'memo-button')).toBe(true);
    expect(isConsoleControlLocked(run, indexOf('memo') - 1, 'memo-button')).toBe(true);
    expect(isConsoleControlLocked(run, indexOf('memo'), 'memo-button')).toBe(false);
    expect(isConsoleControlLocked(run, indexOf('memo'), 'load-flagged')).toBe(true);
    expect(isConsoleControlLocked(run, indexOf('flagged'), 'load-flagged')).toBe(false);
  });

  it('keeps collecting an instalment shut until act 10', () => {
    expect(isConsoleControlLocked(run, indexOf('approve'), 'repayment-control')).toBe(true);
    expect(isConsoleControlLocked(run, indexOf('repayment'), 'repayment-control')).toBe(false);
  });

  // Publishing a policy re-prices the engine, so it must not be reachable while the script is
  // still narrating verdicts the old policy produced.
  it('holds publishing a product until the act-10 step that asks for it', () => {
    expect(isConsoleControlLocked(run, indexOf('approve'), 'product-ladder')).toBe(true);
    expect(isConsoleControlLocked(run, indexOf('product'), 'product-ladder')).toBe(false);
  });

  // The adverse-action letter belongs to the declined ending only, so on this run no step will
  // ever hand it over: dead for the whole tour rather than dead until some step that never comes.
  it('locks a control this ending never asks for, for the whole run', () => {
    expect(isConsoleControlLocked(run, run.length - 1, 'letter-button')).toBe(true);
    const declined = stepsForBranch(CONSOLE_TOUR_STEPS, 'declined');
    expect(isConsoleControlLocked(declined, declined.length - 1, 'resolve-action')).toBe(true);
  });

  it('never locks a control the script does not claim', () => {
    expect(isConsoleControlLocked(run, 0, 'trust-panel')).toBe(false);
    expect(isConsoleControlLocked(run, 0, 'decision-card')).toBe(false);
    expect(isConsoleControlLocked(run, 0, 'nothing-of-the-sort')).toBe(false);
  });
});

describe('tourControlledAnchors', () => {
  // The driver walks exactly this list to publish the locked set, so a do-step whose control is
  // missing here would be silently unguarded.
  it('is every do-step anchor in the script, deduplicated', () => {
    expect(tourControlledAnchors().sort()).toEqual(
      ['direct-file', 'letter-button', 'load-flagged', 'memo-button', 'product-ladder', 'repayment-control', 'resolve-action', 'seed-button'].sort()
    );
  });
});
