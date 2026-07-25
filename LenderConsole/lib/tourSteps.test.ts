import { describe, expect, it } from 'vitest';
import {
  CONSOLE_TOUR_STEPS,
  TOUR_TOTAL_ACTS,
  actProgress,
  branchForDecision,
  clampConsoleTourStep,
  fillPersona,
  stepsForBranch,
  validateConsoleTourBranches,
  validateConsoleTourSteps,
  type ConsoleTourBranch,
  type ConsoleTourStep,
} from './tourSteps';

const CONSOLE_TABS = ['verify', 'servicing', 'portfolio', 'capital', 'policy'];
const BRANCHES: ConsoleTourBranch[] = ['referred', 'approved', 'declined'];

describe('CONSOLE_TOUR_STEPS (the console half of the unified script)', () => {
  it("is a valid registry against the console's real tabs", () => {
    expect(validateConsoleTourSteps(CONSOLE_TOUR_STEPS, CONSOLE_TABS)).toEqual([]);
  });

  it('owns acts 7, 8 and 10 — the borrower app owns the rest', () => {
    const acts = Array.from(new Set(CONSOLE_TOUR_STEPS.map((s) => s.act)));
    expect(acts).toEqual([7, 8, 10]);
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

  it('only carries persona tokens on steps flagged persona', () => {
    for (const step of CONSOLE_TOUR_STEPS) {
      const hasToken = /\{officer\}|\{lender\}|\{applicant\}/.test(step.body);
      if (hasToken) expect(step.persona).toBe(true);
    }
  });

  it('every branch ends on exactly one finale', () => {
    expect(validateConsoleTourBranches(CONSOLE_TOUR_STEPS)).toEqual([]);
  });

  // The officer's own action is what publishes the offer, and it exists only on the branch
  // where the engine actually deferred. An already-approved or declined file has no approve
  // step to press.
  it('only the referred branch carries an approve step', () => {
    expect(stepsForBranch(CONSOLE_TOUR_STEPS, 'referred').map((s) => s.id)).toContain('approve');
    expect(stepsForBranch(CONSOLE_TOUR_STEPS, 'approved').map((s) => s.id)).not.toContain('approve');
    expect(stepsForBranch(CONSOLE_TOUR_STEPS, 'declined').map((s) => s.id)).not.toContain('approve');
  });

  it('only the declined branch issues an adverse-action letter', () => {
    expect(stepsForBranch(CONSOLE_TOUR_STEPS, 'declined').map((s) => s.id)).toContain('letter');
    expect(stepsForBranch(CONSOLE_TOUR_STEPS, 'referred').map((s) => s.id)).not.toContain('letter');
  });

  // A decline never publishes an offer, so there is no loan to accept or service. The branch
  // must close in the console rather than handing a baton to a borrower with nothing to answer.
  it('the declined branch closes at act 8, never reaching servicing', () => {
    const declined = stepsForBranch(CONSOLE_TOUR_STEPS, 'declined');
    expect(declined.map((s) => s.id)).not.toContain('handoff-answer');
    expect(declined.some((s) => s.act === 10)).toBe(false);
    expect(declined[declined.length - 1].id).toBe('finale-declined');
  });

  it('the two offer branches hand back and then service the loan', () => {
    for (const branch of ['referred', 'approved'] as ConsoleTourBranch[]) {
      const ids = stepsForBranch(CONSOLE_TOUR_STEPS, branch).map((s) => s.id);
      expect(ids).toContain('handoff-answer');
      expect(ids).toContain('repayment');
      expect(ids[ids.length - 1]).toBe('finale');
    }
  });

  // Unlike the borrower registry, this one interleaves branched steps among unbranched ones
  // (the verdict reading and the officer's action both sit mid-act-7), so the branch runs do
  // NOT share a prefix. That is safe here only because the console knows its branch before
  // step 0 — it adopts the file first and holds until it has one — whereas the borrower
  // decides its branch mid-run at act 6 and therefore does need the prefix property.
  //
  // The invariant that keeps a persisted index meaningful across a reload is instead that the
  // branch is derived from something immutable: `engineDecision` at filing, never `status`,
  // which flips referred → approved the moment the officer approves and would otherwise
  // reshape the step list underneath the saved index mid-tour.
  it('holds no steps at all until a branch is known', () => {
    const none = stepsForBranch(CONSOLE_TOUR_STEPS, null);
    expect(none.every((s) => !s.branches)).toBe(true);
    for (const branch of BRANCHES) {
      expect(stepsForBranch(CONSOLE_TOUR_STEPS, branch).length).toBeGreaterThan(none.length);
    }
  });
});

describe('branchForDecision', () => {
  it('maps the engine verdict onto the ending', () => {
    expect(branchForDecision('approve')).toBe('approved');
    expect(branchForDecision('refer')).toBe('referred');
    expect(branchForDecision('decline')).toBe('declined');
  });

  // The reason this reads engineDecision rather than status: an officer approving a referred
  // file changes its status but not the branch the tour is already running.
  it('is stable across the officer resolving the file', () => {
    const atFiling = branchForDecision('refer');
    expect(branchForDecision('refer')).toBe(atFiling);
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
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('explain step a must not have advanceOn or handoff');
  });

  it('flags a handoff-step with no handoff block, and one carrying advanceOn', () => {
    expect(validateConsoleTourSteps([base({ kind: 'handoff' })], ['verify'])).toContain('handoff step a has no handoff block');
    const both = base({
      kind: 'handoff',
      advanceOn: 'assessed',
      handoff: { target: 'borrower', cta: 'Go', waiting: 'w', ready: 'r', gate: 'none' },
    });
    expect(validateConsoleTourSteps([both], ['verify'])).toContain('handoff step a must not have advanceOn');
  });

  it('flags an empty branches list', () => {
    expect(validateConsoleTourSteps([base({ branches: [] })], ['verify'])).toContain('step a has an empty branches list');
  });

  // Relaxed for the cross-app script: this registry legitimately starts at 7 and jumps 8 → 10.
  it('allows a registry that starts above act 1 and skips an act', () => {
    const steps = [base({ id: 'a', act: 7, actLabel: 'Seven' }), base({ id: 'b', act: 10, actLabel: 'Ten' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toEqual([]);
  });

  it('flags act numbering that regresses or leaves the script', () => {
    const backwards = [base({ id: 'a', act: 8, actLabel: 'Eight' }), base({ id: 'b', act: 7, actLabel: 'Seven' })];
    expect(validateConsoleTourSteps(backwards, ['verify'])).toContain('acts must not regress: step b returns to act 7');
    expect(validateConsoleTourSteps([base({ act: 0 })], ['verify'])).toContain('step a has act 0, below 1');
    expect(validateConsoleTourSteps([base({ act: TOUR_TOTAL_ACTS + 1 })], ['verify'])).toContain(
      `step a has act ${TOUR_TOTAL_ACTS + 1}, above the script's ${TOUR_TOTAL_ACTS}`
    );
  });

  it('flags inconsistent labels within an act', () => {
    const steps = [base({ id: 'a', act: 1, actLabel: 'One' }), base({ id: 'b', act: 1, actLabel: 'Uno' })];
    expect(validateConsoleTourSteps(steps, ['verify'])).toContain('act 1 has inconsistent labels');
  });

  it('flags an empty registry', () => {
    expect(validateConsoleTourSteps([], ['verify'])).toContain('tour has no steps');
  });
});

describe('validateConsoleTourBranches', () => {
  const base = (over: Partial<ConsoleTourStep>): ConsoleTourStep => ({
    id: 'a',
    kind: 'explain',
    tab: 'verify',
    act: 7,
    actLabel: 'Seven',
    title: 'A',
    body: 'a',
    ...over,
  });

  it('flags a branch that trails off without a finale', () => {
    expect(validateConsoleTourBranches([base({})])).toContain('branch referred does not end on a finale');
  });

  it('flags a branch with two finales', () => {
    const steps = [base({ id: 'a', finale: true }), base({ id: 'b', finale: true })];
    expect(validateConsoleTourBranches(steps)).toContain('branch referred must have exactly one finale');
  });

  it('flags a branch with no steps at all', () => {
    const steps = [base({ id: 'a', finale: true, branches: ['referred'] })];
    expect(validateConsoleTourBranches(steps)).toContain('branch approved has no steps');
  });
});

describe('fillPersona', () => {
  it('substitutes officer, lender and applicant', () => {
    expect(fillPersona('{officer} at {lender} reviewing {applicant}.', { officer: 'Farah', lender: 'TEKUN', applicant: 'Aina' })).toBe(
      'Farah at TEKUN reviewing Aina.'
    );
  });

  it('falls back to neutral labels when a field is missing', () => {
    expect(fillPersona('You are {officer} at {lender}, reviewing {applicant}.', {})).toBe(
      'You are the loan officer at your institution, reviewing the borrower.'
    );
  });

  it('leaves a token-free body untouched', () => {
    expect(fillPersona('Five trust checks.', { officer: 'Farah' })).toBe('Five trust checks.');
  });
});

describe('actProgress', () => {
  it('reports the act, total acts, and label for an index', () => {
    const last = CONSOLE_TOUR_STEPS.length - 1;
    const prog = actProgress(CONSOLE_TOUR_STEPS, last, TOUR_TOTAL_ACTS);
    expect(prog.totalActs).toBe(10);
    expect(prog.act).toBe(10);
    expect(prog.actLabel).toBe(CONSOLE_TOUR_STEPS[last].actLabel);
  });

  it('counts the whole cross-app script, not just this half', () => {
    expect(actProgress(CONSOLE_TOUR_STEPS, 0, TOUR_TOTAL_ACTS)).toMatchObject({ act: 7, totalActs: 10 });
  });

  it('clamps an out-of-range index', () => {
    expect(actProgress(CONSOLE_TOUR_STEPS, 999).act).toBe(10);
    expect(actProgress(CONSOLE_TOUR_STEPS, -5).act).toBe(7);
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
