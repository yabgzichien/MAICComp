import {
  BORROWER_TOUR_STEPS,
  TOUR_TOTAL_ACTS,
  actProgress,
  clampTourStep,
  fillPersona,
  stepsForBranch,
  validateTourBranches,
  validateTourSteps,
  type TourBranch,
  type TourStep,
} from '../src/lib/tourSteps';
import { DEMO_PROFILES } from '../src/data/demoPersonas';

/** App.tsx's real `Screen` union. */
const APP_SCREENS = ['home', 'add', 'settings', 'categories', 'transactions', 'breakdown', 'budget', 'recap', 'networth', 'credit', 'loans', 'passport', 'coach', 'attacks', 'kyc', 'calendar', 'advancedImport'];

/** Minimal valid explain step for fixture-building. */
function explain(id: string, over: Partial<TourStep> = {}): TourStep {
  return { id, kind: 'explain', screen: 'home', act: 1, actLabel: 'Act', pip: 'think', title: id, body: id, ...over } as TourStep;
}

describe('BORROWER_TOUR_STEPS (the borrower half of the unified script)', () => {
  it("is a valid registry against the app's real screens", () => {
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
      'coach-criteria',
      'coach-plan',
      'whatif',
      'whatif-explore',
      'kyc-verify',
      'mint-passport',
      'passport',
      'choose-lender',
      'send-request',
      'handoff-referred',
      'handoff-approved',
      'handoff-declined',
      'offer-arrived',
      'accept-offer',
      'loan-live',
    ]);
  });

  it('owns acts 1-6 and 9, skipping the three the console owns', () => {
    const acts = [...new Set(BORROWER_TOUR_STEPS.map((s) => s.act))];
    expect(acts).toEqual([1, 2, 3, 4, 5, 6, 9]);
  });

  it('mixes kinds: 7 do steps, 1 mission, 4 handoffs, rest explain', () => {
    const byKind = { explain: 0, do: 0, mission: 0, handoff: 0 };
    for (const s of BORROWER_TOUR_STEPS) byKind[s.kind]++;
    expect(byKind.do).toBe(7);
    expect(byKind.mission).toBe(1);
    expect(byKind.handoff).toBe(4);
    expect(byKind.explain).toBe(BORROWER_TOUR_STEPS.length - 12);
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

  it('offers the Attack Gallery exactly once, off the passport beat', () => {
    // The gallery is otherwise reachable only from Settings, which a judge on the guided path
    // never opens. This deep-link is the only thing that puts the fraud self-test in front of
    // them, so it must not silently fall out of the script.
    const withAction = BORROWER_TOUR_STEPS.filter((s) => s.actionScreen === 'attacks');
    expect(withAction.map((s) => s.id)).toEqual(['passport']);
    expect(withAction[0].actionLabel).toBe('See the fraud defences work');
    // Taking the action ends the tour, so it may not sit on a step that still owes the judge
    // something to do.
    expect(withAction[0].kind).toBe('explain');
  });

  it('every do step celebrates', () => {
    for (const s of BORROWER_TOUR_STEPS.filter((x) => x.kind === 'do')) {
      expect(s.celebrate && s.celebrate.length > 0).toBe(true);
    }
  });

  it('keeps step bodies short (UI/UX C5: one idea, verdict first)', () => {
    for (const step of BORROWER_TOUR_STEPS) {
      expect(step.body.split(/\s+/).length).toBeLessThanOrEqual(20);
    }
  });

  // The whole point of act 6: the send is the judge's own action, and the handoff that follows
  // it waits on the lender.
  it('act 6 sends the request itself, then hands off', () => {
    const send = BORROWER_TOUR_STEPS.find((s) => s.id === 'send-request')!;
    expect(send.kind).toBe('do');
    expect(send.advanceOn).toEqual({ signal: 'application-sent' });
    for (const id of ['handoff-referred', 'handoff-approved', 'handoff-declined']) {
      const step = BORROWER_TOUR_STEPS.find((s) => s.id === id)!;
      expect(step.kind).toBe('handoff');
      expect(step.handoff!.target).toBe('console');
    }
  });

  // Regression guard for the reason act 6's handoff lives on My Financing: useLenderSyncPoll
  // mounts only on Dashboard and My Financing, so a handoff parked on the passport screen
  // would never notice the offer arrive and its gate could never open.
  it('every gated handoff sits on a screen that polls for offers', () => {
    const polling = ['home', 'loans'];
    for (const step of BORROWER_TOUR_STEPS.filter((s) => s.handoff?.gate === 'offer-pending')) {
      expect(polling).toContain(step.screen);
    }
  });

  // The referred and approved handoffs both self-advance: referred because the gate can only
  // open once the judge approved the file in the console, approved because the offer already
  // exists at send time and the gate is open on arrival either way — a manual click there added
  // no enforcement a plain Skip didn't already undo. declined and loan-live stay on prompt: the
  // first has nothing to ride (`gate: 'none'`), the second wants a deliberate click.
  it('the referred and approved handoffs self-advance when their gate opens', () => {
    const onOpen = (id: string) => BORROWER_TOUR_STEPS.find((s) => s.id === id)!.handoff!.onOpen;
    expect(onOpen('handoff-referred')).toBe('advance');
    expect(onOpen('handoff-approved')).toBe('advance');
    expect(onOpen('handoff-declined')).toBe('prompt');
    expect(onOpen('loan-live')).toBe('prompt');
  });

  // A self-advancing handoff renders no Continue button, so its waiting line is the only thing
  // on the card telling the judge what is being waited on.
  it('a self-advancing handoff says what it is waiting for', () => {
    for (const step of BORROWER_TOUR_STEPS.filter((s) => s.handoff?.onOpen === 'advance')) {
      expect(step.handoff!.waiting.length).toBeGreaterThan(0);
    }
  });

  // The five beats that MAKE what the rest of the script reads: the scan the coverage delta is
  // measured against, the identity the passport needs, the passport the application carries,
  // the send that decides the ending and puts a file on the console's desk, and the acceptance
  // that turns a standing offer into the live loan act 10 services and structures.
  it('the artefact-making steps cannot be skipped', () => {
    const required = BORROWER_TOUR_STEPS.filter((s) => s.required).map((s) => s.id);
    expect(required).toEqual(['scan-mission', 'kyc-verify', 'mint-passport', 'send-request', 'accept-offer']);
  });

  it('every required step is one the judge acts on, never an explain or a handoff', () => {
    for (const step of BORROWER_TOUR_STEPS.filter((s) => s.required)) {
      expect(['do', 'mission']).toContain(step.kind);
    }
  });

  it('the acceptance act is unreachable on the declined branch', () => {
    const declined = stepsForBranch(BORROWER_TOUR_STEPS, 'declined').map((s) => s.id);
    expect(declined).not.toContain('accept-offer');
    expect(declined).not.toContain('offer-arrived');
    expect(declined).toContain('handoff-declined');
  });

  it('has no unreachable ending on any branch', () => {
    expect(validateTourBranches(BORROWER_TOUR_STEPS)).toEqual([]);
  });
});

