import { runGallery, type AttackResult } from '../src/lib/attackGallery';
import {
  applyRevealEvent,
  armedCards,
  revealPlan,
  MAX_VISIBLE_SIGNALS,
  REVEAL_TIMING,
  type RevealEvent,
  type RevealItem,
} from '../src/lib/attackReveal';

/** The staged reveal must not outlast a judge's patience  the whole run plus the confidence
 *  count-up has to fit inside the beat the demo script allows it. */
const MAX_RUN_MS = 8_000;

/** What the screen feeds the planner: the control first, then every attack. */
const CONTROL: RevealItem = { id: 'control', signalCount: 0 };
function itemsFor(results: AttackResult[]): RevealItem[] {
  return [CONTROL, ...results.map((r) => ({ id: r.id, signalCount: r.signals.length }))];
}

describe('revealPlan', () => {
  const results = runGallery();
  const items = itemsFor(results);
  const plan = revealPlan(items);

  it('gives every card a running event and a resolve event', () => {
    for (const item of items) {
      const mine = plan.events.filter((e) => e.attackId === item.id);
      expect(mine.filter((e) => e.kind === 'running')).toHaveLength(1);
      expect(mine.filter((e) => e.kind === 'resolve')).toHaveLength(1);
    }
  });

  it('resolves the control before any attack starts  the baseline exists first', () => {
    const controlResolve = plan.events.find((e) => e.attackId === 'control' && e.kind === 'resolve')!;
    for (const r of results) {
      const start = plan.events.find((e) => e.attackId === r.id && e.kind === 'running')!;
      expect(start.at).toBeGreaterThan(controlResolve.at);
    }
  });

  it('never schedules more signals than the card renders', () => {
    for (const r of results) {
      const signals = plan.events.filter((e) => e.attackId === r.id && e.kind === 'signal');
      expect(signals).toHaveLength(Math.min(r.signals.length, MAX_VISIBLE_SIGNALS));
      // 1-based and strictly increasing, so the card fills up one row at a time.
      expect(signals.map((e) => e.signalsShown)).toEqual(signals.map((_, i) => i + 1));
    }
  });

  it('gives the control no signal events  it has nothing fired against it', () => {
    expect(plan.events.filter((e) => e.attackId === 'control' && e.kind === 'signal')).toHaveLength(0);
  });

  it('orders each card running → signals → resolve', () => {
    for (const item of items) {
      const mine = plan.events.filter((e) => e.attackId === item.id);
      const running = mine.find((e) => e.kind === 'running')!;
      const resolve = mine.find((e) => e.kind === 'resolve')!;
      expect(running.at).toBeLessThan(resolve.at);
      for (const s of mine.filter((e) => e.kind === 'signal')) {
        expect(s.at).toBeGreaterThan(running.at);
        expect(s.at).toBeLessThan(resolve.at);
      }
    }
  });

  it('staggers the cards top-to-bottom', () => {
    const starts = items.map((i) => plan.events.find((e) => e.attackId === i.id && e.kind === 'running')!.at);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1]);
    expect(starts[0]).toBe(0);
    expect(starts[1] - starts[0]).toBe(REVEAL_TIMING.cardStaggerMs);
  });

  it('returns events sorted by time, ending at totalMs', () => {
    const times = plan.events.map((e) => e.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(plan.totalMs).toBe(Math.max(...times));
  });

  it('finishes the whole run inside the demo budget', () => {
    expect(plan.totalMs).toBeLessThan(MAX_RUN_MS);
  });

  it('is deterministic  same items, same plan', () => {
    expect(revealPlan(items)).toEqual(revealPlan(itemsFor(runGallery())));
  });

  it('handles an empty corpus without inventing events', () => {
    expect(revealPlan([])).toEqual({ events: [], totalMs: 0 });
  });
});

describe('card state machine', () => {
  const results = runGallery();
  const items = itemsFor(results);

  it('starts every card armed with no signals shown', () => {
    const armed = armedCards(items);
    expect(Object.keys(armed)).toEqual(items.map((i) => i.id));
    for (const id of Object.keys(armed)) expect(armed[id]).toEqual({ stage: 'armed', signalsShown: 0 });
  });

  it('walks one card armed → running → signals → resolved', () => {
    const target = results[0];
    const plan = revealPlan(items);
    let state = armedCards(items);
    for (const e of plan.events.filter((e) => e.attackId === target.id)) state = applyRevealEvent(state, e);

    expect(state[target.id]).toEqual({
      stage: 'resolved',
      signalsShown: Math.min(target.signals.length, MAX_VISIBLE_SIGNALS),
    });
  });

  it('leaves other cards untouched when one card advances', () => {
    const state = armedCards(items);
    const next = applyRevealEvent(state, { at: 0, attackId: results[0].id, kind: 'running' });
    for (const r of results.slice(1)) expect(next[r.id]).toEqual({ stage: 'armed', signalsShown: 0 });
    expect(state[results[0].id].stage).toBe('armed'); // input not mutated
  });

  it('resets signals when a card re-runs', () => {
    const id = results[0].id;
    let state = applyRevealEvent(armedCards(items), { at: 0, attackId: id, kind: 'signal', signalsShown: 3 });
    expect(state[id].signalsShown).toBe(3);
    state = applyRevealEvent(state, { at: 0, attackId: id, kind: 'running' });
    expect(state[id]).toEqual({ stage: 'running', signalsShown: 0 });
  });

  it('resolves every card when the full plan is applied', () => {
    const plan = revealPlan(items);
    const state = plan.events.reduce(applyRevealEvent, armedCards(items));
    for (const item of items) expect(state[item.id].stage).toBe('resolved');
  });

  it('tolerates an event for an unknown card', () => {
    const e: RevealEvent = { at: 0, attackId: 'nope', kind: 'resolve' };
    expect(applyRevealEvent({}, e)).toEqual({ nope: { stage: 'resolved', signalsShown: 0 } });
  });
});

describe('the reveal never changes the verdict', () => {
  it('shows exactly the verdicts the engine computed', () => {
    const results = runGallery();
    const items = itemsFor(results);
    const plan = revealPlan(items);
    const state = plan.events.reduce(applyRevealEvent, armedCards(items));
    // The headline the hero renders: resolved cards whose engine verdict is 'caught'.
    const caught = results.filter((r: AttackResult) => state[r.id].stage === 'resolved' && r.verdict === 'caught');
    expect(caught).toHaveLength(results.filter((r) => r.verdict === 'caught').length);
  });
});
