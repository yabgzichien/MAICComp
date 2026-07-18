import { describe, expect, it, vi } from 'vitest';
import { emitTourSignal, onTourSignal } from './tourSignals';

describe('tour signal bus', () => {
  it('delivers an emitted signal to every subscriber', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onTourSignal(a);
    const offB = onTourSignal(b);
    emitTourSignal('assessed');
    expect(a).toHaveBeenCalledWith('assessed');
    expect(b).toHaveBeenCalledWith('assessed');
    offA();
    offB();
  });

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn();
    const off = onTourSignal(listener);
    off();
    emitTourSignal('pipeline-seeded');
    expect(listener).not.toHaveBeenCalled();
  });

  it('is safe to emit with no subscribers', () => {
    expect(() => emitTourSignal('flagged-loaded')).not.toThrow();
  });

  it('a throwing listener never starves the rest', () => {
    const bad = onTourSignal(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const offGood = onTourSignal(good);
    expect(() => emitTourSignal('memo-opened')).not.toThrow();
    expect(good).toHaveBeenCalledWith('memo-opened');
    bad();
    offGood();
  });
});
