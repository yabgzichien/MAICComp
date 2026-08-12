import { classifyHandoffGate, classifyScreenChange, classifySignal, isControlLocked } from '../src/lib/tourDrive';
import { BORROWER_TOUR_STEPS, stepsForBranch, type TourStep } from '../src/lib/tourSteps';

const byId = (id: string): TourStep => BORROWER_TOUR_STEPS.find((s) => s.id === id)!;

describe('classifyScreenChange', () => {
  it('ignores tour-driven navigation regardless of step', () => {
    expect(classifyScreenChange(byId('open-credit'), 0, 'credit', true)).toBe('ignore');
    expect(classifyScreenChange(byId('welcome'), 0, 'settings', true)).toBe('ignore');
  });

  it('ignores when no step is active', () => {
    expect(classifyScreenChange(null, 0, 'credit', false)).toBe('ignore');
  });

  it('advances a do step when the judge lands on its target screen', () => {
    expect(classifyScreenChange(byId('open-credit'), 0, 'credit', false)).toBe('advance');
    expect(classifyScreenChange(byId('open-coach'), 0, 'coach', false)).toBe('advance');
  });

  it('pauses a do step on stray navigation', () => {
    expect(classifyScreenChange(byId('open-credit'), 0, 'settings', false)).toBe('pause');
  });

  it('pauses an explain step on any user navigation (existing rule)', () => {
    expect(classifyScreenChange(byId('welcome'), 0, 'credit', false)).toBe('pause');
  });

  it('a signal-gated do step does not advance on navigation', () => {
    expect(classifyScreenChange(byId('whatif'), 0, 'coach', false)).toBe('pause');
  });

  it('advances the mission when its final screen-phase is reached', () => {
    expect(classifyScreenChange(byId('scan-mission'), 2, 'home', false)).toBe('advance');
  });

  it('pauses the mission on stray navigation mid-phase', () => {
    expect(classifyScreenChange(byId('scan-mission'), 0, 'settings', false)).toBe('pause');
  });

  it('a screen arrival that matches a non-final mission phase moves to the next phase', () => {
    const synthetic: TourStep = {
      ...byId('scan-mission'),
      mission: {
        cta: 'Go',
        phases: [
          { instruction: 'a', advanceOn: { screen: 'credit' } },
          { instruction: 'b', advanceOn: { signal: 'scan-saved' } },
        ],
      },
    };
    expect(classifyScreenChange(synthetic, 0, 'credit', false)).toBe('phase');
  });
});

describe('classifySignal', () => {
  it('advances a signal-gated do step on its signal', () => {
    expect(classifySignal(byId('whatif'), 0, 'coach-chip-tapped')).toBe('advance');
    expect(classifySignal(byId('kyc-verify'), 0, 'kyc-occupation-saved')).toBe('advance');
  });

  it('ignores a non-matching signal', () => {
    expect(classifySignal(byId('whatif'), 0, 'scan-saved')).toBe('ignore');
    expect(classifySignal(byId('welcome'), 0, 'scan-saved')).toBe('ignore');
    expect(classifySignal(null, 0, 'scan-saved')).toBe('ignore');
  });

  it('the kyc step waits for work & income too  a bare identity verification does not advance it', () => {
    expect(classifySignal(byId('kyc-verify'), 0, 'kyc-verified')).toBe('ignore');
  });

  it('steps the mission phase on the matching phase signal', () => {
    expect(classifySignal(byId('scan-mission'), 0, 'scan-extracted')).toBe('phase');
    expect(classifySignal(byId('scan-mission'), 1, 'scan-saved')).toBe('phase');
  });

  it('ignores a signal that does not match the current mission phase', () => {
    expect(classifySignal(byId('scan-mission'), 0, 'scan-saved')).toBe('ignore');
    expect(classifySignal(byId('scan-mission'), 1, 'scan-extracted')).toBe('ignore');
  });

  it('screen-gated do steps never advance on signals', () => {
    expect(classifySignal(byId('open-credit'), 0, 'scan-saved')).toBe('ignore');
  });

  // A handoff is cleared by its GATE opening (see `classifyHandoffGate`), never by a signal —
  // the two streams stay separate so a stray emission cannot jump the baton.
  it('handoff steps never advance on a signal', () => {
    for (const id of ['handoff-referred', 'handoff-approved', 'handoff-declined', 'loan-live']) {
      expect(classifySignal(byId(id), 0, 'application-sent')).toBe('ignore');
      expect(classifySignal(byId(id), 0, 'offer-accepted')).toBe('ignore');
    }
  });

  it('a handoff still pauses when the judge wanders to another screen', () => {
    expect(classifyScreenChange(byId('handoff-referred'), 0, 'home', false)).toBe('pause');
    expect(classifyScreenChange(byId('handoff-referred'), 0, 'loans', true)).toBe('ignore');
  });
});

