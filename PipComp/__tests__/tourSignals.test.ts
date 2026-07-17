import { emitTourSignal, onTourSignal } from '../src/lib/tourSignals';

describe('tour signals', () => {
  it('delivers an emitted signal to a subscriber', () => {
    const seen: string[] = [];
    const off = onTourSignal((name) => seen.push(name));
    emitTourSignal('scan-saved');
    off();
    expect(seen).toEqual(['scan-saved']);
  });

  it('stops delivery after unsubscribe', () => {
    const seen: string[] = [];
    const off = onTourSignal((name) => seen.push(name));
    off();
    emitTourSignal('kyc-verified');
    expect(seen).toEqual([]);
  });

  it('fires every subscriber, and emitting with none is a no-op', () => {
    const a: string[] = [];
    const b: string[] = [];
    const offA = onTourSignal((n) => a.push(n));
    const offB = onTourSignal((n) => b.push(n));
    emitTourSignal('coach-chip-tapped');
    offA();
    offB();
    expect(a).toEqual(['coach-chip-tapped']);
    expect(b).toEqual(['coach-chip-tapped']);
    expect(() => emitTourSignal('scan-extracted')).not.toThrow();
  });

  it('a listener throwing does not starve the others', () => {
    const seen: string[] = [];
    const offBad = onTourSignal(() => {
      throw new Error('boom');
    });
    const offGood = onTourSignal((n) => seen.push(n));
    emitTourSignal('scan-extracted');
    offBad();
    offGood();
    expect(seen).toEqual(['scan-extracted']);
  });
});