describe('stepsForBranch', () => {
  const steps = [
    explain('shared'),
    explain('only-ref', { branches: ['referred'] }),
    explain('ref-and-app', { branches: ['referred', 'approved'] }),
  ];

  it('keeps unbranched steps in every run', () => {
    for (const b of ['referred', 'approved', 'declined'] as TourBranch[]) {
      expect(stepsForBranch(steps, b).map((s) => s.id)).toContain('shared');
    }
  });

  it('includes a step only in the branches it declares', () => {
    expect(stepsForBranch(steps, 'referred').map((s) => s.id)).toEqual(['shared', 'only-ref', 'ref-and-app']);
    expect(stepsForBranch(steps, 'approved').map((s) => s.id)).toEqual(['shared', 'ref-and-app']);
    expect(stepsForBranch(steps, 'declined').map((s) => s.id)).toEqual(['shared']);
  });

  // The property that keeps the persisted step index meaningful across the moment the branch
  // is decided: every branch run must start with the same unbranched prefix, so the list only
  // ever grows at the tail rather than shifting under a saved index.
  it('a null branch yields exactly the prefix every branch run shares', () => {
    const none = stepsForBranch(BORROWER_TOUR_STEPS, null).map((s) => s.id);
    for (const b of ['referred', 'approved', 'declined'] as TourBranch[]) {
      const run = stepsForBranch(BORROWER_TOUR_STEPS, b).map((s) => s.id);
      expect(run.slice(0, none.length)).toEqual(none);
    }
  });
});

