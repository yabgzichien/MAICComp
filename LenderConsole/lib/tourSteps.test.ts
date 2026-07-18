import { describe, expect, it } from 'vitest';
import {
  CONSOLE_TOUR_STEPS,
  actProgress,
  clampConsoleTourStep,
  fillPersona,
  validateConsoleTourSteps,
  type ConsoleTourStep,
} from './tourSteps';

const CONSOLE_TABS = ['verify', 'portfolio', 'capital', 'policy'];

describe('CONSOLE_TOUR_STEPS', () => {
  it("is a valid registry against the console's real tabs", () => {
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

  it('gives every do-step an advanceOn signal and a celebrate line', () => {
    for (const step of CONSOLE_TOUR_STEPS.filter((s) => s.kind === 'do')) {
      expect(step.advanceOn).toBeTruthy();
      expect(step.celebrate).toBeTruthy();
    }
  });

  it('has exactly one finale, and it is the last step', () => {
    const finales = CONSOLE_TOUR_STEPS.filter((s) => s.finale);
    expect(finales).toHaveLength(1);
    expect(CONSOLE_TOUR_STEPS[CONSOLE_TOUR_STEPS.length - 1].finale).toBe(true);
  });

  it('only carries persona tokens on steps flagged persona', () => {
    for (const step of CONSOLE_TOUR_STEPS) {
      const hasToken = /\{officer\}|\{lender\}/.test(step.body);
      if (hasToken) expect(step.persona).toBe(true);
    }
  });
});

describe('validateConsoleTourSteps', () => {
  const base = (over: Partial<ConsoleTourStep>): ConsoleTourStep => ({
    id: 'a',
    kind: 'explain',
    tab: 'verify',
    act: 1,
    actLabel: 'Act one',
    title: 'A',
    body: 'a',
    ...over,
  });

  it('flags duplicate ids', () => {
    const steps = [base({ id: 'a' }), base({ id: 'a', title: 'A2' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('duplicate step id: a');
  });

  it('flags a step targeting a tab the console does not have', () => {
    const steps = [base({ tab: 'policy' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('step a targets unknown tab: policy');
  });

  it('flags a do-step with no advanceOn', () => {
    const steps = [base({ kind: 'do' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('do step a has no advanceOn');
  });

  it('flags an explain-step that carries advanceOn', () => {
    const steps = [base({ kind: 'explain', advanceOn: 'assessed' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('explain step a must not have advanceOn');
  });

  it('flags a non-contiguous act jump', () => {
    const steps = [base({ id: 'a', act: 1, actLabel: 'One' }), base({ id: 'b', act: 3, actLabel: 'Three' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('acts must be contiguous: step b jumps to act 3');
  });

  it('flags inconsistent labels within an act', () => {
    const steps = [base({ id: 'a', act: 1, actLabel: 'One' }), base({ id: 'b', act: 1, actLabel: 'Uno' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('act 1 has inconsistent labels');
  });

  it('flags an empty registry', () => {
    expect(validateConsoleTourSteps([], ['verify'])).toContain('tour has no steps');
  });
});

describe('fillPersona', () => {
  it('substitutes officer and lender', () => {
    expect(fillPersona('You are {officer} at {lender}.', { officer: 'Farah', lender: 'TEKUN' })).toBe('You are Farah at TEKUN.');
  });

  it('falls back to neutral labels when a field is missing', () => {
    expect(fillPersona('You are {officer} at {lender}.', {})).toBe('You are the loan officer at your institution.');
  });

  it('leaves a token-free body untouched', () => {
    expect(fillPersona('Five trust checks.', { officer: 'Farah' })).toBe('Five trust checks.');
  });
});

describe('actProgress', () => {
  it('reports the act, total acts, and label for an index', () => {
    const last = CONSOLE_TOUR_STEPS.length - 1;
    const prog = actProgress(CONSOLE_TOUR_STEPS, last);
    expect(prog.totalActs).toBe(5);
    expect(prog.act).toBe(5);
    expect(prog.actLabel).toBe(CONSOLE_TOUR_STEPS[last].actLabel);
  });

  it('clamps an out-of-range index', () => {
    expect(actProgress(CONSOLE_TOUR_STEPS, 999).act).toBe(5);
    expect(actProgress(CONSOLE_TOUR_STEPS, -5).act).toBe(1);
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

  it('returns zero for an empty registry', () => {
    expect(clampConsoleTourStep(3, 0)).toBe(0);
  });
});
