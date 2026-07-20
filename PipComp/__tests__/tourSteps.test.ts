import {
  BORROWER_TOUR_STEPS,
  actProgress,
  clampTourStep,
  validateTourSteps,
  type TourStep,
} from '../src/lib/tourSteps';

const APP_SCREENS = ['home', 'add', 'settings', 'categories', 'transactions', 'breakdown', 'budget', 'recap', 'networth', 'credit', 'loans', 'passport', 'coach', 'lender', 'attacks', 'kyc', 'calendar'];

/** Minimal valid explain step for fixture-building. */
function explain(id: string, over: Partial<TourStep> = {}): TourStep {
  return { id, kind: 'explain', screen: 'home', act: 1, actLabel: 'Act', pip: 'think', title: id, body: id, ...over } as TourStep;
}

describe('BORROWER_TOUR_STEPS (the approved 5-act script)', () => {
  it('is a valid registry against the app\'s real screens', () => {
    expect(validateTourSteps(BORROWER_TOUR_STEPS, APP_SCREENS)).toEqual([]);
  });

  it('follows the approved id order', () => {
    expect(BORROWER_TOUR_STEPS.map((s) => s.id)).toEqual([
      'welcome',
      'coverage',
      'open-credit',
      'credit-score',
      'scan-mission',
      'coverage-delta',
      'open-coach',
      'coach-plan',
      'whatif',
      'whatif-explore',
      'kyc-verify',
      'mint-passport',
      'passport',
      'finale',
    ]);
  });

  it('spans exactly 5 acts, numbered contiguously from 1', () => {
    const acts = [...new Set(BORROWER_TOUR_STEPS.map((s) => s.act))];
    expect(acts).toEqual([1, 2, 3, 4, 5]);
  });

  it('mixes kinds: 5 do steps, 1 mission, rest explain', () => {
    const byKind = { explain: 0, do: 0, mission: 0 };
    for (const s of BORROWER_TOUR_STEPS) byKind[s.kind]++;
    expect(byKind.do).toBe(5);
    expect(byKind.mission).toBe(1);
    expect(byKind.explain).toBe(BORROWER_TOUR_STEPS.length - 6);
  });

  it('the mission walks extract, categorize, then the trip home', () => {
    const mission = BORROWER_TOUR_STEPS.find((s) => s.kind === 'mission')!;
    expect(mission.mission!.phases.map((p) => p.advanceOn)).toEqual([
      { signal: 'scan-extracted' },
      { signal: 'scan-saved' },
      { screen: 'home' },
    ]);
    expect(mission.mission!.cta.length).toBeGreaterThan(0);
  });

  it('the coverage-delta beat directly follows the mission, on home, anchored to the chip', () => {
    const i = BORROWER_TOUR_STEPS.findIndex((s) => s.kind === 'mission');
    const delta = BORROWER_TOUR_STEPS[i + 1];
    expect(delta.id).toBe('coverage-delta');
    expect(delta.screen).toBe('home');
    expect(delta.anchorId).toBe('coverage-chip');
  });

  it('every do step celebrates, and the finale keeps the Attack Gallery CTA', () => {
    for (const s of BORROWER_TOUR_STEPS.filter((x) => x.kind === 'do')) {
      expect(s.celebrate && s.celebrate.length > 0).toBe(true);
    }
    const finale = BORROWER_TOUR_STEPS[BORROWER_TOUR_STEPS.length - 1];
    expect(finale.actionScreen).toBe('attacks');
  });

  it('keeps step bodies short (UI/UX C5: one idea, verdict first)', () => {
    for (const step of BORROWER_TOUR_STEPS) {
      expect(step.body.split(/\s+/).length).toBeLessThanOrEqual(20);
    }
  });
});

