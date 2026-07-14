import { describe, expect, it } from 'vitest';
import { CONSOLE_TOUR_STEPS, clampConsoleTourStep, validateConsoleTourSteps, type ConsoleTourStep } from './tourSteps';

const CONSOLE_TABS = ['verify', 'portfolio', 'capital', 'policy'];

describe('CONSOLE_TOUR_STEPS', () => {
  it('is a valid registry against the console\'s real tabs', () => {
    expect(validateConsoleTourSteps(CONSOLE_TOUR_STEPS, CONSOLE_TABS)).toEqual([]);
  });

  it('has at least one step', () => {
    expect(CONSOLE_TOUR_STEPS.length).toBeGreaterThan(0);
  });

  it('keeps step bodies short (UI/UX C5: ~12 words, one idea)', () => {
    for (const step of CONSOLE_TOUR_STEPS) {
      expect(step.body.split(/\s+/).length).toBeLessThanOrEqual(20);
    }
  });
});

describe('validateConsoleTourSteps', () => {
  it('flags duplicate ids', () => {
    const steps: ConsoleTourStep[] = [
      { id: 'a', tab: 'verify', title: 'A', body: 'a' },
      { id: 'a', tab: 'verify', title: 'A2', body: 'a2' },
    ];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('duplicate step id: a');
  });

  it('flags a step targeting a tab the console does not have', () => {
    const steps: ConsoleTourStep[] = [{ id: 'a', tab: 'policy', title: 'A', body: 'a' }];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('step a targets unknown tab: policy');
  });

  it('flags an empty registry', () => {
    expect(validateConsoleTourSteps([], ['verify'])).toContain('tour has no steps');
  });
});

describe('clampConsoleTourStep', () => {
  it('clamps below zero to zero', () => {
    expect(clampConsoleTourStep(-1, 5)).toBe(0);
  });

  it('clamps at or beyond length to the last index', () => {
    expect(clampConsoleTourStep(5, 5)).toBe(4);
  });

  it('passes through an in-range index unchanged', () => {
    expect(clampConsoleTourStep(2, 5)).toBe(2);
  });
});