describe('validateTourBranches', () => {
  it('flags a branch that ends on a gate the judge can never clear', () => {
    const steps = [
      explain('a'),
      {
        ...explain('b', { branches: ['referred'] }),
        kind: 'handoff' as const,
        handoff: { target: 'console' as const, cta: 'Go', waiting: 'w', ready: 'r', gate: 'offer-pending' as const, onOpen: 'prompt' as const },
      },
    ];
    expect(validateTourBranches(steps)).toContain(
      'branch referred ends on a gated handoff (b) the judge can never clear'
    );
  });

  it('accepts a branch ending on an ungated handoff', () => {
    const steps = [
      {
        ...explain('a'),
        kind: 'handoff' as const,
        handoff: { target: 'console' as const, cta: 'Go', waiting: '', ready: 'r', gate: 'none' as const, onOpen: 'prompt' as const },
      },
    ];
    expect(validateTourBranches(steps)).toEqual([]);
  });

  it('flags a branch with no steps at all', () => {
    expect(validateTourBranches([explain('a', { branches: ['referred'] })])).toContain('branch approved has no steps');
  });
});

// Regression for a bug caught in live click-through (2026-07-25): TourCard filled step.title
// and step.body through fillPersona but rendered progress.actLabel raw, so the act meter
// showed the literal "Act 1 of 10 · Meet {name}" instead of the persona's name. Fixed by
// filling actLabel too; pinned here at the data level so a future actLabel that grows a token
// can't silently reintroduce the same leak, on either an empty persona or a filled one.
describe('every step surface is token-clean once filled', () => {
  const persona = { name: 'Aina', role: 'online seller' };

  it('title, body, and actLabel all fill clean with a real persona', () => {
    for (const step of BORROWER_TOUR_STEPS) {
      expect(fillPersona(step.title, persona)).not.toMatch(/\{name\}|\{role\}/);
      expect(fillPersona(step.body, persona)).not.toMatch(/\{name\}|\{role\}/);
      expect(fillPersona(step.actLabel, persona)).not.toMatch(/\{name\}|\{role\}/);
    }
  });

  it('title, body, and actLabel all fill clean even with no persona loaded', () => {
    for (const step of BORROWER_TOUR_STEPS) {
      expect(fillPersona(step.title, {})).not.toMatch(/\{name\}|\{role\}/);
      expect(fillPersona(step.body, {})).not.toMatch(/\{name\}|\{role\}/);
      expect(fillPersona(step.actLabel, {})).not.toMatch(/\{name\}|\{role\}/);
    }
  });

  // Regression for the a/an bug found in the same click-through: "You are {name}, a {role}"
  // read "a online seller" for Aina ("Delivery driver" and "Small trader" happened to scan
  // fine, which is exactly how this kind of bug hides until the third persona). Runs the
  // real onboarding roster, not a hand-picked fixture, so a future persona with a
  // vowel-leading role trips this the same way Aina did.
  it('never produces "a" directly before a vowel-leading word, for any real persona', () => {
    for (const persona of DEMO_PROFILES) {
      const ctx = { name: persona.name, role: persona.role.toLowerCase() };
      for (const step of BORROWER_TOUR_STEPS) {
        for (const text of [fillPersona(step.title, ctx), fillPersona(step.body, ctx), fillPersona(step.actLabel, ctx)]) {
          expect(text).not.toMatch(/\ba (?=[aeiouAEIOU])/);
        }
      }
    }
  });
});

