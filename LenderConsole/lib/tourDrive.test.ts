import { describe, expect, it } from 'vitest';
import { classifyConsoleSignal, classifyConsoleTabChange } from './tourDrive';
import type { ConsoleTourStep } from './tourSteps';

const doStep: ConsoleTourStep = {
  id: 'assess',
  kind: 'do',
  tab: 'verify',
  act: 3,
  actLabel: 'Make the call',
  title: 'Assess',
  body: 'Click Assess.',
  advanceOn: 'assessed',
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
    expect(classifyConsoleSignal(doStep, 'assessed')).toBe('advance');
  });

  it('ignores a signal a do-step does not wait for', () => {
    expect(classifyConsoleSignal(doStep, 'flagged-loaded')).toBe('ignore');
  });

  it('ignores every signal on an explain step', () => {
    expect(classifyConsoleSignal(explainStep, 'assessed')).toBe('ignore');
  });

  it('ignores a signal when there is no active step', () => {
    expect(classifyConsoleSignal(null, 'assessed')).toBe('ignore');
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
