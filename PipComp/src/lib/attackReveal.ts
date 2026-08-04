// src/lib/attackReveal.ts
// Timing plan for the Attack Gallery's staged reveal. The gallery's verdicts are computed up front
// by attackGallery.ts; this only decides *when* each already-known fact appears on screen, so that
// a judge watches the defences fire instead of reading six finished cards. Pure and unit-tested:
// no timers, no UI, no randomness  the plan is a deterministic function of the results.
/** Signals shown per card. The screen slices with the same constant, so the plan cannot schedule
 *  a signal the card will not render. */
export const MAX_VISIBLE_SIGNALS = 4;

/** What the plan needs to know about one card. Deliberately structural rather than an
 *  `AttackResult`, so the control card  which has no signals and no verdict  rides the same
 *  machinery and resolves first, establishing the baseline before any attack runs. */
export interface RevealItem {
  id: string;
  signalCount: number;
}

export const REVEAL_TIMING = {
  /** Gap between one card starting and the next, so the run reads top-to-bottom. */
  cardStaggerMs: 650,
  /** How long a card sits on "Running…" before its first signal lands. */
  runningDwellMs: 480,
  /** Gap between consecutive signals firing on one card. */
  signalStaggerMs: 170,
  /** Beat between the last signal and the verdict stamp. */
  resolveHoldMs: 120,
} as const;

export type RevealEventKind = 'running' | 'signal' | 'resolve';

export interface RevealEvent {
  /** Milliseconds from the start of the run. */
  at: number;
  attackId: string;
  kind: RevealEventKind;
  /** How many signals are visible once this event fires. Only set on 'signal'. */
  signalsShown?: number;
}

export interface RevealPlan {
  /** Every event, ascending by `at`. */
  events: RevealEvent[];
  /** When the last card resolves. The caller adds its own count-up duration on top. */
  totalMs: number;
}

/** Build the ordered event plan for one run of the gallery. */
export function revealPlan(items: RevealItem[]): RevealPlan {
  const events: RevealEvent[] = [];
  let totalMs = 0;

  items.forEach((item, index) => {
    const start = index * REVEAL_TIMING.cardStaggerMs;
    events.push({ at: start, attackId: item.id, kind: 'running' });

    const signals = Math.min(item.signalCount, MAX_VISIBLE_SIGNALS);
    let at = start + REVEAL_TIMING.runningDwellMs;
    for (let s = 0; s < signals; s++) {
      events.push({ at, attackId: item.id, kind: 'signal', signalsShown: s + 1 });
      at += REVEAL_TIMING.signalStaggerMs;
    }

    at += REVEAL_TIMING.resolveHoldMs;
    events.push({ at, attackId: item.id, kind: 'resolve' });
    totalMs = Math.max(totalMs, at);
  });

  events.sort((a, b) => a.at - b.at);
  return { events, totalMs };
}

// ── Card state machine ────────────────────────────────────────────────────────
// The screen owns the timers; the transitions live here so they can be tested without one.

export type CardStage = 'armed' | 'running' | 'resolved';

export interface CardState {
  stage: CardStage;
  /** How many of the card's fired signals are currently visible. */
  signalsShown: number;
}

export type CardStates = Record<string, CardState>;

/** Every card back to its pre-run state. Also the reset used by Re-run. */
export function armedCards(items: RevealItem[]): CardStates {
  const out: CardStates = {};
  for (const item of items) out[item.id] = { stage: 'armed', signalsShown: 0 };
  return out;
}

/** Fold one event into the card states. Pure  same input, same output. */
export function applyRevealEvent(state: CardStates, event: RevealEvent): CardStates {
  const current = state[event.attackId] ?? { stage: 'armed', signalsShown: 0 };
  const next: CardState =
    event.kind === 'running'
      ? { stage: 'running', signalsShown: 0 }
      : event.kind === 'signal'
        ? { stage: 'running', signalsShown: event.signalsShown ?? current.signalsShown }
        : { stage: 'resolved', signalsShown: current.signalsShown };
  return { ...state, [event.attackId]: next };
}