describe('fillPersona', () => {
  it('fills name and role', () => {
    expect(fillPersona('You are {name}, a {role}.', { name: 'Ravi', role: 'delivery driver' })).toBe(
      'You are Ravi, a delivery driver.'
    );
  });

  it('replaces every occurrence, not just the first', () => {
    expect(fillPersona('{name} and {name}', { name: 'Aina' })).toBe('Aina and Aina');
  });

  it('falls back to neutral labels rather than rendering a raw token', () => {
    expect(fillPersona('{name} the {role}', {})).toBe('the borrower the micro-entrepreneur');
  });

  it('leaves untokenized copy untouched', () => {
    expect(fillPersona('No tokens here.', { name: 'Aina' })).toBe('No tokens here.');
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
    expect(validateTourSteps(steps, ['home'])).toContain('explain step a must not have advanceOn, mission, or handoff');
  });

  it('flags a handoff step with no handoff block, and one carrying an advance condition', () => {
    const bare = [{ ...explain('a'), kind: 'handoff' as const }];
    expect(validateTourSteps(bare, ['home'])).toContain('handoff step a has no handoff block');
    const both = [{
      ...explain('b'),
      kind: 'handoff' as const,
      handoff: { target: 'console' as const, cta: 'Go', waiting: 'w', ready: 'r', gate: 'none' as const, onOpen: 'prompt' as const },
      advanceOn: { screen: 'home' as const },
    }];
    expect(validateTourSteps(both, ['home'])).toContain('handoff step b must not have advanceOn or mission');
  });

  it('flags a required step that has no Skip to withhold', () => {
    expect(validateTourSteps([{ ...explain('a'), required: true }], ['home'])).toContain(
      'step a is explain, which cannot be required'
    );
    const handoff = [{
      ...explain('b'),
      kind: 'handoff' as const,
      required: true,
      handoff: { target: 'console' as const, cta: 'Go', waiting: 'w', ready: 'r', gate: 'none' as const, onOpen: 'prompt' as const },
    }];
    expect(validateTourSteps(handoff, ['home'])).toContain('step b is handoff, which cannot be required');
  });

  it('flags an ungated handoff that claims it will self-advance', () => {
    const steps = [{
      ...explain('a'),
      kind: 'handoff' as const,
      handoff: { target: 'console' as const, cta: 'Go', waiting: '', ready: 'r', gate: 'none' as const, onOpen: 'advance' as const },
    }];
    expect(validateTourSteps(steps, ['home'])).toContain('handoff step a is ungated, so it cannot self-advance');
  });

  it('flags an empty branches list', () => {
    const steps = [explain('a', { branches: [] })];
    expect(validateTourSteps(steps, ['home'])).toContain('step a has an empty branches list');
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

  // Relaxed for the cross-app script: this registry legitimately jumps act 6 → 9 because the
  // console owns 7 and 8. Regression and out-of-range are still errors.
  it('allows an act gap, since the other app owns the missing acts', () => {
    const steps = [explain('a', { act: 6, actLabel: 'Six' }), explain('b', { act: 9, actLabel: 'Nine' })];
    expect(validateTourSteps(steps, ['home'])).toEqual([]);
  });

  it('flags act numbering that regresses or leaves the script', () => {
    const backwards = [explain('a', { act: 2, actLabel: 'Two' }), explain('b', { act: 1, actLabel: 'One' })];
    expect(validateTourSteps(backwards, ['home'])).toContain('acts must not regress: step b returns to act 1');
    const under = [explain('a', { act: 0 })];
    expect(validateTourSteps(under, ['home'])).toContain('step a has act 0, below 1');
    const over = [explain('a', { act: TOUR_TOTAL_ACTS + 1 })];
    expect(validateTourSteps(over, ['home'])).toContain(
      `step a has act ${TOUR_TOTAL_ACTS + 1}, above the script's ${TOUR_TOTAL_ACTS}`
    );
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

  it('counts the whole cross-app script when given an explicit total', () => {
    expect(actProgress(steps, 0, TOUR_TOTAL_ACTS)).toEqual({ act: 1, totalActs: 10, actLabel: 'Meet' });
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