describe('validateTourSteps', () => {
  it('flags duplicate ids', () => {
    const steps = [explain('a'), explain('a')];
    expect(validateTourSteps(steps, ['home'])).toContain('duplicate step id: a');
  });

  it('flags a step targeting a screen the host app does not have', () => {
    const steps = [explain('a', { screen: 'coach' })];
    expect(validateTourSteps(steps, ['home'])).toContain('step a targets unknown screen: coach');
  });

  it('flags an empty registry', () => {
    expect(validateTourSteps([], ['home'])).toContain('tour has no steps');
  });

  it('is valid for a well-formed registry', () => {
    expect(validateTourSteps([explain('a')], ['home'])).toEqual([]);
  });

  it('flags a step whose action targets an unknown screen', () => {
    const steps = [explain('a', { actionLabel: 'Go', actionScreen: 'attacks' })];
    expect(validateTourSteps(steps, ['home'])).toContain('step a has an action targeting unknown screen: attacks');
  });

  it('flags actionLabel/actionScreen set without its pair', () => {
    const steps = [explain('a', { actionLabel: 'Go' })];
    expect(validateTourSteps(steps, ['home'])).toContain('step a: actionLabel and actionScreen must be set together');
  });

  it('flags a do step with no advance condition', () => {
    const steps = [{ ...explain('a'), kind: 'do' as const }];
    expect(validateTourSteps(steps, ['home'])).toContain('do step a has no advanceOn');
  });

  it('flags an explain step carrying an advance condition', () => {
    const steps = [explain('a', { advanceOn: { screen: 'home' } })];
    expect(validateTourSteps(steps, ['home'])).toContain('explain step a must not have advanceOn or mission');
  });

  it('flags a do step whose advance screen is unknown to the host app', () => {
    const steps = [{ ...explain('a'), kind: 'do' as const, advanceOn: { screen: 'credit' as const } }];
    expect(validateTourSteps(steps, ['home'])).toContain('step a advances on unknown screen: credit');
  });

  it('flags a mission with no phases and a mission phase advancing on an unknown screen', () => {
    const empty = [{ ...explain('a'), kind: 'mission' as const, mission: { cta: 'Go', phases: [] } }];
    expect(validateTourSteps(empty, ['home'])).toContain('mission step a has no phases');
    const bad = [{
      ...explain('b'),
      kind: 'mission' as const,
      mission: { cta: 'Go', phases: [{ instruction: 'x', advanceOn: { screen: 'credit' as const } }] },
    }];
    expect(validateTourSteps(bad, ['home'])).toContain('step b phase 1 advances on unknown screen: credit');
  });

  it('flags act numbering that skips or regresses', () => {
    const skip = [explain('a', { act: 1 }), explain('b', { act: 3 })];
    expect(validateTourSteps(skip, ['home'])).toContain('acts must be contiguous: step b jumps to act 3');
    const regress = [explain('a', { act: 2 })];
    expect(validateTourSteps(regress, ['home'])).toContain('first step must start act 1');
    const backwards = [explain('a', { act: 1 }), explain('b', { act: 2 }), explain('c', { act: 1 })];
    expect(validateTourSteps(backwards, ['home'])).toContain('acts must not regress: step c returns to act 1');
  });

  it('flags an act whose label changes between its steps', () => {
    const steps = [explain('a', { actLabel: 'One' }), explain('b', { actLabel: 'Two' })];
    expect(validateTourSteps(steps, ['home'])).toContain('act 1 has inconsistent labels');
  });
});

describe('actProgress', () => {
  const steps = [
    explain('a', { act: 1, actLabel: 'Meet' }),
    explain('b', { act: 1, actLabel: 'Meet' }),
    explain('c', { act: 2, actLabel: 'Score' }),
    explain('d', { act: 3, actLabel: 'Move' }),
  ];

  it('reports the current act, total acts, and label', () => {
    expect(actProgress(steps, 0)).toEqual({ act: 1, totalActs: 3, actLabel: 'Meet' });
    expect(actProgress(steps, 2)).toEqual({ act: 2, totalActs: 3, actLabel: 'Score' });
    expect(actProgress(steps, 3)).toEqual({ act: 3, totalActs: 3, actLabel: 'Move' });
  });

  it('clamps an out-of-range index', () => {
    expect(actProgress(steps, 99).act).toBe(3);
    expect(actProgress(steps, -1).act).toBe(1);
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
