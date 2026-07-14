import { BORROWER_TOUR_STEPS, clampTourStep, validateTourSteps, type TourStep } from '../src/lib/tourSteps';

const APP_SCREENS = ['home', 'add', 'settings', 'categories', 'transactions', 'breakdown', 'budget', 'recap', 'networth', 'credit', 'loans', 'passport', 'coach', 'lender', 'attacks', 'kyc', 'calendar'];

describe('BORROWER_TOUR_STEPS', () => {
  it('is a valid registry against the app\'s real screens', () => {
    expect(validateTourSteps(BORROWER_TOUR_STEPS, APP_SCREENS)).toEqual([]);
  });

  it('has at least one step and stops before minting (no passport-mint action step)', () => {
    expect(BORROWER_TOUR_STEPS.length).toBeGreaterThan(0);
  });

  it('keeps step bodies short (UI/UX C5: ~12 words, one idea)', () => {
    for (const step of BORROWER_TOUR_STEPS) {
      expect(step.body.split(/\s+/).length).toBeLessThanOrEqual(20);
    }
  });
});

describe('validateTourSteps', () => {
  it('flags duplicate ids', () => {
    const steps: TourStep[] = [
      { id: 'a', screen: 'home', title: 'A', body: 'a' },
      { id: 'a', screen: 'home', title: 'A2', body: 'a2' },
    ];
    expect(validateTourSteps(steps, ['home'])).toContain('duplicate step id: a');
  });

  it('flags a step targeting a screen the host app does not have', () => {
    const steps: TourStep[] = [{ id: 'a', screen: 'coach', title: 'A', body: 'a' }];
    expect(validateTourSteps(steps, ['home'])).toContain('step a targets unknown screen: coach');
  });

  it('flags an empty registry', () => {
    expect(validateTourSteps([], ['home'])).toContain('tour has no steps');
  });

  it('is valid for a well-formed registry', () => {
    const steps: TourStep[] = [{ id: 'a', screen: 'home', title: 'A', body: 'a' }];
    expect(validateTourSteps(steps, ['home'])).toEqual([]);
  });
});

describe('clampTourStep', () => {
  it('clamps below zero to zero', () => {
    expect(clampTourStep(-1, 5)).toBe(0);
  });

  it('clamps at or beyond length to the last index', () => {
    expect(clampTourStep(5, 5)).toBe(4);
    expect(clampTourStep(99, 5)).toBe(4);
  });

  it('passes through an in-range index unchanged', () => {
    expect(clampTourStep(2, 5)).toBe(2);
  });

  it('returns 0 for an empty registry', () => {
    expect(clampTourStep(0, 0)).toBe(0);
  });
});
