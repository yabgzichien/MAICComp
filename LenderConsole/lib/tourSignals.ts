// Judge guided tour  semantic signal bus (Interactive Console Tour, 2026-07-17). Ported
// from `PipComp/src/lib/tourSignals.ts`. A deliberately tiny listener set: the console emits
// named events unconditionally from its real handlers (one-liners, harmless when no tour is
// running); only the active tour driver ever subscribes. No React, no state library  pure
// enough to unit-test directly. The name union lives in `tourSteps.ts` (the registry is the
// source of truth for what the tour understands); this module only moves the names around.
import type { ConsoleTourSignal } from './tourSteps';

type Listener = (name: ConsoleTourSignal) => void;

const listeners = new Set<Listener>();

/** Subscribe to tour signals. Returns the unsubscribe function. */
export function onTourSignal(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fire-and-forget: safe to call whether or not a tour is running. A throwing listener
 *  never starves the rest (the tour must not be able to break the real flow around it). */
export function emitTourSignal(name: ConsoleTourSignal): void {
  Array.from(listeners).forEach((listener) => {
    try {
      listener(name);
    } catch {
      // Tour-side listener errors must never surface into the emitting flow.
    }
  });
}
