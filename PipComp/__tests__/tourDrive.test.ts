import { classifyScreenChange, classifySignal } from '../src/lib/tourDrive';
import { BORROWER_TOUR_STEPS, type TourStep } from '../src/lib/tourSteps';

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
    expect(classifySignal(byId('kyc-verify'), 0, 'kyc-verified')).toBe('advance');
  });

  it('ignores a non-matching signal', () => {
    expect(classifySignal(byId('whatif'), 0, 'scan-saved')).toBe('ignore');
    expect(classifySignal(byId('welcome'), 0, 'scan-saved')).toBe('ignore');
    expect(classifySignal(null, 0, 'scan-saved')).toBe('ignore');
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
});