describe('classifyHandoffGate', () => {
  it('advances the referred handoff the moment the gate reads open', () => {
    expect(classifyHandoffGate(byId('handoff-referred'), true)).toBe('advance');
  });

  it('stays put while the gate is still closed', () => {
    expect(classifyHandoffGate(byId('handoff-referred'), false)).toBe('ignore');
  });

  // Deliberately state-based, not transition-based: whether the gate was ALREADY open when the
  // step opened (a fast borrower, or the judge pressing Back onto an already-cleared step) must
  // not matter — there is no Continue button for the judge to fall back on either way.
  it('advances even when the gate was already open on arrival', () => {
    expect(classifyHandoffGate(byId('handoff-referred'), true)).toBe('advance');
  });

  // The `approved` ending's offer is published at send time and merely takes a poll to arrive,
  // so the gate is already open by the time the judge reaches this step (2026-08-12: this used
  // to hold on a manual Continue click, but that click was never real enforcement — Skip sat
  // right next to it and reached the same place — so the registry now marks it `onOpen: 'advance'`
  // like the referred ending).
  it('advances the approved handoff the moment the gate reads open', () => {
    expect(classifyHandoffGate(byId('handoff-approved'), true)).toBe('advance');
    expect(classifyHandoffGate(byId('handoff-approved'), false)).toBe('ignore');
  });

  it('never advances an ungated handoff', () => {
    for (const id of ['handoff-declined', 'loan-live']) {
      expect(classifyHandoffGate(byId(id), true)).toBe('ignore');
      expect(classifyHandoffGate(byId(id), false)).toBe('ignore');
    }
  });

  it('ignores non-handoff steps and no step at all', () => {
    expect(classifyHandoffGate(byId('accept-offer'), true)).toBe('ignore');
    expect(classifyHandoffGate(byId('welcome'), true)).toBe('ignore');
    expect(classifyHandoffGate(null, true)).toBe('ignore');
  });
});

describe('isControlLocked', () => {
  const run = stepsForBranch(BORROWER_TOUR_STEPS, 'referred');
  const indexOf = (id: string) => run.findIndex((s) => s.id === id);

  it('locks the send button until the act-6 step that asks for it', () => {
    expect(isControlLocked(run, 0, 'send-button')).toBe(true);
    expect(isControlLocked(run, indexOf('send-request') - 1, 'send-button')).toBe(true);
  });

  it('hands it over on that step, and leaves it open afterwards', () => {
    expect(isControlLocked(run, indexOf('send-request'), 'send-button')).toBe(false);
    expect(isControlLocked(run, run.length - 1, 'send-button')).toBe(false);
  });

  // Locking is opt-in by being part of the script: a control no do-step claims is the app's,
  // not the tour's, and must keep working normally throughout.
  it('never locks a control the script does not claim', () => {
    expect(isControlLocked(run, 0, 'coverage-chip')).toBe(false);
    expect(isControlLocked(run, 0, 'passport-card')).toBe(false);
    expect(isControlLocked(run, 0, 'nothing-of-the-sort')).toBe(false);
  });

  // A control whose only claiming step belongs to another ending is off-script for this whole
  // run — there is no step that will ever hand it over.
  it('locks a control this ending never asks for, for the whole run', () => {
    const declined = stepsForBranch(BORROWER_TOUR_STEPS, 'declined');
    expect(declined.some((s) => s.id === 'accept-offer')).toBe(false);
    expect(isControlLocked(declined, declined.length - 1, 'offer-accept-btn')).toBe(true);
  });
});
